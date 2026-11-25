import type { AgentRuntimeConfig, AgentUIMessage } from "@/core/interfaces/agent";
import type { ChatTransport, UIMessageChunk } from "ai";
import {
  HttpAgentTransport,
  type SessionMetaGetter,
} from "./httpAgentTransport";

export class DynamicAgentTransport implements ChatTransport<AgentUIMessage> {
  private readonly httpTransport: HttpAgentTransport;

  constructor(
    getConfig: () => AgentRuntimeConfig,
    getSessionMeta?: SessionMetaGetter
  ) {
    this.httpTransport = new HttpAgentTransport(getConfig, getSessionMeta);
  }

  sendMessages(
    options: Parameters<ChatTransport<AgentUIMessage>["sendMessages"]>[0]
  ): Promise<ReadableStream<UIMessageChunk>> {
    return this.httpTransport.sendMessages(options);
  }

  reconnectToStream(
    options: Parameters<ChatTransport<AgentUIMessage>["reconnectToStream"]>[0]
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    return this.httpTransport.reconnectToStream(options);
  }
}

export function createAgentTransport(
  getConfig: () => AgentRuntimeConfig,
  getSessionMeta?: SessionMetaGetter
): ChatTransport<AgentUIMessage> {
  return new DynamicAgentTransport(getConfig, getSessionMeta);
}
