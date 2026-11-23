import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import WebSocket from 'ws';
import { getMcpConfig } from './config.js';
import { GoClient } from './goClient.js';

const MESSAGE_SYNC = 0;

export type RoomTarget = {
  type: 'doc' | 'canvas';
  id: string;
  room: string;
};

export function parseRoomTarget(type: 'doc' | 'canvas', rawId: string): RoomTarget {
  const prefix = type === 'canvas' ? 'canvas-' : 'doc-';
  const id = rawId.startsWith(prefix) ? rawId.slice(prefix.length) : rawId;
  return {
    type,
    id,
    room: `${prefix}${id}`,
  };
}

function encodeSyncStep1(ydoc: Y.Doc): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(encoder, ydoc);
  return encoding.toUint8Array(encoder);
}

function encodeYjsUpdateFrame(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeUpdate(encoder, update);
  return encoding.toUint8Array(encoder);
}

async function connectAndRunOverWs<T>(
  target: RoomTarget,
  wsBaseUrl: string,
  yauthToken: string,
  timeoutMs: number,
  maxPayloadBytes: number,
  fn: (ydoc: Y.Doc) => Promise<{ result: T; mutated: boolean }> | { result: T; mutated: boolean },
): Promise<{ result: T; mutated: boolean; ydoc: Y.Doc }> {
  const ydoc = new Y.Doc();
  const base = wsBaseUrl.replace(/\/+$/, '');
  const wsUrl = `${base}/${encodeURIComponent(target.room)}?yauth=${encodeURIComponent(yauthToken)}`;

  return new Promise((resolve, reject) => {
    let settled = false;
    let synced = false;
    const ws = new WebSocket(wsUrl, { maxPayload: maxPayloadBytes });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          ws.close();
        } catch {
          // ignore
        }
        reject(new Error(`Yjs WebSocket sync timeout after ${timeoutMs}ms for ${target.room}`));
      }
    }, timeoutMs);

    const finish = (err?: Error, out?: { result: T; mutated: boolean }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // ignore
      }
      if (err) {
        reject(err);
      } else if (out) {
        resolve({ ...out, ydoc });
      }
    };

    const onLocalUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(encodeYjsUpdateFrame(update));
      }
    };
    ydoc.on('update', onLocalUpdate);

    ws.on('open', () => {
      ws.send(encodeSyncStep1(ydoc));
    });

    ws.on('message', async (data: WebSocket.RawData) => {
      try {
        const bytes =
          data instanceof ArrayBuffer
            ? new Uint8Array(data)
            : Array.isArray(data)
              ? new Uint8Array(Buffer.concat(data))
              : new Uint8Array(data);
        const decoder = decoding.createDecoder(bytes);
        const messageType = decoding.readVarUint(decoder);
        if (messageType !== MESSAGE_SYNC) return;

        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        const syncMsgType = syncProtocol.readSyncMessage(decoder, encoder, ydoc, 'remote');
        if (encoding.length(encoder) > 1 && ws.readyState === WebSocket.OPEN) {
          ws.send(encoding.toUint8Array(encoder));
        }

        if (!synced && syncMsgType === syncProtocol.messageYjsSyncStep2) {
          synced = true;
          const out = await fn(ydoc);
          if (out.mutated) {
            // Brief flush window so uWebSockets receives outgoing update frames before close.
            await new Promise((r) => setTimeout(r, 150));
          }
          finish(undefined, out);
        }
      } catch (err) {
        finish(err instanceof Error ? err : new Error(String(err)));
      }
    });

    ws.on('error', (err) => {
      finish(err instanceof Error ? err : new Error(String(err)));
    });

    ws.on('close', (code) => {
      if (!settled) {
        finish(new Error(`Yjs WebSocket closed before sync (code=${code})`));
      }
    });
  });
}

export interface LiveYDocResult<T> {
  result: T;
  mutated: boolean;
  transport: 'websocket' | 'snapshot-fallback';
  ydoc: Y.Doc;
}

export async function withLiveYDoc<T>(
  type: 'doc' | 'canvas',
  rawId: string,
  goClient: GoClient,
  fn: (ydoc: Y.Doc) => Promise<{ result: T; mutated: boolean }> | { result: T; mutated: boolean },
): Promise<LiveYDocResult<T>> {
  const cfg = getMcpConfig();
  const target = parseRoomTarget(type, rawId);

  let wsUrl = cfg.wsUrl;
  let yauthToken: string | null = null;

  try {
    const tokenRes = await goClient.mintToken(
      type === 'canvas'
        ? { canvas_id: target.id, access_mode: 'write' }
        : { doc_id: target.id, access_mode: 'write' },
    );
    yauthToken = tokenRes.token;
    if (tokenRes.url && !process.env.TOMO_WS_URL && !process.env.NODE_WS_URL) {
      wsUrl = tokenRes.url;
    }
  } catch {
    // Fallback to internal snapshot path below if token minting fails.
  }

  if (yauthToken) {
    try {
      const wsOut = await connectAndRunOverWs(
        target,
        wsUrl,
        yauthToken,
        cfg.wsSyncTimeoutMs,
        cfg.wsMaxPayloadBytes,
        fn,
      );
      if (wsOut.mutated) {
        await goClient
          .putInternalSnapshot(
            type,
            target.id,
            Y.encodeStateAsUpdateV2(wsOut.ydoc),
            Y.encodeStateVector(wsOut.ydoc),
          )
          .catch(() => { });
      }
      return {
        result: wsOut.result,
        mutated: wsOut.mutated,
        transport: 'websocket',
        ydoc: wsOut.ydoc,
      };
    } catch {
      // Fall through to direct snapshot fallback
    }
  }

  const ydoc = new Y.Doc();
  const snap = await goClient.getInternalSnapshot(type, target.id);
  if (snap && snap.byteLength > 0) {
    try {
      Y.applyUpdateV2(ydoc, snap);
    } catch {
      Y.applyUpdate(ydoc, snap);
    }
  }

  const out = await fn(ydoc);
  if (out.mutated) {
    await goClient.putInternalSnapshot(
      type,
      target.id,
      Y.encodeStateAsUpdateV2(ydoc),
      Y.encodeStateVector(ydoc),
    );
  }

  return {
    result: out.result,
    mutated: out.mutated,
    transport: 'snapshot-fallback',
    ydoc,
  };
}
