import type {
  AgentMessageMetadata,
  AgentRuntimeConfig,
  AgentScenarioId,
  AgentToolName,
  AgentUIDataTypes,
  AgentUIMessage,
  AgentUIMessageChunk,
  AgentUITools,
  MockSpeed,
  WorkspaceContextItem,
} from "@/core/interfaces/agent";
import type { FileUIPart, FinishReason, LanguageModelUsage } from "ai";

export const MOCK_SPEED_DELAY_MS: Record<MockSpeed, number> = {
  instant: 0,
  fast: 18,
  realistic: 45,
  slow: 110,
};

export interface StreamScenarioContext {
  prompt: string;
  messages: AgentUIMessage[];
  lastMessage?: AgentUIMessage;
  trigger: "submit-message" | "regenerate-message";
  config: AgentRuntimeConfig;
  attachments: FileUIPart[];
  contextItems: WorkspaceContextItem[];
  scenarioHint?: AgentScenarioId;
}

export function utf8ToBase64(text: string): string {
  if (typeof TextEncoder !== "undefined") {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  return btoa(text);
}

export function getProviderForModel(modelId: string): string {
  if (modelId.startsWith("claude")) return "anthropic";
  if (modelId.startsWith("gemini")) return "google";
  if (modelId.startsWith("deepseek")) return "deepseek";
  if (modelId.startsWith("qwen")) return "alibaba";
  return "openai";
}

export function createMockUsage(
  inputTokens: number,
  outputTokens: number,
  reasoningTokens = 0,
  cacheReadTokens = 0
): LanguageModelUsage {
  const noCacheTokens = Math.max(0, inputTokens - cacheReadTokens);
  const textTokens = Math.max(0, outputTokens - reasoningTokens);
  return {
    inputTokens,
    inputTokenDetails: {
      noCacheTokens,
      cacheReadTokens,
      cacheWriteTokens: 0,
    },
    outputTokens,
    outputTokenDetails: {
      textTokens,
      reasoningTokens,
    },
    totalTokens: inputTokens + outputTokens,
    cachedInputTokens: cacheReadTokens,
    reasoningTokens,
  };
}

function createAbortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

function splitIntoStreamChunks(text: string, wordsPerChunk: number): string[] {
  if (!text) return [];
  const tokens = text.match(/\S+\s*|\s+/g);
  if (!tokens || tokens.length === 0) return [text];

  const chunks: string[] = [];
  for (let i = 0; i < tokens.length; i += wordsPerChunk) {
    chunks.push(tokens.slice(i, i + wordsPerChunk).join(""));
  }
  return chunks;
}

export class MockStreamBuilder {
  private readonly controller: ReadableStreamDefaultController<AgentUIMessageChunk>;
  private readonly baseDelayMs: number;
  private readonly streamSmoothly: boolean;
  private readonly abortSignal?: AbortSignal;
  private readonly config: AgentRuntimeConfig;
  private readonly startTimestamp = Date.now();
  private seq = 0;
  private cancelled = false;

  constructor(options: {
    controller: ReadableStreamDefaultController<AgentUIMessageChunk>;
    config: AgentRuntimeConfig;
    abortSignal?: AbortSignal;
  }) {
    this.controller = options.controller;
    this.config = options.config;
    this.baseDelayMs = MOCK_SPEED_DELAY_MS[options.config.mockSpeed] ?? 18;
    this.streamSmoothly = options.config.streamSmoothly;
    this.abortSignal = options.abortSignal;
  }

  markCancelled(): void {
    this.cancelled = true;
  }

  private nextId(prefix: string): string {
    this.seq += 1;
    const rand = Math.random().toString(36).slice(2, 7);
    return `${prefix}-${Date.now().toString(36)}-${rand}-${this.seq}`;
  }

  private ensureActive(): void {
    if (this.cancelled) {
      throw createAbortError();
    }
    if (this.abortSignal?.aborted) {
      throw createAbortError();
    }
  }

  isToolEnabled(toolName: AgentToolName): boolean {
    const val = this.config.toolPermissions[toolName];
    return val !== false;
  }

  elapsedMs(): number {
    return Math.max(120, Date.now() - this.startTimestamp);
  }

  async delay(multiplier = 1): Promise<void> {
    this.ensureActive();
    const ms = Math.round(this.baseDelayMs * multiplier);
    if (ms <= 0) return;

    await new Promise<void>((resolve, reject) => {
      if (this.cancelled || this.abortSignal?.aborted) {
        reject(createAbortError());
        return;
      }

      const onAbort = () => {
        clearTimeout(timer);
        reject(createAbortError());
      };

      const timer = setTimeout(() => {
        this.abortSignal?.removeEventListener("abort", onAbort);
        if (this.cancelled || this.abortSignal?.aborted) {
          reject(createAbortError());
          return;
        }
        resolve();
      }, ms);

      this.abortSignal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  enqueue(chunk: AgentUIMessageChunk): void {
    this.ensureActive();
    this.controller.enqueue(chunk);
  }

  start(messageId?: string, messageMetadata?: AgentMessageMetadata): void {
    this.enqueue({
      type: "start",
      ...(messageId !== undefined ? { messageId } : {}),
      ...(messageMetadata !== undefined ? { messageMetadata } : {}),
    });
  }

  async step(fn: () => Promise<void>): Promise<void> {
    this.enqueue({ type: "start-step" });
    await fn();
    this.enqueue({ type: "finish-step" });
  }

  async reasoning(text: string, id?: string): Promise<void> {
    if (!text.trim() || this.config.reasoningEffort === "off") return;
    const partId = id ?? this.nextId("reason");
    this.enqueue({ type: "reasoning-start", id: partId });

    const chunks =
      this.baseDelayMs === 0 || !this.streamSmoothly
        ? [text]
        : splitIntoStreamChunks(text, 4);

    for (const chunk of chunks) {
      this.enqueue({ type: "reasoning-delta", id: partId, delta: chunk });
      if (chunks.length > 1) {
        await this.delay(0.75);
      }
    }
    this.enqueue({ type: "reasoning-end", id: partId });
  }

  async text(markdown: string, id?: string): Promise<void> {
    if (!markdown) return;
    const partId = id ?? this.nextId("text");
    this.enqueue({ type: "text-start", id: partId });

    const chunks =
      this.baseDelayMs === 0 || !this.streamSmoothly
        ? [markdown]
        : splitIntoStreamChunks(markdown, 3);

    for (const chunk of chunks) {
      this.enqueue({ type: "text-delta", id: partId, delta: chunk });
      if (chunks.length > 1) {
        await this.delay(0.8);
      }
    }
    this.enqueue({ type: "text-end", id: partId });
  }

  data<K extends keyof AgentUIDataTypes>(
    type: K,
    data: AgentUIDataTypes[K],
    id?: string,
    transient?: boolean
  ): void {
    const chunk = {
      type: `data-${type}`,
      data,
      ...(id !== undefined ? { id } : {}),
      ...(transient !== undefined ? { transient } : {}),
    } as AgentUIMessageChunk;
    this.enqueue(chunk);
  }

  async toolCompleted<T extends keyof AgentUITools>(
    toolName: T,
    input: AgentUITools[T]["input"],
    output: AgentUITools[T]["output"],
    title?: string,
    toolCallId?: string
  ): Promise<string> {
    const id = toolCallId ?? this.nextId("tc");
    this.enqueue({
      type: "tool-input-start",
      toolCallId: id,
      toolName: String(toolName),
      ...(title ? { title } : {}),
    });
    await this.delay(1);
    this.enqueue({
      type: "tool-input-available",
      toolCallId: id,
      toolName: String(toolName),
      input,
      ...(title ? { title } : {}),
    });
    await this.delay(3);
    this.enqueue({
      type: "tool-output-available",
      toolCallId: id,
      output,
    });
    return id;
  }

  async toolError<T extends keyof AgentUITools>(
    toolName: T,
    input: AgentUITools[T]["input"],
    errorText: string,
    title?: string,
    toolCallId?: string
  ): Promise<string> {
    const id = toolCallId ?? this.nextId("tc");
    this.enqueue({
      type: "tool-input-start",
      toolCallId: id,
      toolName: String(toolName),
      ...(title ? { title } : {}),
    });
    await this.delay(1);
    this.enqueue({
      type: "tool-input-available",
      toolCallId: id,
      toolName: String(toolName),
      input,
      ...(title ? { title } : {}),
    });
    await this.delay(3);
    this.enqueue({
      type: "tool-output-error",
      toolCallId: id,
      errorText,
    });
    return id;
  }

  async toolNeedsApproval<T extends keyof AgentUITools>(
    toolName: T,
    input: AgentUITools[T]["input"],
    approvalId: string,
    title?: string,
    toolCallId?: string
  ): Promise<string> {
    const id = toolCallId ?? this.nextId("tc");
    this.enqueue({
      type: "tool-input-available",
      toolCallId: id,
      toolName: String(toolName),
      input,
      ...(title ? { title } : {}),
    });
    await this.delay(1.5);
    this.enqueue({
      type: "tool-approval-request",
      approvalId,
      toolCallId: id,
    });
    return id;
  }

  async toolClientPending<T extends keyof AgentUITools>(
    toolName: T,
    input: AgentUITools[T]["input"],
    title?: string,
    toolCallId?: string
  ): Promise<string> {
    const id = toolCallId ?? this.nextId("tc");
    this.enqueue({
      type: "tool-input-available",
      toolCallId: id,
      toolName: String(toolName),
      input,
      ...(title ? { title } : {}),
    });
    return id;
  }

  toolOutputAvailable(toolCallId: string, output: unknown): void {
    this.enqueue({
      type: "tool-output-available",
      toolCallId,
      output,
    });
  }

  toolOutputDenied(toolCallId: string): void {
    this.enqueue({
      type: "tool-output-denied",
      toolCallId,
    });
  }

  sourceUrl(sourceId: string, url: string, title?: string): void {
    this.enqueue({
      type: "source-url",
      sourceId,
      url,
      ...(title ? { title } : {}),
    });
  }

  sourceDoc(
    sourceId: string,
    mediaType: string,
    title: string,
    filename?: string
  ): void {
    this.enqueue({
      type: "source-document",
      sourceId,
      mediaType,
      title,
      ...(filename ? { filename } : {}),
    });
  }

  file(url: string, mediaType: string): void {
    this.enqueue({
      type: "file",
      url,
      mediaType,
    });
  }

  messageMetadata(messageMetadata: AgentMessageMetadata): void {
    this.enqueue({
      type: "message-metadata",
      messageMetadata,
    });
  }

  error(errorText: string): void {
    this.enqueue({
      type: "error",
      errorText,
    });
  }

  finish(
    messageMetadata?: AgentMessageMetadata,
    finishReason: FinishReason = "stop"
  ): void {
    this.enqueue({
      type: "finish",
      finishReason,
      ...(messageMetadata !== undefined ? { messageMetadata } : {}),
    });
  }
}

export function createScenarioReadableStream(
  config: AgentRuntimeConfig,
  abortSignal: AbortSignal | undefined,
  run: (builder: MockStreamBuilder) => Promise<void>
): ReadableStream<AgentUIMessageChunk> {
  return new ReadableStream<AgentUIMessageChunk>({
    start(controller) {
      if (abortSignal?.aborted) {
        controller.error(createAbortError());
        return;
      }

      let closed = false;
      const builder = new MockStreamBuilder({
        controller,
        config,
        abortSignal,
      });

      const onAbort = () => {
        builder.markCancelled();
        if (!closed) {
          closed = true;
          controller.error(createAbortError());
        }
      };

      abortSignal?.addEventListener("abort", onAbort, { once: true });

      run(builder)
        .then(() => {
          if (!closed) {
            closed = true;
            controller.close();
          }
        })
        .catch((err) => {
          if (!closed) {
            closed = true;
            controller.error(err);
          }
        })
        .finally(() => {
          abortSignal?.removeEventListener("abort", onAbort);
        });
    },
    cancel() {
      // cancellation is handled cleanly via closed state
    },
  });
}
