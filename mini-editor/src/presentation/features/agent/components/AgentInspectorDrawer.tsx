import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  normalizeAgentMode,
  type AgentRuntimeConfig,
} from "@/core/interfaces/agent";
import type {
  AgentAgySettingsResponse,
  AgentBackendInfo,
  AgentBackendSessionConfig,
  AgentBackendStatus,
  AgentCustomCommandResponse,
  AgentHarnessSummary,
  AgentPromptPreset,
  AgentUsageResponse,
} from "@/infrastructure/agent";
import {
  ActivityIcon,
  CheckIcon,
  CpuIcon,
  GlobeIcon,
  Minimize2Icon,
  RefreshCwIcon,
  RotateCcwIcon,
  ShieldIcon,
  TerminalIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export type InspectorTab = "runtime" | "usage" | "connection";

export interface AgentInspectorDrawerProps {
  config: AgentRuntimeConfig;
  initialTab?: InspectorTab;
  backendStatus: AgentBackendStatus | null;
  backendInfo: AgentBackendInfo | null;
  backendUsage: AgentUsageResponse | null;
  backendPrompts: AgentPromptPreset[];
  backendAgyConfig: AgentAgySettingsResponse | null;
  harnesses: AgentHarnessSummary[];
  backendError: string | null;
  isRefreshingMeta: boolean;
  isRefreshingUsage: boolean;
  onUpdateConfig: (partial: Partial<AgentRuntimeConfig>) => void;
  onResetConfig: () => void;
  onRefreshBackendMeta: () => Promise<void>;
  onRefreshAgentUsage: () => Promise<void>;
  onResetBackendSession: (compact: boolean, hard?: boolean) => Promise<void>;
  onApplySessionConfig: (patch: AgentBackendSessionConfig) => Promise<void>;
  onSaveAgyConfig: (
    patch: Record<string, unknown>
  ) => Promise<AgentAgySettingsResponse>;
  onRunAgyCommand: (req: {
    mode?: "slash" | "cli";
    command: string;
    harnessId?: string;
  }) => Promise<AgentCustomCommandResponse>;
}

const CUSTOM_CMD_PRESETS: { label: string; mode: "slash" | "cli"; cmd: string }[] = [
  { label: "/skills", mode: "slash", cmd: "/skills" },
  { label: "/permissions", mode: "slash", cmd: "/permissions" },
  { label: "/agents", mode: "slash", cmd: "/agents" },
  { label: "agy models", mode: "cli", cmd: "models" },
  { label: "agy mcp list", mode: "cli", cmd: "mcp list" },
  { label: "agy plugin list --json", mode: "cli", cmd: "plugin list --json" },
];

export function AgentInspectorDrawer({
  config,
  initialTab = "runtime",
  backendStatus,
  backendInfo,
  backendUsage,
  backendPrompts,
  backendAgyConfig,
  harnesses,
  backendError,
  isRefreshingMeta,
  isRefreshingUsage,
  onUpdateConfig,
  onResetConfig,
  onRefreshBackendMeta,
  onRefreshAgentUsage,
  onResetBackendSession,
  onApplySessionConfig,
  onSaveAgyConfig,
  onRunAgyCommand,
}: AgentInspectorDrawerProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>(initialTab);
  const [isApplying, setIsApplying] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const [cmdMode, setCmdMode] = useState<"slash" | "cli">("slash");
  const [cmdInput, setCmdInput] = useState("/skills");
  const [isRunningCmd, setIsRunningCmd] = useState(false);
  const [cmdResult, setCmdResult] = useState<string>("");
  const [cmdMeta, setCmdMeta] = useState<string>("");

  const [agyModel, setAgyModel] = useState("");
  const [agyAgentMode, setAgyAgentMode] = useState("");
  const [agyToolPerm, setAgyToolPerm] = useState("");
  const [agyVerbosity, setAgyVerbosity] = useState("");
  const [agySandbox, setAgySandbox] = useState(false);
  const [agyNonWs, setAgyNonWs] = useState(false);
  const [agyG1Credits, setAgyG1Credits] = useState(false);
  const [agySaveMsg, setAgySaveMsg] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const s = backendAgyConfig?.settings;
    if (!s) return;
    setAgyModel(typeof s.model === "string" ? s.model : "");
    setAgyAgentMode(typeof s.agentMode === "string" ? s.agentMode : "");
    setAgyToolPerm(typeof s.toolPermission === "string" ? s.toolPermission : "");
    setAgyVerbosity(typeof s.verbosity === "string" ? s.verbosity : "");
    setAgySandbox(Boolean(s.enableTerminalSandbox));
    setAgyNonWs(Boolean(s.allowNonWorkspaceAccess));
    setAgyG1Credits(Boolean(s.useG1Credits));
  }, [backendAgyConfig]);

  const handleApplyPrompt = useCallback(async () => {
    setIsApplying(true);
    setActionMsg(null);
    try {
      await onApplySessionConfig({
        model: config.modelId || undefined,
        mode: normalizeAgentMode(config.mode),
        effort:
          !config.reasoningEffort || config.reasoningEffort === "off"
            ? undefined
            : config.reasoningEffort,
        systemPromptId: config.systemPromptId || "default",
        systemPromptAppend: config.systemPromptAppend,
        replaceDefaultRule: Boolean(config.replaceDefaultRule),
        restartIfNeeded: true,
      });
      setActionMsg("Session config synced to GemOps.");
    } catch (err) {
      setActionMsg(
        err instanceof Error ? err.message : "Failed to apply session config"
      );
    } finally {
      setIsApplying(false);
    }
  }, [
    config.modelId,
    config.mode,
    config.reasoningEffort,
    config.systemPromptId,
    config.systemPromptAppend,
    config.replaceDefaultRule,
    onApplySessionConfig,
  ]);

  const handleSaveAgySettings = useCallback(async () => {
    setIsApplying(true);
    setAgySaveMsg(null);
    try {
      await onSaveAgyConfig({
        model: agyModel,
        agentMode: agyAgentMode,
        toolPermission: agyToolPerm,
        verbosity: agyVerbosity,
        enableTerminalSandbox: agySandbox,
        allowNonWorkspaceAccess: agyNonWs,
        useG1Credits: agyG1Credits,
      });
      setAgySaveMsg("Saved ~/.gemini/antigravity-cli/settings.json");
    } catch (err) {
      setAgySaveMsg(
        err instanceof Error ? err.message : "Failed to save settings.json"
      );
    } finally {
      setIsApplying(false);
    }
  }, [
    agyModel,
    agyAgentMode,
    agyToolPerm,
    agyVerbosity,
    agySandbox,
    agyNonWs,
    agyG1Credits,
    onSaveAgyConfig,
  ]);

  const handleRunCustomCmd = useCallback(async () => {
    const trimmed = cmdInput.trim();
    if (!trimmed) return;
    setIsRunningCmd(true);
    setCmdMeta(`Running ${cmdMode}: ${trimmed}...`);
    try {
      const res = await onRunAgyCommand({ mode: cmdMode, command: trimmed });
      setCmdMeta(
        `exit=${res.exitCode} · ${res.durationMs} ms · agy ${(res.args ?? []).join(" ")}`
      );
      if (res.parsedJson !== undefined && res.parsedJson !== null) {
        setCmdResult(JSON.stringify(res.parsedJson, null, 2));
      } else {
        setCmdResult(
          [res.stdout, res.stderr].filter(Boolean).join("\n--- STDERR ---\n") ||
          "(no output)"
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Command failed";
      setCmdMeta(`error: ${msg}`);
      setCmdResult(msg);
    } finally {
      setIsRunningCmd(false);
    }
  }, [cmdInput, cmdMode, onRunAgyCommand]);

  const handleReset = useCallback(
    async (compact: boolean, hard = false) => {
      setIsApplying(true);
      setActionMsg(null);
      try {
        await onResetBackendSession(compact, hard);
        setActionMsg(
          hard
            ? "GemOps ACP process restarted."
            : compact
              ? "Session compacted (<=300 words); warm ACP process kept alive."
              : "Current conversation session reset."
        );
      } catch (err) {
        setActionMsg(
          err instanceof Error ? err.message : "Failed to reset session"
        );
      } finally {
        setIsApplying(false);
      }
    },
    [onResetBackendSession]
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <Tabs
        className="flex min-h-0 flex-1 flex-col"
        onValueChange={(val) => setActiveTab(val as InspectorTab)}
        value={activeTab}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-2.5 py-2">
          <TabsList className="h-8 max-w-full overflow-x-auto scrollbar-hide">
            <TabsTrigger className="gap-1 px-2 text-xs" value="runtime">
              <ActivityIcon className="size-3.5 shrink-0" />
              <span>Runtime &amp; Harness</span>
            </TabsTrigger>
            <TabsTrigger className="gap-1 px-2 text-xs" value="usage">
              <CpuIcon className="size-3.5 shrink-0" />
              <span>AGY Usage &amp; CLI</span>
            </TabsTrigger>
            <TabsTrigger className="gap-1 px-2 text-xs" value="connection">
              <GlobeIcon className="size-3.5 shrink-0" />
              <span>Connection &amp; UI</span>
            </TabsTrigger>
          </TabsList>

          <Button
            className="h-7 shrink-0 gap-1 px-2 text-xs"
            onClick={onResetConfig}
            size="xs"
            title="Reset Local Preferences"
            type="button"
            variant="outline"
          >
            <RotateCcwIcon className="size-3 shrink-0" />
            <span className="agent-sm-only">Reset</span>
          </Button>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto w-full max-w-4xl min-w-0 p-2.5 sm:p-4">
            <TabsContent className="mt-0 space-y-4" value="runtime">
              {/* Live GemOps Status Card */}
              <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ActivityIcon className="size-4 text-primary" />
                    <h3 className="text-sm font-semibold">GemOps Runtime</h3>
                    <Badge
                      className="text-[10px]"
                      variant={backendStatus ? "default" : "destructive"}
                    >
                      {backendStatus ? backendStatus.state : "OFFLINE"}
                    </Badge>
                  </div>
                  <Button
                    className="h-7 gap-1 px-2 text-xs"
                    disabled={isRefreshingMeta}
                    onClick={() => void onRefreshBackendMeta()}
                    size="xs"
                    type="button"
                    variant="outline"
                  >
                    <RefreshCwIcon
                      className={`size-3 ${isRefreshingMeta ? "animate-spin" : ""}`}
                    />
                    Refresh
                  </Button>
                </div>

                {backendError && (
                  <p className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
                    {backendError}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <div className="rounded-lg border border-border bg-background p-2.5">
                    <div className="text-[10px] text-muted-foreground">
                      Active Harness
                    </div>
                    <div className="mt-0.5 truncate font-mono font-semibold">
                      {backendStatus?.activeHarnessId ?? "—"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-2.5">
                    <div className="text-[10px] text-muted-foreground">
                      Policy Profile
                    </div>
                    <div className="mt-0.5 truncate font-mono font-semibold">
                      {backendStatus?.activePolicyProfile ?? "—"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-2.5">
                    <div className="text-[10px] text-muted-foreground">
                      PID / RSS
                    </div>
                    <div className="mt-0.5 truncate font-mono font-semibold">
                      {backendStatus?.geminiPid
                        ? `${backendStatus.geminiPid} (${backendStatus.geminiRssMB} MB)`
                        : "Stopped"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-2.5">
                    <div className="text-[10px] text-muted-foreground">
                      CLI Version
                    </div>
                    <div className="mt-0.5 truncate font-mono font-semibold">
                      {backendInfo?.version || "—"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-2.5">
                    <div className="text-[10px] text-muted-foreground">
                      Warm Sessions
                    </div>
                    <div className="mt-0.5 truncate font-mono font-semibold">
                      {backendStatus?.sessionsCount ?? (backendStatus?.sessions?.length ?? 1)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-2.5">
                    <div className="text-[10px] text-muted-foreground">
                      Active Conv
                    </div>
                    <div className="mt-0.5 truncate font-mono font-semibold">
                      {backendStatus?.activeConversationId || "—"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-2.5">
                    <div className="text-[10px] text-muted-foreground">
                      Turns / Idle
                    </div>
                    <div className="mt-0.5 truncate font-mono font-semibold">
                      {backendStatus
                        ? `${backendStatus.turnCount} turns · ${backendStatus.idleSeconds}s`
                        : "—"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-2.5">
                    <div className="text-[10px] text-muted-foreground">
                      Go Heap / Tools
                    </div>
                    <div className="mt-0.5 truncate font-mono font-semibold">
                      {backendStatus
                        ? `${backendStatus.goAllocMB} MB · ${backendStatus.activeToolsCount} active`
                        : "—"}
                    </div>
                  </div>
                </div>

                {backendStatus && (
                  <div className="space-y-1.5 rounded-lg border border-border bg-background p-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        RSS RAM Watchdog (Soft 450 MB / Hard 650 MB)
                      </span>
                      <span className="font-mono text-[11px]">
                        {backendStatus.geminiRssMB} MB / 650 MB
                      </span>
                    </div>
                    <Progress
                      className="h-1.5 bg-muted"
                      value={Math.min(
                        100,
                        Math.round((backendStatus.geminiRssMB / 650) * 100)
                      )}
                    />
                  </div>
                )}

                {backendStatus?.sessions && backendStatus.sessions.length > 0 && (
                  <div className="space-y-1.5 rounded-lg border border-border bg-background p-2.5 text-xs">
                    <div className="text-[11px] font-medium text-muted-foreground">
                      Warm ACP Sessions ({backendStatus.sessions.length})
                    </div>
                    <div className="space-y-1">
                      {backendStatus.sessions.map((sess) => (
                        <div
                          className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/60 px-2 py-1 font-mono text-[11px]"
                          key={sess.key || sess.conversationId}
                        >
                          <span className="truncate font-medium">
                            {sess.conversationId} ({sess.harnessId || "common"})
                          </span>
                          <span className="text-muted-foreground">
                            {sess.turnCount ?? sess.turns ?? 0} turns
                            {sess.sessionConfig?.model
                              ? ` · ${sess.sessionConfig.model}`
                              : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    className="h-7 gap-1.5 text-xs"
                    disabled={isApplying}
                    onClick={() => void handleReset(true, false)}
                    size="xs"
                    type="button"
                    variant="outline"
                  >
                    <Minimize2Icon className="size-3.5" />
                    Compact Session
                  </Button>
                  <Button
                    className="h-7 gap-1.5 text-xs text-destructive hover:text-destructive"
                    disabled={isApplying}
                    onClick={() => void handleReset(false, false)}
                    size="xs"
                    type="button"
                    variant="outline"
                  >
                    <Trash2Icon className="size-3.5" />
                    Reset Session
                  </Button>
                  <Button
                    className="h-7 gap-1.5 text-xs text-destructive hover:text-destructive"
                    disabled={isApplying}
                    onClick={() => void handleReset(false, true)}
                    size="xs"
                    type="button"
                    variant="outline"
                  >
                    <RefreshCwIcon className="size-3.5" />
                    Hard Restart
                  </Button>
                </div>
              </div>

              {/* Harness Selector */}
              <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold">
                      <ShieldIcon className="size-3.5 text-primary" />
                      Target Harness
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Select which GemOps harness handles prompts from this panel.
                    </p>
                  </div>
                  <Select
                    onValueChange={(val) =>
                      onUpdateConfig({ harnessId: val === "__default__" ? "" : val })
                    }
                    value={config.harnessId || "__default__"}
                  >
                    <SelectTrigger
                      aria-label="Select GemOps harness"
                      className="h-8 w-48 text-xs"
                      size="sm"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default__">
                        Backend Default
                      </SelectItem>
                      {harnesses
                        .filter((h) => h.enabled)
                        .map((h) => (
                          <SelectItem key={h.id} value={h.id}>
                            {h.name} ({h.id})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* System Prompt Preset & Append */}
              <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    className="text-xs font-semibold text-foreground"
                    htmlFor="gemops-system-prompt-append"
                  >
                    System Prompt Preset &amp; Override
                  </label>
                  <Select
                    onValueChange={(val) =>
                      onUpdateConfig({ systemPromptId: val })
                    }
                    value={config.systemPromptId || "default"}
                  >
                    <SelectTrigger
                      aria-label="Select system prompt preset"
                      className="h-7 w-56 text-xs"
                      size="sm"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {backendPrompts.length > 0 ? (
                        backendPrompts.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name || p.id}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="default">
                          Default (workspace/GEMINI.md)
                        </SelectItem>
                      )}
                      <SelectItem value="custom">Custom Inline Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  className="min-h-24 text-xs"
                  id="gemops-system-prompt-append"
                  onChange={(e) =>
                    onUpdateConfig({ systemPromptAppend: e.target.value })
                  }
                  placeholder="Optional extra instructions appended to the active harness..."
                  value={config.systemPromptAppend}
                />
                <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2">
                  <span className="text-[11px] text-muted-foreground">
                    Prioritize override over conflicting workspace GEMINI.md rules
                  </span>
                  <Switch
                    aria-label="Replace default rule"
                    checked={Boolean(config.replaceDefaultRule)}
                    onCheckedChange={(checked) =>
                      onUpdateConfig({ replaceDefaultRule: checked })
                    }
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {actionMsg ?? "Sent on each prompt or applied live when idle."}
                  </span>
                  <Button
                    className="h-7 gap-1 text-xs"
                    disabled={isApplying}
                    onClick={() => void handleApplyPrompt()}
                    size="xs"
                    type="button"
                    variant="secondary"
                  >
                    <CheckIcon className="size-3.5" />
                    Apply to Session
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent className="mt-0 space-y-4" value="usage">
              {/* AGY Usage, Quota & Credits */}
              <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CpuIcon className="size-4 text-primary" />
                    <h3 className="text-sm font-semibold">
                      AGY Usage, Quota &amp; Credits
                    </h3>
                  </div>
                  <Button
                    className="h-7 gap-1 px-2 text-xs"
                    disabled={isRefreshingUsage}
                    onClick={() => void onRefreshAgentUsage()}
                    size="xs"
                    type="button"
                    variant="outline"
                  >
                    <RefreshCwIcon
                      className={`size-3 ${isRefreshingUsage ? "animate-spin" : ""}`}
                    />
                    Refresh Usage
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <div className="rounded-lg border border-border bg-background p-2.5">
                    <div className="text-[10px] text-muted-foreground">
                      CLI Version
                    </div>
                    <div className="mt-0.5 truncate font-mono font-semibold">
                      {backendUsage?.version || backendInfo?.version || "—"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-2.5">
                    <div className="text-[10px] text-muted-foreground">
                      AI Credits Balance
                    </div>
                    <div className="mt-0.5 truncate font-mono font-semibold text-primary">
                      {backendUsage?.credits?.remaining_credits !== undefined
                        ? String(backendUsage.credits.remaining_credits)
                        : "—"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-2.5">
                    <div className="text-[10px] text-muted-foreground">
                      Default Model (/model)
                    </div>
                    <div className="mt-0.5 truncate font-mono font-semibold">
                      {backendUsage?.currentModel?.label ||
                        backendUsage?.currentModel?.id ||
                        "—"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-2.5">
                    <div className="text-[10px] text-muted-foreground">
                      Thinking (/effort)
                    </div>
                    <div className="mt-0.5 truncate font-mono font-semibold capitalize">
                      {backendUsage?.currentEffort?.current ||
                        backendUsage?.currentModel?.effort ||
                        "—"}
                    </div>
                  </div>
                </div>

                {backendUsage?.warnings && backendUsage.warnings.length > 0 && (
                  <p className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
                    {backendUsage.warnings.join(" | ")}
                  </p>
                )}

                {backendUsage?.quota?.groups &&
                  backendUsage.quota.groups.length > 0 ? (
                  <div className="space-y-3">
                    {backendUsage.quota.groups.map((group) => (
                      <div
                        className="space-y-2 rounded-lg border border-border bg-background p-3"
                        key={group.name}
                      >
                        <div>
                          <div className="text-xs font-semibold">
                            {group.name}
                          </div>
                          {group.description && (
                            <div className="text-[11px] text-muted-foreground">
                              {group.description}
                            </div>
                          )}
                        </div>
                        <div className="space-y-2">
                          {(group.buckets ?? []).map((bucket) => {
                            const pct =
                              typeof bucket.remaining_fraction === "number"
                                ? Math.max(
                                  0,
                                  Math.min(
                                    100,
                                    Math.round(bucket.remaining_fraction * 100)
                                  )
                                )
                                : 0;
                            return (
                              <div className="space-y-1" key={bucket.id}>
                                <div className="flex items-center justify-between gap-2 text-xs">
                                  <span className="font-medium">
                                    {bucket.name}{" "}
                                    {bucket.window && (
                                      <Badge
                                        className="ml-1 px-1 py-0 text-[9px]"
                                        variant="secondary"
                                      >
                                        {bucket.window}
                                      </Badge>
                                    )}
                                  </span>
                                  <span className="font-mono font-semibold">
                                    {pct}% remaining
                                  </span>
                                </div>
                                <Progress className="h-1.5 bg-muted" value={pct} />
                                {(bucket.description || bucket.reset_time) && (
                                  <div className="font-mono text-[10px] text-muted-foreground">
                                    {bucket.description}
                                    {bucket.reset_time
                                      ? ` · reset: ${bucket.reset_time}`
                                      : ""}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    No quota data returned yet. Click Refresh Usage to query GemOps.
                  </div>
                )}
              </div>

              {/* AGY settings.json */}
              <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">
                      AGY CLI Settings (settings.json)
                    </h3>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {backendAgyConfig?.path || "~/.gemini/antigravity-cli/settings.json"}
                    </p>
                  </div>
                  <Button
                    className="h-7 gap-1 text-xs"
                    disabled={isApplying}
                    onClick={() => void handleSaveAgySettings()}
                    size="xs"
                    type="button"
                    variant="secondary"
                  >
                    <CheckIcon className="size-3.5" />
                    Save settings.json
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-2.5 text-xs sm:grid-cols-2">
                  <div className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">
                      Default Model (model)
                    </span>
                    <Select
                      onValueChange={(val) =>
                        setAgyModel(val === "__default__" ? "" : val)
                      }
                      value={agyModel || "__default__"}
                    >
                      <SelectTrigger className="h-8 text-xs" size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__default__">(CLI default)</SelectItem>
                        {(backendInfo?.models ?? []).map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.label || m.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">
                      Agent Mode (agentMode)
                    </span>
                    <Select
                      onValueChange={(val) =>
                        setAgyAgentMode(val === "__default__" ? "" : val)
                      }
                      value={agyAgentMode || "__default__"}
                    >
                      <SelectTrigger className="h-8 text-xs" size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__default__">(default)</SelectItem>
                        {(backendInfo?.modes ?? ["accept-edits", "auto", "plan"]).map(
                          (m) => (
                            <SelectItem key={m} value={m}>
                              {m}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">
                      Tool Permission (toolPermission)
                    </span>
                    <Select
                      onValueChange={(val) =>
                        setAgyToolPerm(val === "__default__" ? "" : val)
                      }
                      value={agyToolPerm || "__default__"}
                    >
                      <SelectTrigger className="h-8 text-xs" size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__default__">(default: request-review)</SelectItem>
                        <SelectItem value="request-review">request-review</SelectItem>
                        <SelectItem value="proceed-in-sandbox">proceed-in-sandbox</SelectItem>
                        <SelectItem value="always-proceed">always-proceed</SelectItem>
                        <SelectItem value="strict">strict</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">
                      Verbosity (verbosity)
                    </span>
                    <Select
                      onValueChange={(val) =>
                        setAgyVerbosity(val === "__default__" ? "" : val)
                      }
                      value={agyVerbosity || "__default__"}
                    >
                      <SelectTrigger className="h-8 text-xs" size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__default__">(default: medium)</SelectItem>
                        <SelectItem value="low">low</SelectItem>
                        <SelectItem value="medium">medium</SelectItem>
                        <SelectItem value="high">high</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-2.5 py-2 text-xs">
                    <span className="font-mono text-[11px]">enableTerminalSandbox</span>
                    <Switch checked={agySandbox} onCheckedChange={setAgySandbox} />
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-2.5 py-2 text-xs">
                    <span className="font-mono text-[11px]">allowNonWorkspaceAccess</span>
                    <Switch checked={agyNonWs} onCheckedChange={setAgyNonWs} />
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-2.5 py-2 text-xs">
                    <span className="font-mono text-[11px]">useG1Credits</span>
                    <Switch checked={agyG1Credits} onCheckedChange={setAgyG1Credits} />
                  </div>
                </div>
                {agySaveMsg && (
                  <p className="text-[11px] text-muted-foreground">{agySaveMsg}</p>
                )}
              </div>

              {/* AGY Custom Command Runner */}
              <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2">
                  <TerminalIcon className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold">
                    AGY Custom Command Runner
                  </h3>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {CUSTOM_CMD_PRESETS.map((p) => (
                    <Button
                      className="h-6 px-2 font-mono text-[10px]"
                      key={p.label}
                      onClick={() => {
                        setCmdMode(p.mode);
                        setCmdInput(p.cmd);
                      }}
                      size="xs"
                      type="button"
                      variant="outline"
                    >
                      {p.label}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    onValueChange={(v) => setCmdMode(v as "slash" | "cli")}
                    value={cmdMode}
                  >
                    <SelectTrigger className="h-8 w-28 text-xs" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="slash">Slash (/...)</SelectItem>
                      <SelectItem value="cli">CLI (agy ...)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-8 min-w-[160px] flex-1 font-mono text-xs"
                    onChange={(e) => setCmdInput(e.target.value)}
                    placeholder="/skills or mcp list"
                    value={cmdInput}
                  />
                  <Button
                    className="h-8 px-3 text-xs"
                    disabled={isRunningCmd}
                    onClick={() => void handleRunCustomCmd()}
                    size="sm"
                    type="button"
                  >
                    {isRunningCmd ? "Running..." : "Run"}
                  </Button>
                </div>
                {cmdMeta && (
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {cmdMeta}
                  </div>
                )}
                {cmdResult && (
                  <pre className="max-h-56 overflow-auto rounded-lg border border-border bg-background p-2.5 font-mono text-[11px] whitespace-pre-wrap">
                    {cmdResult}
                  </pre>
                )}
              </div>
            </TabsContent>

            <TabsContent className="mt-0 space-y-4" value="connection">
              <div className="space-y-4 rounded-xl border border-border bg-card p-4">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-semibold">
                    Go Backend &amp; UI Preferences
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Requests stream through Tomo Go backend to GemOps.
                  </p>
                </div>

                <div className="agent-inspector-grid">
                  <div className="space-y-1.5">
                    <label
                      className="text-xs font-medium"
                      htmlFor="agent-api-endpoint"
                    >
                      HTTP Streaming Endpoint
                    </label>
                    <Input
                      className="h-8 font-mono text-xs"
                      id="agent-api-endpoint"
                      onChange={(e) =>
                        onUpdateConfig({ apiEndpoint: e.target.value })
                      }
                      placeholder="/api/v1/agent/chat"
                      value={config.apiEndpoint}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label
                      className="text-xs font-medium"
                      htmlFor="agent-api-key"
                    >
                      Optional Agent API Key
                    </label>
                    <Input
                      className="h-8 font-mono text-xs"
                      id="agent-api-key"
                      onChange={(e) =>
                        onUpdateConfig({ apiKey: e.target.value })
                      }
                      placeholder="Optional header key"
                      type="password"
                      value={config.apiKey ?? ""}
                    />
                  </div>
                </div>

                <div className="agent-inspector-grid">
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
                    <div>
                      <div className="text-xs font-medium">
                        Auto-Speak Responses
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Read completed assistant replies aloud.
                      </div>
                    </div>
                    <Switch
                      aria-label="Auto speak responses"
                      checked={config.autoSpeakResponses}
                      onCheckedChange={(checked) =>
                        onUpdateConfig({ autoSpeakResponses: checked })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
                    <div>
                      <div className="text-xs font-medium">
                        Show Message Timestamps
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Display creation time on message bubbles.
                      </div>
                    </div>
                    <Switch
                      aria-label="Show timestamps"
                      checked={config.showTimestamps}
                      onCheckedChange={(checked) =>
                        onUpdateConfig({ showTimestamps: checked })
                      }
                    />
                  </div>
                </div>
              </div>
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
