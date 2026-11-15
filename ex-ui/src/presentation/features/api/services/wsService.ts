let ws: WebSocket | null = null;

export const wsService = {
  connect(
    url: string,
    protocols: string[],
    callbacks: {
      onOpen: () => void;
      onMessage: (data: string) => void;
      onClose: () => void;
      onError: (e: Event) => void;
    }
  ) {
    wsService.disconnect();
    const validProtocols = protocols.filter(Boolean);
    ws = validProtocols.length
      ? new WebSocket(url, validProtocols)
      : new WebSocket(url);
    ws.onopen = callbacks.onOpen;
    ws.onmessage = (e) => callbacks.onMessage(String(e.data));
    ws.onclose = callbacks.onClose;
    ws.onerror = callbacks.onError;
  },

  send(msg: string) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  },

  disconnect() {
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.close();
      ws = null;
    }
  },
};
