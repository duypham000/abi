import {
  normalizeAgentMode,
  type AgentRuntimeConfig,
  type AgentUIMessage,
} from "@/core/interfaces/agent";
import { getAccessToken } from "@/infrastructure/tauri/authBridge";
import { resolveAgentApiEndpoint } from "../api/agentBackendApi";
import {
  DefaultChatTransport,
  type ChatTransport,
  type UIMessageChunk,
} from "ai";

function resolveApiUrl(endpoint: string): string {
  return resolveAgentApiEndpoint(endpoint);
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

export type SessionMetaGetter = (chatId: string) =>
  | {
      mode?: string;
      modelId?: string;
    }
  | undefined;

export class HttpAgentTransport implements ChatTransport<AgentUIMessage> {
  private readonly getConfig: () => AgentRuntimeConfig;
  private readonly getSessionMeta?: SessionMetaGetter;

  constructor(
    getConfig: () => AgentRuntimeConfig,
    getSessionMeta?: SessionMetaGetter
  ) {
    this.getConfig = getConfig;
    this.getSessionMeta = getSessionMeta;
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
        const sessionMeta = this.getSessionMeta?.(reqOptions.id);
        const resolvedMode = normalizeAgentMode(
          sessionMeta?.mode ?? currentConfig.mode
        );
        const resolvedModelId =
          sessionMeta?.modelId !== undefined
            ? sessionMeta.modelId
            : currentConfig.modelId;
        const extraBody =
          reqOptions.body && typeof reqOptions.body === "object"
            ? reqOptions.body
            : {};
        const reqHeaders = normalizeHeaders(reqOptions.headers);
        if (reqOptions.id && reqOptions.id.trim()) {
          reqHeaders["X-Conversation-Id"] = reqOptions.id.trim();
        }

        return {
          api: resolveApiUrl(currentConfig.apiEndpoint),
          headers: reqHeaders,
          credentials: reqOptions.credentials,
          body: {
            ...extraBody,
            id: reqOptions.id,
            conversationId: reqOptions.id,
            messages: reqOptions.messages,
            trigger: reqOptions.trigger,
            messageId: reqOptions.messageId,
            requestMetadata: reqOptions.requestMetadata,
            agentConfig: {
              modelId: resolvedModelId,
              mode: resolvedMode,
              reasoningEffort:
                currentConfig.reasoningEffort === "off"
                  ? ""
                  : currentConfig.reasoningEffort,
              harnessId: currentConfig.harnessId,
              systemPromptId: currentConfig.systemPromptId,
              systemPromptAppend: currentConfig.systemPromptAppend,
              replaceDefaultRule: currentConfig.replaceDefaultRule,
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
