import type {
  AgentRuntimeConfig,
  AgentScenarioId,
  AgentUIMessage,
  WorkspaceContextItem,
} from "@/core/interfaces/agent";
import {
  isFileUIPart,
  isTextUIPart,
  type ChatTransport,
  type FileUIPart,
  type UIMessageChunk,
} from "ai";
import {
  createScenarioReadableStream,
  resolveScenarioRunner,
} from "./mockScenarios";

interface TransportRequestBody {
  scenarioHint?: AgentScenarioId;
  contextItems?: WorkspaceContextItem[];
}

function extractMessageText(message: AgentUIMessage | undefined): string {
  if (!message) return "";
  return message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function extractMessageFiles(message: AgentUIMessage | undefined): FileUIPart[] {
  if (!message) return [];
  return message.parts.filter(isFileUIPart);
}

function findLatestUserMessage(
  messages: AgentUIMessage[]
): AgentUIMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") {
      return messages[i];
    }
  }
  return undefined;
}

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class MockAgentTransport implements ChatTransport<AgentUIMessage> {
  private readonly getConfig: () => AgentRuntimeConfig;

  constructor(getConfig: () => AgentRuntimeConfig) {
    this.getConfig = getConfig;
  }

  async sendMessages(
    options: Parameters<ChatTransport<AgentUIMessage>["sendMessages"]>[0]
  ): Promise<ReadableStream<UIMessageChunk>> {
    const config = this.getConfig();
    const { trigger, messages, abortSignal, body } = options;

    if (abortSignal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    if (config.simulateError) {
      await abortableDelay(140, abortSignal);
      throw new Error(
        "Simulated agent transport error. Disable 'Simulate Error' in Agent Settings and click Retry."
      );
    }

    const lastMessage =
      messages.length > 0 ? messages[messages.length - 1] : undefined;
    const latestUser = findLatestUserMessage(messages);
    const typedBody = (body ?? {}) as TransportRequestBody;

    const context = {
      prompt: extractMessageText(latestUser),
      messages,
      lastMessage,
      trigger,
      config,
      attachments: extractMessageFiles(latestUser),
      contextItems: Array.isArray(typedBody.contextItems)
        ? typedBody.contextItems
        : [],
      scenarioHint: typedBody.scenarioHint,
    };

    const runner = resolveScenarioRunner(context);
    return createScenarioReadableStream(config, abortSignal, (builder) =>
      runner(context, builder)
    ) as unknown as ReadableStream<UIMessageChunk>;
  }

  async reconnectToStream(
    _options: Parameters<ChatTransport<AgentUIMessage>["reconnectToStream"]>[0]
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    return null;
  }
}
