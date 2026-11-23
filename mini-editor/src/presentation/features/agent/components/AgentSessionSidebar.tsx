import {
  Checkpoint,
  CheckpointIcon,
  CheckpointTrigger,
} from "@/components/ai-elements/checkpoint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type {
  AgentScenarioId,
  AgentSession,
  CheckpointSnapshot,
} from "@/core/interfaces/agent";
import { cn } from "@/lib/utils";
import {
  BookOpenIcon,
  BugIcon,
  CheckIcon,
  Code2Icon,
  HistoryIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  ShieldCheckIcon,
  SparklesIcon,
  Trash2Icon,
  Undo2Icon,
  WorkflowIcon,
  XIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
} from "react";

export interface AgentSessionSidebarProps {
  isOpen: boolean;
  sessions: AgentSession[];
  activeSessionId: string;
  checkpoints: CheckpointSnapshot[];
  canUndoRestore: boolean;
  onClose: () => void;
  onSelectSession: (sessionId: string) => void;
  onCreateSession: () => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onLaunchScenario: (scenarioId: AgentScenarioId) => void;
  onRestoreCheckpoint: (checkpointId: string) => void;
  onUndoRestore: () => void;
  onResetToDemo: () => void;
}

const SCENARIO_QUICK_LAUNCHES: {
  id: AgentScenarioId;
  label: string;
  slash: string;
  icon: typeof Code2Icon;
}[] = [
  {
    id: "fullstack",
    label: "Full-Stack Code",
    slash: "/code",
    icon: Code2Icon,
  },
  {
    id: "research",
    label: "Research & Citations",
    slash: "/research",
    icon: BookOpenIcon,
  },
  {
    id: "approval",
    label: "HIL Approval & Question",
    slash: "/approval",
    icon: ShieldCheckIcon,
  },
  {
    id: "debug",
    label: "Debug & Diagnostics",
    slash: "/debug",
    icon: BugIcon,
  },
  {
    id: "generative-media",
    label: "Generative UI & Voice",
    slash: "/preview",
    icon: SparklesIcon,
  },
  {
    id: "workflow",
    label: "Multi-Agent Workflow",
    slash: "/workflow",
    icon: WorkflowIcon,
  },
];

function formatRelativeTime(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "";
  const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

export function AgentSessionSidebar({
  isOpen,
  sessions,
  activeSessionId,
  checkpoints,
  canUndoRestore,
  onClose,
  onSelectSession,
  onCreateSession,
  onRenameSession,
  onDeleteSession,
  onLaunchScenario,
  onRestoreCheckpoint,
  onUndoRestore,
  onResetToDemo,
}: AgentSessionSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !editingSessionId) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, editingSessionId, onClose]);

  const filteredSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => {
      const hay = `${s.title} ${s.summary ?? ""} ${s.mode}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sessions, searchQuery]);

  const orderedCheckpoints = useMemo(
    () => [...checkpoints].reverse(),
    [checkpoints]
  );

  const startEditing = useCallback((session: AgentSession) => {
    setEditingSessionId(session.id);
    setEditingTitle(session.title);
  }, []);

  const commitEditing = useCallback(
    (sessionId: string) => {
      const trimmed = editingTitle.trim();
      if (trimmed) {
        onRenameSession(sessionId, trimmed);
      }
      setEditingSessionId(null);
    },
    [editingTitle, onRenameSession]
  );

  const handleRenameKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>, sessionId: string) => {
      if (e.nativeEvent.isComposing || e.keyCode === 229) {
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        commitEditing(sessionId);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setEditingSessionId(null);
      }
    },
    [commitEditing]
  );

  if (!isOpen) {
    return null;
  }

  return (
    <>
      {/* Backdrop for narrow dock overlay mode (hidden >= 820px via agent-panel.css) */}
      <button
        aria-label="Close sessions sidebar"
        className="agent-sidebar-backdrop absolute inset-0 z-30 bg-background/60 backdrop-blur-[1px]"
        onClick={onClose}
        type="button"
      />

      <aside
        aria-label="Agent sessions and checkpoints"
        className="agent-sidebar-shell flex h-full flex-col border-r border-border bg-sidebar text-sidebar-foreground shadow-lg"
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between gap-2 border-b border-sidebar-border px-3 py-2.5">
          <div className="flex items-center gap-2">
            <HistoryIcon className="size-4 text-muted-foreground" />
            <span className="text-xs font-semibold tracking-tight">
              Studio History
            </span>
          </div>
          <Button
            aria-label="Close sidebar"
            className="size-6"
            onClick={onClose}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <XIcon className="size-3.5" />
          </Button>
        </div>

        {/* Search & New Chat / Reset Controls */}
        <div className="space-y-2 border-b border-sidebar-border p-2.5">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
            <Input
              aria-label="Filter sessions"
              className="h-8 bg-background pl-8 text-xs"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sessions..."
              value={searchQuery}
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              className="h-7 flex-1 gap-1 text-xs"
              onClick={onCreateSession}
              size="xs"
              type="button"
              variant="default"
            >
              <PlusIcon className="size-3.5" />
              New Chat
            </Button>
            <Button
              className="h-7 gap-1 px-2 text-xs"
              onClick={onResetToDemo}
              size="xs"
              title="Reset Demo Sessions"
              type="button"
              variant="outline"
            >
              <RotateCcwIcon className="size-3" />
              Reset Demo
            </Button>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 p-2.5">
            {/* Sessions List */}
            <section aria-label="Sessions">
              <div className="mb-1.5 flex items-center justify-between px-1">
                <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  Sessions ({filteredSessions.length})
                </span>
              </div>

              <div className="space-y-1">
                {filteredSessions.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border px-2.5 py-3 text-center text-xs text-muted-foreground">
                    No sessions match &ldquo;{searchQuery}&rdquo;
                  </p>
                ) : (
                  filteredSessions.map((session) => {
                    const isActive = session.id === activeSessionId;
                    const isEditing = editingSessionId === session.id;

                    return (
                      <div
                        className={cn(
                          "group flex flex-col gap-1 rounded-md border px-2.5 py-2 transition-colors",
                          isActive
                            ? "border-primary/40 bg-sidebar-accent text-sidebar-accent-foreground"
                            : "border-transparent hover:border-border hover:bg-sidebar-accent/50"
                        )}
                        key={session.id}
                      >
                        <div className="flex items-center gap-1.5">
                          {isEditing ? (
                            <div className="flex min-w-0 flex-1 items-center gap-1">
                              <Input
                                aria-label="Edit session title"
                                autoFocus
                                className="h-6 min-w-0 flex-1 bg-background px-1.5 text-xs"
                                onBlur={() => commitEditing(session.id)}
                                onChange={(e) => setEditingTitle(e.target.value)}
                                onKeyDown={(e) =>
                                  handleRenameKeyDown(e, session.id)
                                }
                                value={editingTitle}
                              />
                              <Button
                                aria-label="Save title"
                                className="size-6 shrink-0"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  commitEditing(session.id);
                                }}
                                size="icon-xs"
                                type="button"
                                variant="ghost"
                              >
                                <CheckIcon className="size-3" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <button
                                className="min-w-0 flex-1 truncate text-left text-xs font-medium"
                                onClick={() => onSelectSession(session.id)}
                                type="button"
                              >
                                {session.title}
                              </button>
                              {session.isSeedTour && (
                                <Badge
                                  className="shrink-0 px-1.5 py-0 text-[10px]"
                                  variant="secondary"
                                >
                                  Tour
                                </Badge>
                              )}
                              <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                                <Button
                                  aria-label={`Rename ${session.title}`}
                                  className="size-5"
                                  onClick={() => startEditing(session)}
                                  size="icon-xs"
                                  type="button"
                                  variant="ghost"
                                >
                                  <PencilIcon className="size-3" />
                                </Button>
                                <Button
                                  aria-label={`Delete ${session.title}`}
                                  className="size-5 text-muted-foreground hover:text-destructive"
                                  onClick={() => onDeleteSession(session.id)}
                                  size="icon-xs"
                                  type="button"
                                  variant="ghost"
                                >
                                  <Trash2Icon className="size-3" />
                                </Button>
                              </div>
                            </>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>
                            {session.mode} · {session.messages.length} msgs
                          </span>
                          <span>{formatRelativeTime(session.updatedAt)}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <Separator />

            {/* 6 Scenario Quick-Launches */}
            <section aria-label="Quick launch scenarios">
              <div className="mb-1.5 px-1">
                <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  Scenario Launchers
                </span>
              </div>
              <div className="grid grid-cols-1 gap-1">
                {SCENARIO_QUICK_LAUNCHES.map((scenario) => {
                  const Icon = scenario.icon;
                  return (
                    <Button
                      className="h-7 justify-between px-2 text-xs font-normal"
                      key={scenario.id}
                      onClick={() => onLaunchScenario(scenario.id)}
                      size="xs"
                      type="button"
                      variant="ghost"
                    >
                      <span className="flex min-w-0 items-center gap-1.5 truncate">
                        <Icon className="size-3.5 shrink-0 text-primary" />
                        <span className="truncate">{scenario.label}</span>
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {scenario.slash}
                      </span>
                    </Button>
                  );
                })}
              </div>
            </section>

            <Separator />

            {/* Active Session Checkpoint Timeline */}
            <section aria-label="Checkpoints timeline">
              <div className="mb-1.5 flex items-center justify-between px-1">
                <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  Checkpoints ({orderedCheckpoints.length})
                </span>
                {canUndoRestore && (
                  <Button
                    className="h-6 gap-1 px-1.5 text-[11px]"
                    onClick={onUndoRestore}
                    size="xs"
                    type="button"
                    variant="outline"
                  >
                    <Undo2Icon className="size-3" />
                    Undo Restore
                  </Button>
                )}
              </div>

              {orderedCheckpoints.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-2.5 py-2.5 text-center text-[11px] text-muted-foreground">
                  Checkpoints appear as the agent modifies workspace files.
                </p>
              ) : (
                <div className="space-y-2">
                  {orderedCheckpoints.map((cp) => (
                    <div
                      className="rounded-lg border border-border bg-background/80 p-2"
                      key={cp.id}
                    >
                      <Checkpoint>
                        <CheckpointIcon className="size-3.5 text-primary" />
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                          {cp.label}
                        </span>
                        <CheckpointTrigger
                          className="h-6 shrink-0 px-2 text-[11px]"
                          onClick={() => onRestoreCheckpoint(cp.id)}
                          tooltip={`Restore session to "${cp.label}"`}
                          variant="outline"
                        >
                          Restore
                        </CheckpointTrigger>
                      </Checkpoint>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>
                          {cp.affectedFiles.length} file
                          {cp.affectedFiles.length === 1 ? "" : "s"}
                        </span>
                        <span>{formatRelativeTime(cp.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </ScrollArea>
      </aside>
    </>
  );
}
