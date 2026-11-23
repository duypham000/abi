import type { AgentRuntimeConfig, AgentUIMessage } from "@/core/interfaces/agent";
import type { ChatTransport, UIMessageChunk } from "ai";
import { HttpAgentTransport } from "./httpAgentTransport";

export class DynamicAgentTransport implements ChatTransport<AgentUIMessage> {
  private readonly httpTransport: HttpAgentTransport;

  constructor(getConfig: () => AgentRuntimeConfig) {
    this.httpTransport = new HttpAgentTransport(getConfig);
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
  getConfig: () => AgentRuntimeConfig
): ChatTransport<AgentUIMessage> {
  return new DynamicAgentTransport(getConfig);
}
