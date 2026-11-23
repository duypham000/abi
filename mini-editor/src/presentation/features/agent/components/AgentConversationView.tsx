import {
  Conversation,
  ConversationContent,
  ConversationDownload,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  AgentPersonaState,
  AgentUIMessage,
  PersonaVariant,
} from "@/core/interfaces/agent";
import type { AgentBackendStatus } from "@/infrastructure/agent";
import type { ChatStatus } from "ai";
import {
  AlertCircleIcon,
  FileTextIcon,
  FolderSearchIcon,
  GitBranchIcon,
  RotateCwIcon,
  ShapesIcon,
  XIcon,
} from "lucide-react";
import type { MessageBranchInfo } from "../hooks/useAgentRuntime";
import { AgentPersonaOrb } from "./AgentErrorBoundary";
import { AgentMessageItem } from "./AgentMessageItem";

export interface AgentConversationViewProps {
  sessionTitle: string;
  messages: AgentUIMessage[];
  status: ChatStatus;
  error: Error | undefined;
  personaState: AgentPersonaState;
  personaVariant: PersonaVariant;
  showTimestamps: boolean;
  backendStatus: AgentBackendStatus | null;
  backendError: string | null;
  getBranchInfoForMessage: (messageId: string) => MessageBranchInfo | null;
  onClearError: () => void;
  onRetryLast: () => void;
  onApproveTool: (approvalId: string, reason?: string) => void | Promise<void>;
  onDenyTool: (approvalId: string, reason?: string) => void | Promise<void>;
  onRegenerate: (messageId: string) => void | Promise<void>;
  onEditUserMessage: (messageId: string, newText: string) => void | Promise<void>;
  onSwitchBranch: (anchorKey: string, nextIndex: number) => void;
  onFeedback: (messageId: string, feedback: "up" | "down" | null) => void;
  onSendFollowUp: (text: string) => void;
  onInsertToDoc?: (markdown: string) => void;
}

const STARTER_PROMPTS = [
  {
    title: "Kiểm tra Workspace",
    prompt: "Kiểm tra cấu trúc workspace hiện tại và tóm tắt các tài liệu quan trọng.",
    icon: FolderSearchIcon,
  },
  {
    title: "Soạn thảo Tomo Doc",
    prompt: "Giúp tôi tạo một tài liệu Tomo Doc mới với cấu trúc rõ ràng.",
    icon: FileTextIcon,
  },
  {
    title: "Vẽ sơ đồ Canvas",
    prompt: "Tạo sơ đồ kiến trúc hệ thống lên Excalidraw Canvas.",
    icon: ShapesIcon,
  },
  {
    title: "Kiểm tra trạng thái",
    prompt: "Kiểm tra trạng thái Git và các thay đổi hiện tại trong workspace.",
    icon: GitBranchIcon,
  },
];

function buildMarkdownFilename(title: string): string {
  const safe = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${safe || "tomo-agent-chat"}.md`;
}

export function AgentConversationView({
  sessionTitle,
  messages,
  status,
  error,
  personaState,
  personaVariant,
  showTimestamps,
  backendStatus,
  backendError,
  getBranchInfoForMessage,
  onClearError,
  onRetryLast,
  onApproveTool,
  onDenyTool,
  onRegenerate,
  onEditUserMessage,
  onSwitchBranch,
  onFeedback,
  onSendFollowUp,
  onInsertToDoc,
}: AgentConversationViewProps) {
  const isStreaming = status === "streaming";
  const isSubmitted = status === "submitted";

  return (
    <Conversation className="min-h-0 flex-1">
      {messages.length > 0 && (
        <ConversationDownload
          aria-label="Download conversation markdown"
          className="top-3 right-3 z-10 size-8 bg-background/90 shadow-xs backdrop-blur-xs"
          filename={buildMarkdownFilename(sessionTitle)}
          messages={messages}
          title="Export conversation (.md)"
        />
      )}

      <ConversationContent className="mx-auto w-full max-w-4xl min-w-0 gap-4 px-2.5 py-3">
        {messages.length === 0 ? (
          <ConversationEmptyState className="min-h-[260px] px-1 py-3">
            <div className="mx-auto flex w-full max-w-2xl min-w-0 flex-col items-center gap-4">
              <div className="flex flex-col items-center gap-2 text-center">
                <AgentPersonaOrb
                  size="md"
                  state={personaState}
                  variant={personaVariant}
                />
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    <h2 className="text-sm font-semibold tracking-tight text-foreground">
                      Tomo GemOps Agent
                    </h2>
                    <Badge
                      className="px-1.5 py-0 text-[10px]"
                      variant={backendStatus ? "default" : "destructive"}
                    >
                      {backendStatus
                        ? `${backendStatus.state} · ${backendStatus.activeHarnessId}`
                        : "Offline"}
                    </Badge>
                  </div>
                  <p className="mx-auto max-w-lg text-[11px] leading-relaxed text-muted-foreground">
                    Gõ{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                      @
                    </code>{" "}
                    để đính kèm Docs/Canvases, hoặc{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                      /compact
                    </code>{" "}
                    để tóm tắt &amp; giải phóng phiên GemOps.
                  </p>
                  {backendError && (
                    <p className="text-[11px] text-destructive">
                      {backendError}
                    </p>
                  )}
                </div>
              </div>

              <div className="agent-scenario-grid">
                {STARTER_PROMPTS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      className="group flex min-w-0 flex-col justify-between gap-1.5 rounded-lg border border-border bg-card p-2.5 text-left shadow-xs transition-all hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      key={item.title}
                      onClick={() => onSendFollowUp(item.prompt)}
                      type="button"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <Icon className="size-3.5" />
                        </span>
                        <div className="truncate text-xs font-semibold text-foreground">
                          {item.title}
                        </div>
                      </div>
                      <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                        {item.prompt}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </ConversationEmptyState>
        ) : (
          <>
            {messages.map((message, index) => (
              <AgentMessageItem
                branchInfo={getBranchInfoForMessage(message.id)}
                isLastMessage={index === messages.length - 1}
                isStreaming={isStreaming && index === messages.length - 1}
                key={message.id}
                message={message}
                onApproveTool={onApproveTool}
                onDenyTool={onDenyTool}
                onEditUserMessage={onEditUserMessage}
                onFeedback={onFeedback}
                onInsertToDoc={onInsertToDoc}
                onRegenerate={onRegenerate}
                onSendFollowUp={onSendFollowUp}
                onSwitchBranch={onSwitchBranch}
                showTimestamp={showTimestamps}
              />
            ))}

            {isSubmitted && (
              <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                <AgentPersonaOrb
                  size="xs"
                  state="thinking"
                  variant={personaVariant}
                />
                <Shimmer className="text-xs font-medium" duration={1.8}>
                  Sending prompt to GemOps...
                </Shimmer>
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircleIcon className="size-4" />
                <AlertTitle className="text-xs font-semibold">
                  GemOps Agent Error
                </AlertTitle>
                <AlertDescription className="mt-1 flex w-full flex-col gap-2 text-xs">
                  <p>{error.message || "The agent stream encountered an error."}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      className="h-7 gap-1 text-xs"
                      onClick={onRetryLast}
                      size="xs"
                      type="button"
                      variant="outline"
                    >
                      <RotateCwIcon className="size-3" />
                      Retry
                    </Button>
                    <Button
                      className="h-7 gap-1 text-xs"
                      onClick={onClearError}
                      size="xs"
                      type="button"
                      variant="ghost"
                    >
                      <XIcon className="size-3" />
                      Clear
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </>
        )}
      </ConversationContent>

      <ConversationScrollButton aria-label="Scroll to latest message" />
    </Conversation>
  );
}
