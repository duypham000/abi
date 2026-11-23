import type { AgentRuntimeConfig, AgentUIMessage } from "@/core/interfaces/agent";
import { getAccessToken } from "@/infrastructure/tauri/authBridge";
import {
  DefaultChatTransport,
  type ChatTransport,
  type UIMessageChunk,
} from "ai";

function resolveApiUrl(endpoint: string): string {
  const trimmed = endpoint.trim();
  return trimmed.length > 0 ? trimmed : "/api/v1/agent/chat";
}

function normalizeHeaders(
  input: HeadersInit | undefined
): Record<string, string> {
  if (!input) return {};
  if (input instanceof Headers) {
    const out: Record<string, string> = {};
    input.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(input)) {
    const out: Record<string, string> = {};
    for (const [key, value] of input) {
      out[key] = value;
    }
    return out;
  }
  return { ...input };
}

export class HttpAgentTransport implements ChatTransport<AgentUIMessage> {
  private readonly getConfig: () => AgentRuntimeConfig;

  constructor(getConfig: () => AgentRuntimeConfig) {
    this.getConfig = getConfig;
  }

  private createUnderlyingTransport(): DefaultChatTransport<AgentUIMessage> {
    const config = this.getConfig();
    const api = resolveApiUrl(config.apiEndpoint);

    return new DefaultChatTransport<AgentUIMessage>({
      api,
      headers: async () => {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        const token = await getAccessToken();
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }
        if (config.apiKey && config.apiKey.trim()) {
          headers["X-Agent-Api-Key"] = config.apiKey.trim();
        }
        return headers;
      },
      prepareSendMessagesRequest: async (reqOptions) => {
        const currentConfig = this.getConfig();
        const extraBody =
          reqOptions.body && typeof reqOptions.body === "object"
            ? reqOptions.body
            : {};

        return {
          api: resolveApiUrl(currentConfig.apiEndpoint),
          headers: normalizeHeaders(reqOptions.headers),
          credentials: reqOptions.credentials,
          body: {
            ...extraBody,
            id: reqOptions.id,
            messages: reqOptions.messages,
            trigger: reqOptions.trigger,
            messageId: reqOptions.messageId,
            requestMetadata: reqOptions.requestMetadata,
            agentConfig: {
              modelId: currentConfig.modelId,
              mode: currentConfig.mode,
              reasoningEffort: currentConfig.reasoningEffort,
              harnessId: currentConfig.harnessId,
              systemPromptAppend: currentConfig.systemPromptAppend,
              approvalPolicy: currentConfig.approvalPolicy,
              toolPermissions: currentConfig.toolPermissions,
            },
          },
        };
      },
    });
  }

  async sendMessages(
    options: Parameters<ChatTransport<AgentUIMessage>["sendMessages"]>[0]
  ): Promise<ReadableStream<UIMessageChunk>> {
    const transport = this.createUnderlyingTransport();
    return transport.sendMessages(options);
  }

  async reconnectToStream(
    options: Parameters<ChatTransport<AgentUIMessage>["reconnectToStream"]>[0]
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    const transport = this.createUnderlyingTransport();
    return transport.reconnectToStream(options);
  }
}
