import {
  Agent,
  AgentContent,
  AgentHeader as AgentCardHeader,
  AgentInstructions,
  AgentOutput,
  AgentTool,
  AgentTools,
} from "@/components/ai-elements/agent";
import {
  EnvironmentVariable,
  EnvironmentVariableCopyButton,
  EnvironmentVariableGroup,
  EnvironmentVariableName,
  EnvironmentVariableRequired,
  EnvironmentVariableValue,
  EnvironmentVariables,
  EnvironmentVariablesContent,
  EnvironmentVariablesHeader,
  EnvironmentVariablesTitle,
  EnvironmentVariablesToggle,
} from "@/components/ai-elements/environment-variables";
import {
  MicSelector,
  MicSelectorContent,
  MicSelectorEmpty,
  MicSelectorInput,
  MicSelectorItem,
  MicSelectorLabel,
  MicSelectorList,
  MicSelectorTrigger,
  MicSelectorValue,
} from "@/components/ai-elements/mic-selector";
import { Persona } from "@/components/ai-elements/persona";
import {
  VoiceSelector,
  VoiceSelectorAccent,
  VoiceSelectorAge,
  VoiceSelectorAttributes,
  VoiceSelectorBullet,
  VoiceSelectorContent,
  VoiceSelectorDescription,
  VoiceSelectorEmpty,
  VoiceSelectorGender,
  VoiceSelectorGroup,
  VoiceSelectorInput,
  VoiceSelectorItem,
  VoiceSelectorList,
  VoiceSelectorName,
  VoiceSelectorPreview,
  VoiceSelectorSeparator,
  VoiceSelectorShortcut,
  VoiceSelectorTrigger,
} from "@/components/ai-elements/voice-selector";
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
import {
  DEFAULT_AGENT_TOOLS,
  type AgentPersonaState,
  type AgentProfile,
  type AgentRuntimeConfig,
  type AgentToolDefinition,
  type ApprovalPolicy,
  type MockSpeed,
  type PersonaVariant,
  type TransportMode,
} from "@/core/interfaces/agent";
import {
  VOICE_CATALOG,
  playVoicePreview,
  stopVoicePreview,
} from "@/infrastructure/agent";
import { cn } from "@/lib/utils";
import { jsonSchema, type Tool } from "ai";
import {
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  GlobeIcon,
  MicIcon,
  RotateCcwIcon,
  ShieldIcon,
  SparklesIcon,
  Volume2Icon,
  WrenchIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AgentErrorBoundary, AgentPersonaOrb } from "./AgentErrorBoundary";

export type InspectorTab = "profile" | "transport" | "voice";

export interface AgentInspectorDrawerProps {
  config: AgentRuntimeConfig;
  profile: AgentProfile;
  micDeviceId: string | undefined;
  initialTab?: InspectorTab;
  onUpdateConfig: (partial: Partial<AgentRuntimeConfig>) => void;
  onUpdateProfile: (partial: Partial<AgentProfile>) => void;
  onToggleToolPermission: (toolName: string) => void;
  onResetConfig: () => void;
  onSetMicDeviceId: (deviceId: string | undefined) => void;
}

const PERSONA_VARIANTS: {
  id: PersonaVariant;
  label: string;
  vibe: string;
}[] = [
  { id: "obsidian", label: "Obsidian", vibe: "Crisp adaptive core" },
  { id: "command", label: "Command", vibe: "Focused terminal ring" },
  { id: "glint", label: "Glint", vibe: "Refractive prism" },
  { id: "halo", label: "Halo", vibe: "Minimal luminous arc" },
  { id: "mana", label: "Mana", vibe: "Vibrant energy pulse" },
  { id: "opal", label: "Opal", vibe: "Soft organic orb" },
];

const PERSONA_STATES: AgentPersonaState[] = [
  "idle",
  "listening",
  "thinking",
  "speaking",
  "asleep",
];

const AGENT_OUTPUT_SCHEMA_TS = `interface AgentTurnSummary {
  status: "completed" | "awaiting_approval" | "error";
  modifiedFiles: string[];
  artifactsEmitted: number;
  checksPassed: boolean;
}`;

function buildAiSdkToolForInspector(def: AgentToolDefinition): Tool {
  return {
    description: `${def.title} (${def.name}) — ${def.description}`,
    inputSchema: jsonSchema({
      type: "object",
      properties: {
        category: { type: "string", enum: [def.category] },
        riskLevel: { type: "string", enum: [def.riskLevel] },
        requiresApproval: {
          type: "boolean",
          default: def.requiresApprovalByDefault,
        },
      },
    }),
  };
}

function getRiskBadgeVariant(
  risk: AgentToolDefinition["riskLevel"]
): "secondary" | "outline" | "destructive" {
  if (risk === "destructive") return "destructive";
  if (risk === "moderate") return "outline";
  return "secondary";
}

export function AgentInspectorDrawer({
  config,
  profile,
  micDeviceId,
  initialTab = "profile",
  onUpdateConfig,
  onUpdateProfile,
  onToggleToolPermission,
  onResetConfig,
  onSetMicDeviceId,
}: AgentInspectorDrawerProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>(initialTab);
  const [previewState, setPreviewState] = useState<AgentPersonaState>("idle");
  const [enableLiveRive, setEnableLiveRive] = useState(false);
  const [riveFailed, setRiveFailed] = useState(false);
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setRiveFailed(false);
  }, [config.personaVariant]);

  useEffect(() => {
    return () => {
      stopVoicePreview();
    };
  }, []);

  const canEnumerateMics = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices?.enumerateDevices),
    []
  );

  const selectedVoice = useMemo(
    () =>
      VOICE_CATALOG.find((v) => v.id === config.voiceId) ?? VOICE_CATALOG[0],
    [config.voiceId]
  );

  const enabledToolSchemas = useMemo(
    () =>
      DEFAULT_AGENT_TOOLS.filter(
        (t) => config.toolPermissions[t.name] ?? t.enabled
      )
        .slice(0, 6)
        .map((t) => ({
          name: t.name,
          tool: buildAiSdkToolForInspector(t),
        })),
    [config.toolPermissions]
  );

  const handlePlayVoicePreview = useCallback(
    async (voiceId: string) => {
      if (playingVoiceId === voiceId) {
        stopVoicePreview();
        setPlayingVoiceId(null);
        return;
      }
      setPlayingVoiceId(voiceId);
      await playVoicePreview(voiceId);
      setPlayingVoiceId((current) => (current === voiceId ? null : current));
    },
    [playingVoiceId]
  );

  const enabledCount = useMemo(
    () =>
      DEFAULT_AGENT_TOOLS.filter(
        (t) => config.toolPermissions[t.name] ?? t.enabled
      ).length,
    [config.toolPermissions]
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
            <TabsTrigger className="gap-1 px-2 text-xs" value="profile">
              <BotIcon className="size-3.5 shrink-0" />
              <span className="agent-wide-only">Profile &amp; Tools</span>
              <span className="agent-compact-only">Profile</span>
            </TabsTrigger>
            <TabsTrigger className="gap-1 px-2 text-xs" value="transport">
              <GlobeIcon className="size-3.5 shrink-0" />
              <span className="agent-wide-only">Transport &amp; API</span>
              <span className="agent-compact-only">Transport</span>
            </TabsTrigger>
            <TabsTrigger className="gap-1 px-2 text-xs" value="voice">
              <SparklesIcon className="size-3.5 shrink-0" />
              <span className="agent-wide-only">Voice &amp; Persona</span>
              <span className="agent-compact-only">Persona</span>
            </TabsTrigger>
          </TabsList>

          <Button
            className="h-7 shrink-0 gap-1 px-2 text-xs"
            onClick={onResetConfig}
            size="xs"
            title="Reset Defaults"
            type="button"
            variant="outline"
          >
            <RotateCcwIcon className="size-3 shrink-0" />
            <span className="agent-sm-only">Reset</span>
          </Button>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto w-full max-w-4xl min-w-0 p-2.5 sm:p-4">
            {/* TAB 1: PROFILE & TOOLS */}
            <TabsContent className="mt-0 space-y-5" value="profile">
              <Agent>
                <AgentCardHeader
                  model={config.modelId}
                  name={profile.name}
                />
                <AgentContent className="space-y-4">
                  <AgentInstructions>
                    {profile.systemInstructions}
                  </AgentInstructions>

                  <div className="space-y-2">
                    <label
                      className="text-xs font-medium text-foreground"
                      htmlFor="agent-system-instructions"
                    >
                      Edit System Instructions
                    </label>
                    <Textarea
                      className="min-h-20 text-xs"
                      id="agent-system-instructions"
                      onChange={(e) =>
                        onUpdateProfile({
                          systemInstructions: e.target.value,
                        })
                      }
                      value={profile.systemInstructions}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/25 p-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 text-xs font-semibold">
                        <ShieldIcon className="size-3.5 text-primary" />
                        Tool Approval Policy
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Controls when destructive tools (git_push, delete_doc,
                        apply_migration) pause for human approval.
                      </p>
                    </div>
                    <Select
                      onValueChange={(val) =>
                        onUpdateConfig({
                          approvalPolicy: val as ApprovalPolicy,
                        })
                      }
                      value={config.approvalPolicy}
                    >
                      <SelectTrigger
                        aria-label="Approval policy"
                        className="h-8 w-44 text-xs"
                        size="sm"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ask">
                          Ask before destructive
                        </SelectItem>
                        <SelectItem value="auto-safe">
                          Auto-approve safe tools
                        </SelectItem>
                        <SelectItem value="auto-all">
                          Auto-approve all
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <AgentTools type="multiple">
                    {enabledToolSchemas.map((entry) => (
                      <AgentTool
                        key={entry.name}
                        tool={entry.tool}
                        value={entry.name}
                      />
                    ))}
                  </AgentTools>

                  <AgentOutput schema={AGENT_OUTPUT_SCHEMA_TS} />
                </AgentContent>
              </Agent>

              {/* Full 16-Tool Permissions Grid */}
              <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <WrenchIcon className="size-4 text-primary" />
                    <h3 className="text-sm font-semibold">
                      Workspace Tool Permissions
                    </h3>
                  </div>
                  <Badge className="text-[11px]" variant="secondary">
                    {enabledCount} / {DEFAULT_AGENT_TOOLS.length} Enabled
                  </Badge>
                </div>

                <div className="agent-inspector-grid">
                  {DEFAULT_AGENT_TOOLS.map((tool) => {
                    const enabled =
                      config.toolPermissions[tool.name] ?? tool.enabled;
                    return (
                      <div
                        className="flex items-start justify-between gap-3 rounded-lg border border-border/80 bg-background p-3"
                        key={tool.name}
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-semibold">
                              {tool.title}
                            </span>
                            <Badge
                              className="px-1.5 py-0 text-[10px]"
                              variant={getRiskBadgeVariant(tool.riskLevel)}
                            >
                              {tool.riskLevel}
                            </Badge>
                          </div>
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {tool.name} · {tool.category}
                          </div>
                          <p className="text-[11px] leading-snug text-muted-foreground">
                            {tool.description}
                          </p>
                        </div>

                        <Switch
                          aria-label={`Toggle ${tool.title}`}
                          checked={enabled}
                          onCheckedChange={() =>
                            onToggleToolPermission(tool.name)
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </TabsContent>

            {/* TAB 2: TRANSPORT & API */}
            <TabsContent className="mt-0 space-y-5" value="transport">
              <div className="space-y-4 rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="min-w-0 space-y-0.5">
                    <h3 className="text-sm font-semibold">
                      Agent Runtime Transport
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Switch between rich offline Mock Scenarios and a live AI
                      SDK v6 HTTP streaming endpoint.
                    </p>
                  </div>
                  <div className="inline-flex max-w-full flex-wrap rounded-lg border border-border bg-muted/40 p-1">
                    {(["mock", "http"] as TransportMode[]).map((mode) => (
                      <Button
                        className="h-7 px-2.5 text-xs"
                        key={mode}
                        onClick={() => onUpdateConfig({ transportMode: mode })}
                        size="xs"
                        type="button"
                        variant={
                          config.transportMode === mode ? "default" : "ghost"
                        }
                      >
                        {mode === "mock" ? "Mock Transport" : "Live HTTP API"}
                      </Button>
                    ))}
                  </div>
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
                      Bearer API Key (Optional)
                    </label>
                    <Input
                      className="h-8 font-mono text-xs"
                      id="agent-api-key"
                      onChange={(e) =>
                        onUpdateConfig({ apiKey: e.target.value })
                      }
                      placeholder="sk-..."
                      type="password"
                      value={config.apiKey ?? ""}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
                  <div>
                    <div className="text-xs font-medium">
                      Mock Stream Cadence
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Controls token and step delay when Transport is set to
                      Mock.
                    </div>
                  </div>
                  <Select
                    onValueChange={(val) =>
                      onUpdateConfig({ mockSpeed: val as MockSpeed })
                    }
                    value={config.mockSpeed}
                  >
                    <SelectTrigger
                      aria-label="Mock stream speed"
                      className="h-8 w-36 text-xs"
                      size="sm"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="instant">Instant</SelectItem>
                      <SelectItem value="fast">Fast</SelectItem>
                      <SelectItem value="realistic">Realistic</SelectItem>
                      <SelectItem value="slow">Slow</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="agent-inspector-grid">
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
                    <div>
                      <div className="text-xs font-medium">
                        Simulate Stream Error
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Test error banner, Clear &amp; Retry UX.
                      </div>
                    </div>
                    <Switch
                      aria-label="Simulate error"
                      checked={config.simulateError}
                      onCheckedChange={(checked) =>
                        onUpdateConfig({ simulateError: checked })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
                    <div>
                      <div className="text-xs font-medium">
                        Auto-Open Artifacts
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Open side pane on data-artifact parts.
                      </div>
                    </div>
                    <Switch
                      aria-label="Auto open artifacts"
                      checked={config.autoOpenArtifact}
                      onCheckedChange={(checked) =>
                        onUpdateConfig({ autoOpenArtifact: checked })
                      }
                    />
                  </div>

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

              {/* EnvironmentVariables Inspector */}
              <EnvironmentVariables defaultShowValues={false}>
                <EnvironmentVariablesHeader>
                  <EnvironmentVariablesTitle>
                    Resolved Runtime Environment
                  </EnvironmentVariablesTitle>
                  <EnvironmentVariablesToggle />
                </EnvironmentVariablesHeader>
                <EnvironmentVariablesContent>
                  <EnvironmentVariable
                    name="TOMO_AGENT_TRANSPORT"
                    value={config.transportMode}
                  >
                    <EnvironmentVariableGroup>
                      <EnvironmentVariableName />
                      <EnvironmentVariableRequired />
                    </EnvironmentVariableGroup>
                    <EnvironmentVariableGroup>
                      <EnvironmentVariableValue />
                      <EnvironmentVariableCopyButton copyFormat="export" />
                    </EnvironmentVariableGroup>
                  </EnvironmentVariable>

                  <EnvironmentVariable
                    name="TOMO_AGENT_ENDPOINT"
                    value={config.apiEndpoint || "/api/v1/agent/chat"}
                  >
                    <EnvironmentVariableGroup>
                      <EnvironmentVariableName />
                    </EnvironmentVariableGroup>
                    <EnvironmentVariableGroup>
                      <EnvironmentVariableValue />
                      <EnvironmentVariableCopyButton copyFormat="value" />
                    </EnvironmentVariableGroup>
                  </EnvironmentVariable>

                  <EnvironmentVariable
                    name="TOMO_AGENT_MODEL"
                    value={config.modelId}
                  >
                    <EnvironmentVariableGroup>
                      <EnvironmentVariableName />
                    </EnvironmentVariableGroup>
                    <EnvironmentVariableGroup>
                      <EnvironmentVariableValue />
                      <EnvironmentVariableCopyButton copyFormat="value" />
                    </EnvironmentVariableGroup>
                  </EnvironmentVariable>

                  <EnvironmentVariable
                    name="TOMO_AGENT_BEARER_KEY"
                    value={config.apiKey || "not-configured"}
                  >
                    <EnvironmentVariableGroup>
                      <EnvironmentVariableName />
                    </EnvironmentVariableGroup>
                    <EnvironmentVariableGroup>
                      <EnvironmentVariableValue />
                      <EnvironmentVariableCopyButton copyFormat="name" />
                    </EnvironmentVariableGroup>
                  </EnvironmentVariable>
                </EnvironmentVariablesContent>
              </EnvironmentVariables>
            </TabsContent>

            {/* TAB 3: VOICE & PERSONA */}
            <TabsContent className="mt-0 space-y-5" value="voice">
              {/* Interactive Persona Stage + 5-State Tester */}
              <div className="space-y-4 rounded-xl border border-border bg-card p-4">
                <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                  <div className="flex size-28 shrink-0 items-center justify-center rounded-2xl border border-border bg-muted/40">
                    {!enableLiveRive || riveFailed ? (
                      <AgentPersonaOrb
                        size="lg"
                        state={previewState}
                        variant={config.personaVariant}
                      />
                    ) : (
                      <AgentErrorBoundary>
                        <Persona
                          className="size-24"
                          onLoadError={() => setRiveFailed(true)}
                          state={previewState}
                          variant={config.personaVariant}
                        />
                      </AgentErrorBoundary>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold">
                          Interactive Persona &amp; State Machine
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          Preview all 6 AI Persona variants and test the 5 state
                          machine animations live.
                        </p>
                      </div>
                      <Button
                        className="h-7 px-2.5 text-xs"
                        onClick={() => {
                          setRiveFailed(false);
                          setEnableLiveRive((v) => !v);
                        }}
                        size="xs"
                        type="button"
                        variant={enableLiveRive ? "secondary" : "outline"}
                      >
                        {enableLiveRive ? "WebGL2 Rive: On" : "Enable 3D Rive"}
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {PERSONA_STATES.map((stateName) => (
                        <Button
                          className="h-7 px-2.5 text-xs capitalize"
                          key={stateName}
                          onClick={() => setPreviewState(stateName)}
                          size="xs"
                          type="button"
                          variant={
                            previewState === stateName ? "default" : "outline"
                          }
                        >
                          {stateName}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 6 Persona Variants Gallery */}
                <div className="agent-persona-gallery">
                  {PERSONA_VARIANTS.map((variant) => {
                    const selected = config.personaVariant === variant.id;
                    return (
                      <button
                        className={cn(
                          "flex min-w-0 items-center gap-2 rounded-lg border p-2 text-left transition-all hover:bg-accent/50",
                          selected
                            ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                            : "border-border bg-background"
                        )}
                        key={variant.id}
                        onClick={() =>
                          onUpdateConfig({ personaVariant: variant.id })
                        }
                        type="button"
                      >
                        <AgentPersonaOrb
                          size="sm"
                          state={selected ? previewState : "idle"}
                          variant={variant.id}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold">
                            {variant.label}
                          </div>
                          <div className="truncate text-[10px] text-muted-foreground">
                            {variant.vibe}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Voice Selector & Audio Controls */}
              <div className="space-y-4 rounded-xl border border-border bg-card p-4">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-semibold">
                    Voice Narration &amp; Speech Input
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Choose an assistant voice with live WAV synthesis preview,
                    dictation language, and input microphone device.
                  </p>
                </div>

                <div className="agent-inspector-grid">
                  {/* VoiceSelector Dialog Trigger */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-medium">Assistant Voice</span>
                    <VoiceSelector
                      onOpenChange={setVoiceModalOpen}
                      onValueChange={(val) => {
                        if (val) {
                          onUpdateConfig({ voiceId: val });
                        }
                      }}
                      open={voiceModalOpen}
                      value={config.voiceId}
                    >
                      <VoiceSelectorTrigger asChild>
                        <Button
                          className="h-9 w-full justify-between px-3 text-xs"
                          type="button"
                          variant="outline"
                        >
                          <span className="flex items-center gap-2 truncate">
                            <Volume2Icon className="size-3.5 text-primary" />
                            <span className="font-medium">
                              {selectedVoice.name}
                            </span>
                            <span className="text-muted-foreground">
                              ({selectedVoice.language})
                            </span>
                          </span>
                          <ChevronDownIcon className="size-3.5 opacity-60" />
                        </Button>
                      </VoiceSelectorTrigger>

                      <VoiceSelectorContent title="Select Assistant Voice">
                        <VoiceSelectorInput placeholder="Search voices by name, accent, or language..." />
                        <VoiceSelectorList>
                          <VoiceSelectorEmpty>
                            No matching voices.
                          </VoiceSelectorEmpty>
                          <VoiceSelectorGroup heading="Tomo Studio Voices">
                            {VOICE_CATALOG.map((voice, idx) => (
                              <div key={voice.id}>
                                {idx > 0 && <VoiceSelectorSeparator />}
                                <VoiceSelectorItem
                                  className="flex items-center gap-3"
                                  onSelect={() => {
                                    onUpdateConfig({ voiceId: voice.id });
                                    setVoiceModalOpen(false);
                                  }}
                                  value={`${voice.name} ${voice.accent} ${voice.language} ${voice.description}`}
                                >
                                  <VoiceSelectorPreview
                                    onPlay={() => {
                                      void handlePlayVoicePreview(voice.id);
                                    }}
                                    playing={playingVoiceId === voice.id}
                                  />
                                  <div className="min-w-0 flex-1 space-y-0.5">
                                    <div className="flex items-center gap-2">
                                      <VoiceSelectorName className="text-xs">
                                        {voice.name}
                                      </VoiceSelectorName>
                                      <VoiceSelectorAttributes>
                                        <VoiceSelectorGender
                                          value={voice.gender}
                                        />
                                        <VoiceSelectorBullet className="mx-1" />
                                        <VoiceSelectorAccent
                                          value={voice.accent}
                                        >
                                          {voice.accent === "vietnamese"
                                            ? "🇻🇳"
                                            : undefined}
                                        </VoiceSelectorAccent>
                                        <VoiceSelectorBullet className="mx-1" />
                                        <VoiceSelectorAge>
                                          {voice.age}
                                        </VoiceSelectorAge>
                                      </VoiceSelectorAttributes>
                                    </div>
                                    <VoiceSelectorDescription className="line-clamp-1">
                                      {voice.description}
                                    </VoiceSelectorDescription>
                                  </div>
                                  <VoiceSelectorShortcut>
                                    {voice.language}
                                  </VoiceSelectorShortcut>
                                  {config.voiceId === voice.id && (
                                    <CheckIcon className="size-3.5 text-primary" />
                                  )}
                                </VoiceSelectorItem>
                              </div>
                            ))}
                          </VoiceSelectorGroup>
                        </VoiceSelectorList>
                      </VoiceSelectorContent>
                    </VoiceSelector>
                  </div>

                  {/* Speech Recognition Language */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-medium">
                      Dictation Language
                    </span>
                    <Select
                      onValueChange={(val) =>
                        onUpdateConfig({ speechLang: val })
                      }
                      value={config.speechLang}
                    >
                      <SelectTrigger
                        aria-label="Dictation language"
                        className="h-9 w-full text-xs"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en-US">English (en-US)</SelectItem>
                        <SelectItem value="vi-VN">
                          Tiếng Việt (vi-VN)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Microphone Device Selector */}
                {canEnumerateMics && (
                  <div className="space-y-1.5">
                    <span className="text-xs font-medium">
                      Microphone Input Device
                    </span>
                    <MicSelector
                      onValueChange={onSetMicDeviceId}
                      value={micDeviceId}
                    >
                      <MicSelectorTrigger className="h-9 w-full justify-between px-3 text-xs">
                        <span className="flex min-w-0 items-center gap-2">
                          <MicIcon className="size-3.5 shrink-0 text-primary" />
                          <MicSelectorValue className="truncate" />
                        </span>
                      </MicSelectorTrigger>
                      <MicSelectorContent>
                        <MicSelectorInput />
                        <MicSelectorList>
                          {(devices) =>
                            devices.length === 0 ? (
                              <MicSelectorEmpty />
                            ) : (
                              devices.map((device, index) => (
                                <MicSelectorItem
                                  key={device.deviceId || `mic-${index}`}
                                  value={device.deviceId || `mic-${index}`}
                                >
                                  <MicSelectorLabel
                                    device={
                                      device.label
                                        ? device
                                        : ({
                                            ...device,
                                            label: `Microphone ${index + 1}`,
                                          } as MediaDeviceInfo)
                                    }
                                  />
                                </MicSelectorItem>
                              ))
                            )
                          }
                        </MicSelectorList>
                      </MicSelectorContent>
                    </MicSelector>
                  </div>
                )}
              </div>
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
