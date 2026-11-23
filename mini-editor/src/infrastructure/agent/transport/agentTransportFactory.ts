import type { AgentRuntimeConfig, AgentUIMessage } from "@/core/interfaces/agent";
import type { ChatTransport, UIMessageChunk } from "ai";
import { HttpAgentTransport } from "./httpAgentTransport";
import { MockAgentTransport } from "./mockAgentTransport";

export class DynamicAgentTransport implements ChatTransport<AgentUIMessage> {
  private readonly getConfig: () => AgentRuntimeConfig;
  private readonly mockTransport: MockAgentTransport;
  private readonly httpTransport: HttpAgentTransport;

  constructor(getConfig: () => AgentRuntimeConfig) {
    this.getConfig = getConfig;
    this.mockTransport = new MockAgentTransport(getConfig);
    this.httpTransport = new HttpAgentTransport(getConfig);
  }

  private resolveTransport(): ChatTransport<AgentUIMessage> {
    return this.getConfig().transportMode === "http"
      ? this.httpTransport
      : this.mockTransport;
  }

  sendMessages(
    options: Parameters<ChatTransport<AgentUIMessage>["sendMessages"]>[0]
  ): Promise<ReadableStream<UIMessageChunk>> {
    return this.resolveTransport().sendMessages(options);
  }

  reconnectToStream(
    options: Parameters<ChatTransport<AgentUIMessage>["reconnectToStream"]>[0]
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    return this.resolveTransport().reconnectToStream(options);
  }
}

export function createAgentTransport(
  getConfig: () => AgentRuntimeConfig
): ChatTransport<AgentUIMessage> {
  return new DynamicAgentTransport(getConfig);
}
