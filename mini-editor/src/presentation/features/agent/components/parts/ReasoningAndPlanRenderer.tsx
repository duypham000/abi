import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Agent,
  AgentContent,
  AgentHeader,
  AgentInstructions,
  AgentOutput,
  AgentTool,
  AgentTools,
} from "@/components/ai-elements/agent";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtImage,
  ChainOfThoughtSearchResult,
  ChainOfThoughtSearchResults,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import {
  Plan,
  PlanAction,
  PlanContent,
  PlanDescription,
  PlanFooter,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from "@/components/ai-elements/plan";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Task,
  TaskContent,
  TaskItem,
  TaskItemFile,
  TaskTrigger,
} from "@/components/ai-elements/task";
import type {
  ChainOfThoughtDataPart,
  ChainOfThoughtStepItem,
  PlanDataPart,
  PlanStepItem,
  SubagentDataPart,
  SubagentToolSchemaRef,
  TaskGroupDataPart,
  TaskGroupItem,
} from "@/core/interfaces/agent";
import { cn } from "@/lib/utils";
import type { ReasoningUIPart, Tool } from "ai";
import {
  AlertCircleIcon,
  BrainIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleDashedIcon,
  CodeIcon,
  FileCode2Icon,
  FileTextIcon,
  ListChecksIcon,
  Loader2Icon,
  PlayIcon,
  SearchIcon,
  SparklesIcon,
  TerminalIcon,
  type LucideIcon,
} from "lucide-react";

const COT_ICON_MAP: Record<string, LucideIcon> = {
  brain: BrainIcon,
  search: SearchIcon,
  file: FileTextIcon,
  code: CodeIcon,
  terminal: TerminalIcon,
  check: CheckCircle2Icon,
  sparkles: SparklesIcon,
};

function resolveCotIcon(
  icon?: ChainOfThoughtStepItem["icon"] | "sparkles"
): LucideIcon {
  if (!icon) return SparklesIcon;
  return COT_ICON_MAP[icon] ?? SparklesIcon;
}

export function ReasoningBlock({ part }: { part: ReasoningUIPart }) {
  const isStreaming = part.state === "streaming";
  const textContent = part.text.trim() ? part.text : "Thinking...";

  return (
    <Reasoning className="mb-2" isStreaming={isStreaming}>
      <ReasoningTrigger
        getThinkingMessage={(streaming) =>
          streaming ? (
            <Shimmer duration={1}>Thinking...</Shimmer>
          ) : (
            <p>Thinking Process</p>
          )
        }
      />
      <ReasoningContent>{textContent}</ReasoningContent>
    </Reasoning>
  );
}

export function ChainOfThoughtCard({ data }: { data: ChainOfThoughtDataPart }) {
  const hasActiveStep = data.steps.some((step) => step.status === "active");

  return (
    <ChainOfThought
      className="rounded-lg border bg-card/50 p-3"
      defaultOpen={data.defaultOpen ?? hasActiveStep}
    >
      <ChainOfThoughtHeader>
        {hasActiveStep ? (
          <Shimmer as="span" className="text-sm font-medium" duration={1.4}>
            {data.title}
          </Shimmer>
        ) : (
          <span className="font-medium text-foreground">{data.title}</span>
        )}
      </ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {data.steps.map((step) => {
          const IconComponent = resolveCotIcon(step.icon);
          return (
            <ChainOfThoughtStep
              description={step.description}
              icon={IconComponent}
              key={step.id}
              label={
                step.status === "active" ? (
                  <Shimmer as="span" duration={1.3}>
                    {step.label}
                  </Shimmer>
                ) : (
                  step.label
                )
              }
              status={step.status}
            >
              {step.searchResults && step.searchResults.length > 0 && (
                <ChainOfThoughtSearchResults>
                  {step.searchResults.map((result) => (
                    <ChainOfThoughtSearchResult key={result}>
                      {result}
                    </ChainOfThoughtSearchResult>
                  ))}
                </ChainOfThoughtSearchResults>
              )}
              {step.caption && (
                <ChainOfThoughtImage caption={step.caption}>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <SparklesIcon className="size-4 text-primary" />
                    <span>{step.caption}</span>
                  </div>
                </ChainOfThoughtImage>
              )}
            </ChainOfThoughtStep>
          );
        })}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}

function renderPlanStepIcon(status: PlanStepItem["status"]) {
  switch (status) {
    case "completed":
      return (
        <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-500" />
      );
    case "in_progress":
      return (
        <Loader2Icon className="mt-0.5 size-4 shrink-0 animate-spin text-sky-500" />
      );
    case "blocked":
      return (
        <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
      );
    default:
      return (
        <CircleDashedIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      );
  }
}

export function PlanCard({
  data,
  onSendFollowUp,
}: {
  data: PlanDataPart;
  onSendFollowUp?: (prompt: string) => void;
}) {
  const completedCount = data.steps.filter(
    (step) => step.status === "completed"
  ).length;
  const allCompleted =
    data.steps.length > 0 && completedCount === data.steps.length;

  return (
    <Plan
      className="gap-3 py-3"
      defaultOpen
      isStreaming={Boolean(data.isStreaming)}
    >
      <PlanHeader className="gap-2 px-3.5 pb-1">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <PlanTitle className="text-xs sm:text-sm">{data.title}</PlanTitle>
            {data.estimatedDuration && (
              <Badge className="font-mono text-[10px]" variant="secondary">
                {data.estimatedDuration}
              </Badge>
            )}
          </div>
          <PlanDescription className="text-xs">
            {data.description}
          </PlanDescription>
        </div>
        <PlanAction className="flex items-center gap-1">
          <PlanTrigger className="size-7" />
        </PlanAction>
      </PlanHeader>

      <PlanContent className="space-y-2 px-3.5 pt-0 pb-1">
        {data.steps.map((step, index) => (
          <div
            className={cn(
              "flex min-w-0 items-start gap-2 rounded-md border px-2.5 py-2 text-xs",
              step.status === "in_progress"
                ? "border-sky-500/30 bg-sky-500/5"
                : "bg-muted/25"
            )}
            key={step.id}
          >
            {renderPlanStepIcon(step.status)}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-1.5 font-medium text-foreground">
                <span className="min-w-0 break-words">
                  {index + 1}.{" "}
                  {step.status === "in_progress" ? (
                    <Shimmer as="span" duration={1.3}>
                      {step.title}
                    </Shimmer>
                  ) : (
                    step.title
                  )}
                </span>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {step.status.replace(/_/g, " ")}
                </span>
              </div>
              {step.description && (
                <p className="break-words text-muted-foreground">
                  {step.description}
                </p>
              )}
              {step.files && step.files.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {step.files.map((filePath) => (
                    <Badge
                      className="max-w-full truncate font-mono text-[10px]"
                      key={filePath}
                      variant="outline"
                    >
                      {filePath}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </PlanContent>

      <PlanFooter className="flex flex-wrap items-center justify-between gap-2 border-t px-3.5 pt-2.5 text-xs">
        <span className="text-muted-foreground">
          {data.footerNote ??
            `${completedCount}/${data.steps.length} steps completed`}
        </span>
        {onSendFollowUp && (
          <Button
            className="h-7 gap-1.5 text-xs"
            disabled={Boolean(data.isStreaming)}
            onClick={() =>
              onSendFollowUp("Execute the approved plan steps now.")
            }
            size="sm"
            type="button"
            variant={allCompleted ? "outline" : "default"}
          >
            <PlayIcon className="size-3" />
            Approve &amp; Execute Plan
          </Button>
        )}
      </PlanFooter>
    </Plan>
  );
}

function renderTaskStatusIcon(status?: TaskGroupItem["status"]) {
  switch (status) {
    case "completed":
      return <CheckCircle2Icon className="size-3.5 shrink-0 text-emerald-500" />;
    case "running":
      return (
        <Loader2Icon className="size-3.5 shrink-0 animate-spin text-sky-500" />
      );
    case "error":
      return <AlertCircleIcon className="size-3.5 shrink-0 text-destructive" />;
    default:
      return (
        <CircleDashedIcon className="size-3.5 shrink-0 text-muted-foreground" />
      );
  }
}

export function TaskGroupCard({ data }: { data: TaskGroupDataPart }) {
  const completedCount = data.items.filter(
    (item) => item.status === "completed"
  ).length;

  return (
    <Task
      className="rounded-lg border bg-card/50 p-3"
      defaultOpen={data.defaultOpen ?? true}
    >
      <TaskTrigger title={data.title}>
        <div className="flex w-full cursor-pointer items-center justify-between gap-2 text-sm text-foreground transition-colors hover:text-primary">
          <div className="flex min-w-0 items-center gap-2">
            <ListChecksIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium">{data.title}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge className="font-mono text-[10px]" variant="secondary">
              {completedCount}/{data.items.length}
            </Badge>
            <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </div>
        </div>
      </TaskTrigger>
      <TaskContent>
        {data.items.map((item) => (
          <TaskItem className="space-y-1.5 text-xs" key={item.id}>
            <div className="flex items-start gap-2">
              <span className="mt-0.5">{renderTaskStatusIcon(item.status)}</span>
              <span className="text-foreground">
                {item.status === "running" ? (
                  <Shimmer as="span" duration={1.3}>
                    {item.text}
                  </Shimmer>
                ) : (
                  item.text
                )}
              </span>
            </div>
            {item.files && item.files.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pl-5">
                {item.files.map((file) => (
                  <TaskItemFile
                    key={`${item.id}-${file.path}`}
                    title={file.path}
                  >
                    <FileCode2Icon className="size-3 text-muted-foreground" />
                    <span className="font-mono">{file.name}</span>
                  </TaskItemFile>
                ))}
              </div>
            )}
          </TaskItem>
        ))}
      </TaskContent>
    </Task>
  );
}

function toAiSdkTool(toolRef: SubagentToolSchemaRef): Tool {
  let parsedSchema: Record<string, unknown>;
  try {
    const parsed = JSON.parse(toolRef.inputSchemaJson) as unknown;
    parsedSchema =
      parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : { raw: toolRef.inputSchemaJson };
  } catch {
    parsedSchema = { raw: toolRef.inputSchemaJson };
  }

  return {
    description: `${toolRef.name} — ${toolRef.description}`,
    inputSchema: parsedSchema,
    jsonSchema: parsedSchema,
  } as unknown as Tool;
}

const SUBAGENT_STATUS_STYLES: Record<SubagentDataPart["status"], string> = {
  idle: "bg-muted text-muted-foreground",
  running: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  completed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  error: "bg-red-500/15 text-red-600 dark:text-red-400",
};

export function SubagentCard({ data }: { data: SubagentDataPart }) {
  return (
    <Agent className="bg-card/50">
      <AgentHeader model={data.model} name={`${data.name} • ${data.role}`} />
      <AgentContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background/60 px-3 py-2 text-xs">
          <div className="min-w-0 flex-1 text-foreground">
            {data.status === "running" ? (
              <Shimmer as="span" duration={1.3}>
                {data.summary || "Executing delegated subtask..."}
              </Shimmer>
            ) : (
              data.summary
            )}
          </div>
          <Badge
            className={cn(
              "shrink-0 capitalize text-[10px]",
              SUBAGENT_STATUS_STYLES[data.status]
            )}
            variant="secondary"
          >
            {data.status}
          </Badge>
        </div>

        {data.instructions && (
          <AgentInstructions className="text-xs">
            {data.instructions}
          </AgentInstructions>
        )}

        {data.tools.length > 0 && (
          <AgentTools collapsible type="single">
            {data.tools.map((toolRef) => (
              <AgentTool
                key={toolRef.name}
                tool={toAiSdkTool(toolRef)}
                value={toolRef.name}
              />
            ))}
          </AgentTools>
        )}

        {data.outputSchemaJson && <AgentOutput schema={data.outputSchemaJson} />}
      </AgentContent>
    </Agent>
  );
}
