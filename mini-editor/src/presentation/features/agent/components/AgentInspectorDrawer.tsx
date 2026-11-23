import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { AgentRuntimeConfig } from "@/core/interfaces/agent";
import type {
  AgentBackendInfo,
  AgentBackendSessionConfig,
  AgentBackendStatus,
  AgentHarnessSummary,
} from "@/infrastructure/agent";
import {
  ActivityIcon,
  CheckIcon,
  GlobeIcon,
  Minimize2Icon,
  RefreshCwIcon,
  RotateCcwIcon,
  ShieldIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export type InspectorTab = "runtime" | "connection";

export interface AgentInspectorDrawerProps {
  config: AgentRuntimeConfig;
  initialTab?: InspectorTab;
  backendStatus: AgentBackendStatus | null;
  backendInfo: AgentBackendInfo | null;
  harnesses: AgentHarnessSummary[];
  backendError: string | null;
  isRefreshingMeta: boolean;
  onUpdateConfig: (partial: Partial<AgentRuntimeConfig>) => void;
  onResetConfig: () => void;
  onRefreshBackendMeta: () => Promise<void>;
  onResetBackendSession: (compact: boolean) => Promise<void>;
  onApplySessionConfig: (patch: AgentBackendSessionConfig) => Promise<void>;
}

export function AgentInspectorDrawer({
  config,
  initialTab = "runtime",
  backendStatus,
  backendInfo,
  harnesses,
  backendError,
  isRefreshingMeta,
  onUpdateConfig,
  onResetConfig,
  onRefreshBackendMeta,
  onResetBackendSession,
  onApplySessionConfig,
}: AgentInspectorDrawerProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>(initialTab);
  const [isApplying, setIsApplying] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const handleApplyPrompt = useCallback(async () => {
    setIsApplying(true);
    setActionMsg(null);
    try {
      await onApplySessionConfig({
        systemPromptAppend: config.systemPromptAppend,
      });
      setActionMsg("Session config synced to GemOps.");
    } catch (err) {
      setActionMsg(
        err instanceof Error ? err.message : "Failed to apply session config"
      );
    } finally {
      setIsApplying(false);
    }
  }, [config.systemPromptAppend, onApplySessionConfig]);

  const handleReset = useCallback(
    async (compact: boolean) => {
      setIsApplying(true);
      setActionMsg(null);
      try {
        await onResetBackendSession(compact);
        setActionMsg(
          compact
            ? "Session compacted (<=300 words) and process restarted."
            : "Session reset cleanly."
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
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    className="h-7 gap-1.5 text-xs"
                    disabled={isApplying}
                    onClick={() => void handleReset(true)}
                    size="xs"
                    type="button"
                    variant="outline"
                  >
                    <Minimize2Icon className="size-3.5" />
                    Compact &amp; Close
                  </Button>
                  <Button
                    className="h-7 gap-1.5 text-xs text-destructive hover:text-destructive"
                    disabled={isApplying}
                    onClick={() => void handleReset(false)}
                    size="xs"
                    type="button"
                    variant="outline"
                  >
                    <Trash2Icon className="size-3.5" />
                    Reset Session
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

              {/* System Prompt Append */}
              <div className="space-y-2.5 rounded-xl border border-border bg-card p-4">
                <label
                  className="text-xs font-semibold text-foreground"
                  htmlFor="gemops-system-prompt-append"
                >
                  System Prompt Append (Session Override)
                </label>
                <Textarea
                  className="min-h-24 text-xs"
                  id="gemops-system-prompt-append"
                  onChange={(e) =>
                    onUpdateConfig({ systemPromptAppend: e.target.value })
                  }
                  placeholder="Optional extra instructions appended to the active harness..."
                  value={config.systemPromptAppend}
                />
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
