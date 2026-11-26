import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Attachment,
  AttachmentHoverCard,
  AttachmentHoverCardContent,
  AttachmentHoverCardTrigger,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
} from "@/components/ai-elements/attachments";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageBranch,
  MessageBranchContent,
  MessageBranchNext,
  MessageBranchPage,
  MessageBranchPrevious,
  MessageBranchSelector,
  MessageContent,
  MessageToolbar,
} from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import type {
  AgentUIMessage,
  AgentUIMessagePart,
} from "@/core/interfaces/agent";
import {
  insertMarkdownSnippet,
  speakText,
  stopSpeaking,
} from "@/infrastructure/agent";
import { cn } from "@/lib/utils";
import {
  getToolName,
  isTextUIPart,
  isToolUIPart,
  type FileUIPart,
  type SourceDocumentUIPart,
  type SourceUrlUIPart,
} from "ai";
import {
  CheckIcon,
  CopyIcon,
  FilePlus2Icon,
  PencilIcon,
  RefreshCwIcon,
  SendIcon,
  SquareIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  Volume2Icon,
  XIcon,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { MessageBranchInfo } from "../hooks/useAgentRuntime";
import { AgentErrorBoundary } from "./AgentErrorBoundary";
import { AgentPartRenderer } from "./parts/AgentPartRenderer";
import { MessageSourcesBlock } from "./parts/RichMediaPartsRenderer";

export interface AgentMessageItemProps {
  message: AgentUIMessage;
  isLastMessage: boolean;
  isStreaming: boolean;
  hasFollowingUserMessage?: boolean;
  showTimestamp?: boolean;
  branchInfo: MessageBranchInfo | null;
  onApproveTool: (approvalId: string, reason?: string) => void;
  onDenyTool: (approvalId: string, reason?: string) => void;
  onRegenerate: (messageId: string) => void;
  onEditUserMessage: (messageId: string, newText: string) => void;
  onSwitchBranch: (anchorKey: string, nextIndex: number) => void;
  onFeedback: (messageId: string, feedback: "up" | "down" | null) => void;
  onSendFollowUp: (prompt: string) => void;
  onInsertToDoc?: (markdown: string) => void;
}

function formatMessageTime(iso?: string): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function extractPlainText(parts: AgentUIMessagePart[]): string {
  return parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("\n\n")
    .trim();
}

function isSourcePart(
  part: AgentUIMessagePart
): part is SourceUrlUIPart | SourceDocumentUIPart {
  return part.type === "source-url" || part.type === "source-document";
}

function isFilePart(part: AgentUIMessagePart): part is FileUIPart {
  return part.type === "file";
}

function renderWithBranchWrapper({
  branchInfo,
  onSwitchBranch,
  content,
  toolbar,
}: {
  branchInfo: MessageBranchInfo | null;
  onSwitchBranch: (anchorKey: string, nextIndex: number) => void;
  content: React.ReactNode;
  toolbar: React.ReactNode;
}): React.ReactNode {
  if (!branchInfo || branchInfo.count <= 1) {
    return (
      <>
        {content}
        {toolbar}
      </>
    );
  }

  return (
    <MessageBranch
      defaultBranch={branchInfo.currentIndex}
      key={`${branchInfo.anchorKey}:${branchInfo.currentIndex}:${branchInfo.count}`}
      onBranchChange={(nextIndex) =>
        onSwitchBranch(branchInfo.anchorKey, nextIndex)
      }
    >
      <MessageBranchContent>
        {Array.from({ length: branchInfo.count }, (_, idx) =>
          idx === branchInfo.currentIndex ? (
            <div key={`${branchInfo.anchorKey}-branch-${idx}`}>{content}</div>
          ) : (
            <div key={`${branchInfo.anchorKey}-branch-${idx}`} />
          )
        )}
      </MessageBranchContent>
      {toolbar}
    </MessageBranch>
  );
}

export const AgentMessageItem = memo(function AgentMessageItem({
  message,
  isLastMessage,
  isStreaming,
  hasFollowingUserMessage,
  showTimestamp = false,
  branchInfo,
  onApproveTool,
  onDenyTool,
  onRegenerate,
  onEditUserMessage,
  onSwitchBranch,
  onFeedback,
  onSendFollowUp,
  onInsertToDoc,
}: AgentMessageItemProps) {
  const isUser = message.role === "user";
  const isActiveStreaming = isLastMessage && isStreaming;

  const plainText = useMemo(
    () => extractPlainText(message.parts),
    [message.parts]
  );

  const fileParts = useMemo(
    () => message.parts.filter(isFilePart),
    [message.parts]
  );

  const sourceParts = useMemo(
    () => message.parts.filter(isSourcePart),
    [message.parts]
  );

  const lastUpdateStepsIdx = useMemo(() => {
    for (let i = message.parts.length - 1; i >= 0; i -= 1) {
      const part = message.parts[i];
      if (isToolUIPart(part) && getToolName(part) === "update_steps") {
        return i;
      }
    }
    return -1;
  }, [message.parts]);

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(plainText);
  const [copied, setCopied] = useState(false);
  const [inserted, setInserted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isSpeakingRef = useRef(false);
  const copyTimerRef = useRef<number | null>(null);
  const insertTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isEditing) {
      setEditText(plainText);
    }
  }, [plainText, isEditing]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      if (insertTimerRef.current !== null) {
        window.clearTimeout(insertTimerRef.current);
      }
      if (isSpeakingRef.current) {
        stopSpeaking();
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    if (
      !plainText ||
      typeof navigator === "undefined" ||
      !navigator.clipboard?.writeText
    ) {
      return;
    }
    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  }, [plainText]);

  const handleInsert = useCallback(async () => {
    if (!plainText) return;
    if (onInsertToDoc) {
      onInsertToDoc(plainText);
    } else {
      await insertMarkdownSnippet(plainText);
    }
    setInserted(true);
    if (insertTimerRef.current !== null) {
      window.clearTimeout(insertTimerRef.current);
    }
    insertTimerRef.current = window.setTimeout(() => setInserted(false), 1800);
  }, [plainText, onInsertToDoc]);

  const handleToggleSpeak = useCallback(() => {
    if (isSpeaking) {
      stopSpeaking();
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      return;
    }
    if (!plainText) return;
    isSpeakingRef.current = true;
    setIsSpeaking(true);
    void speakText(plainText).finally(() => {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
    });
  }, [isSpeaking, plainText]);

  const handleSaveEdit = useCallback(() => {
    const trimmed = editText.trim();
    if (!trimmed) return;
    setIsEditing(false);
    onEditUserMessage(message.id, trimmed);
  }, [editText, message.id, onEditUserMessage]);

  const handleEditKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsEditing(false);
        setEditText(plainText);
        return;
      }
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        handleSaveEdit();
      }
    },
    [handleSaveEdit, plainText]
  );

  const formattedTime = useMemo(
    () => (showTimestamp ? formatMessageTime(message.metadata?.createdAt) : null),
    [showTimestamp, message.metadata?.createdAt]
  );

  if (isUser) {
    const userContent = (
      <div className="flex flex-col items-end gap-2">
        {fileParts.length > 0 && (
          <Attachments className="justify-end" variant="inline">
            {fileParts.map((filePart, idx) => {
              const attachmentData = {
                ...filePart,
                id: `${message.id}-file-${idx}`,
              };
              const isImg = filePart.mediaType.startsWith("image/");
              return (
                <AttachmentHoverCard key={attachmentData.id}>
                  <AttachmentHoverCardTrigger asChild>
                    <Attachment data={attachmentData}>
                      <AttachmentPreview />
                      <AttachmentInfo />
                    </Attachment>
                  </AttachmentHoverCardTrigger>
                  <AttachmentHoverCardContent className="max-w-64">
                    {isImg && filePart.url ? (
                      <img
                        alt={filePart.filename ?? "Attachment"}
                        className="max-h-48 rounded object-contain"
                        src={filePart.url}
                      />
                    ) : (
                      <div className="space-y-0.5 text-xs">
                        <div className="font-medium text-foreground">
                          {filePart.filename ?? "Attached file"}
                        </div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {filePart.mediaType}
                        </div>
                      </div>
                    )}
                  </AttachmentHoverCardContent>
                </AttachmentHoverCard>
              );
            })}
          </Attachments>
        )}

        <MessageContent className={cn(isEditing && "w-full min-w-0")}>
          {isEditing ? (
            <div className="space-y-2">
              <Textarea
                aria-label="Edit prompt"
                autoFocus
                className="min-h-20 resize-y bg-background text-sm"
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={handleEditKeyDown}
                value={editText}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">
                  Ctrl/Cmd+Enter to send • Esc to cancel
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => {
                      setIsEditing(false);
                      setEditText(plainText);
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <XIcon className="size-3.5" />
                    Cancel
                  </Button>
                  <Button
                    className="h-7 gap-1 px-2.5 text-xs"
                    disabled={!editText.trim() || isStreaming}
                    onClick={handleSaveEdit}
                    size="sm"
                    type="button"
                  >
                    <SendIcon className="size-3" />
                    Save &amp; Resend
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {message.parts.map((part, idx) => {
                if (part.type === "file") return null;
                return (
                  <AgentErrorBoundary
                    key={`${message.id}-u-${idx}`}
                    title="Message content failed"
                  >
                    <AgentPartRenderer
                      isStreaming={false}
                      messageId={message.id}
                      onApproveTool={onApproveTool}
                      onDenyTool={onDenyTool}
                      part={part}
                      partIndex={idx}
                      suppressFiles
                    />
                  </AgentErrorBoundary>
                );
              })}
            </div>
          )}
        </MessageContent>
      </div>
    );

    const userToolbar = !isEditing && (
      <div className="flex items-center justify-end gap-1.5 opacity-85 transition-opacity group-hover:opacity-100">
        {formattedTime && (
          <span className="text-[11px] text-muted-foreground">
            {formattedTime}
          </span>
        )}
        {branchInfo && branchInfo.count > 1 && (
          <MessageBranchSelector className="mr-1">
            <MessageBranchPrevious disabled={isStreaming} />
            <MessageBranchPage className="px-1.5 text-[11px]" />
            <MessageBranchNext disabled={isStreaming} />
          </MessageBranchSelector>
        )}
        <MessageActions>
          {plainText && (
            <MessageAction
              label="Copy prompt"
              onClick={() => void handleCopy()}
              tooltip={copied ? "Copied!" : "Copy prompt"}
            >
              {copied ? (
                <CheckIcon className="size-3.5 text-emerald-500" />
              ) : (
                <CopyIcon className="size-3.5" />
              )}
            </MessageAction>
          )}
          <MessageAction
            disabled={isStreaming}
            label="Edit and fork message"
            onClick={() => {
              setEditText(plainText);
              setIsEditing(true);
            }}
            tooltip="Edit & Fork"
          >
            <PencilIcon className="size-3.5" />
          </MessageAction>
        </MessageActions>
      </div>
    );

    return (
      <Message from="user">
        {renderWithBranchWrapper({
          branchInfo,
          content: userContent,
          onSwitchBranch,
          toolbar: userToolbar,
        })}
      </Message>
    );
  }

  const currentFeedback = message.metadata?.feedback ?? null;

  const assistantContent = (
    <MessageContent className="w-full">
      {message.parts.length === 0 && isActiveStreaming ? (
        <div className="py-1">
          <Shimmer as="span" className="text-xs" duration={1.1}>
            Thinking...
          </Shimmer>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {message.parts.map((part, idx) => {
            if (isSourcePart(part)) {
              return null;
            }
            if (
              isToolUIPart(part) &&
              getToolName(part) === "update_steps" &&
              idx !== lastUpdateStepsIdx
            ) {
              return null;
            }
            return (
              <AgentErrorBoundary
                key={`${message.id}-part-${idx}-${part.type}`}
                title="Part failed to render"
              >
                <AgentPartRenderer
                  hasFollowingUserMessage={hasFollowingUserMessage}
                  isStreaming={isActiveStreaming}
                  messageId={message.id}
                  onApproveTool={onApproveTool}
                  onDenyTool={onDenyTool}
                  onInsertToDoc={onInsertToDoc}
                  onSendFollowUp={onSendFollowUp}
                  part={part}
                  partIndex={idx}
                  suppressSources
                />
              </AgentErrorBoundary>
            );
          })}
        </div>
      )}

      {sourceParts.length > 0 && <MessageSourcesBlock sources={sourceParts} />}
    </MessageContent>
  );

  const assistantToolbar = !isActiveStreaming && (
    <MessageToolbar className="mt-1 flex-wrap gap-2">
      <MessageActions className="flex-wrap">
        <MessageAction
          disabled={!plainText}
          label="Copy response"
          onClick={() => void handleCopy()}
          tooltip={copied ? "Copied!" : "Copy markdown"}
        >
          {copied ? (
            <CheckIcon className="size-3.5 text-emerald-500" />
          ) : (
            <CopyIcon className="size-3.5" />
          )}
        </MessageAction>

        <MessageAction
          disabled={isStreaming}
          label="Regenerate response"
          onClick={() => onRegenerate(message.id)}
          tooltip="Regenerate"
        >
          <RefreshCwIcon className="size-3.5" />
        </MessageAction>

        <MessageAction
          disabled={!plainText}
          label="Insert into document"
          onClick={() => void handleInsert()}
          tooltip={inserted ? "Inserted to Doc!" : "Insert into Doc"}
        >
          {inserted ? (
            <CheckIcon className="size-3.5 text-emerald-500" />
          ) : (
            <FilePlus2Icon className="size-3.5" />
          )}
        </MessageAction>

        <MessageAction
          disabled={!plainText && !isSpeaking}
          label={isSpeaking ? "Stop reading aloud" : "Read response aloud"}
          onClick={handleToggleSpeak}
          tooltip={isSpeaking ? "Stop speaking" : "Speak aloud"}
        >
          {isSpeaking ? (
            <SquareIcon className="size-3.5 text-primary" />
          ) : (
            <Volume2Icon className="size-3.5" />
          )}
        </MessageAction>

        <MessageAction
          className={cn(
            currentFeedback === "up" &&
              "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          )}
          label="Thumbs up"
          onClick={() =>
            onFeedback(message.id, currentFeedback === "up" ? null : "up")
          }
          tooltip="Helpful"
        >
          <ThumbsUpIcon className="size-3.5" />
        </MessageAction>

        <MessageAction
          className={cn(
            currentFeedback === "down" &&
              "bg-destructive/15 text-destructive"
          )}
          label="Thumbs down"
          onClick={() =>
            onFeedback(message.id, currentFeedback === "down" ? null : "down")
          }
          tooltip="Needs improvement"
        >
          <ThumbsDownIcon className="size-3.5" />
        </MessageAction>
      </MessageActions>

      <div className="flex flex-wrap items-center gap-1.5">
        {branchInfo && branchInfo.count > 1 && (
          <MessageBranchSelector>
            <MessageBranchPrevious disabled={isStreaming} />
            <MessageBranchPage className="px-1.5 text-[11px]" />
            <MessageBranchNext disabled={isStreaming} />
          </MessageBranchSelector>
        )}
        {message.metadata?.modelId && (
          <Badge className="max-w-[140px] truncate font-mono text-[10px]" variant="outline">
            {message.metadata.modelId}
          </Badge>
        )}
        {message.metadata?.effort && (
          <Badge className="font-mono text-[10px] capitalize" variant="secondary">
            {message.metadata.effort}
          </Badge>
        )}
        {message.metadata?.mode && message.metadata.mode !== "default" && (
          <Badge className="font-mono text-[10px]" variant="secondary">
            {message.metadata.mode}
          </Badge>
        )}
        {formattedTime && (
          <span className="text-[11px] text-muted-foreground">
            {formattedTime}
          </span>
        )}
      </div>
    </MessageToolbar>
  );

  return (
    <Message from="assistant">
      {renderWithBranchWrapper({
        branchInfo,
        content: assistantContent,
        onSwitchBranch,
        toolbar: assistantToolbar,
      })}
    </Message>
  );
});
