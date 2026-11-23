import type { AgentScenarioId } from "@/core/interfaces/agent";
function isStaticToolUIPartLocal(part: { type: string }): boolean {
  return (
    part.type.startsWith("tool-") &&
    part.type !== "tool-invocation" &&
    part.type !== "tool-result"
  );
}
import { runApprovalAndQuestionScenario } from "./approvalAndQuestionScenario";
import { runDebugAndDiagnosticsScenario } from "./debugAndDiagnosticsScenario";
import { runFullstackFeatureScenario } from "./fullstackFeatureScenario";
import { runGeneralFallbackScenario } from "./generalFallbackScenario";
import { runGenerativeUiAndMediaScenario } from "./generativeUiAndMediaScenario";
import { runMultiAgentWorkflowScenario } from "./multiAgentWorkflowScenario";
import { runResearchCitationsScenario } from "./researchCitationsScenario";
import type { MockStreamBuilder, StreamScenarioContext } from "./streamBuilder";

export type ScenarioRunner = (
  ctx: StreamScenarioContext,
  builder: MockStreamBuilder
) => Promise<void>;

const SCENARIO_RUNNERS: Record<AgentScenarioId, ScenarioRunner> = {
  fullstack: runFullstackFeatureScenario,
  research: runResearchCitationsScenario,
  approval: runApprovalAndQuestionScenario,
  debug: runDebugAndDiagnosticsScenario,
  "generative-media": runGenerativeUiAndMediaScenario,
  workflow: runMultiAgentWorkflowScenario,
};

function matchesSlashOrKeyword(
  lowerPrompt: string,
  commands: string[],
  keywords: string[]
): boolean {
  for (const cmd of commands) {
    if (
      lowerPrompt === cmd ||
      lowerPrompt.startsWith(`${cmd} `) ||
      lowerPrompt.includes(` ${cmd} `)
    ) {
      return true;
    }
  }
  for (const kw of keywords) {
    if (lowerPrompt.includes(kw)) {
      return true;
    }
  }
  return false;
}

export function resolveScenarioRunner(
  ctx: StreamScenarioContext
): ScenarioRunner {
  // 1. Tool approval / ask_user continuation on an existing assistant message
  if (ctx.lastMessage?.role === "assistant") {
    const hasInteractiveTool = ctx.lastMessage.parts.some(
      (part) =>
        isStaticToolUIPartLocal(part) &&
        (part.type === "tool-ask_user" ||
          part.type === "tool-git_push" ||
          part.type === "tool-apply_migration")
    );
    if (
      hasInteractiveTool ||
      ctx.lastMessage.metadata?.scenarioTag === "approval"
    ) {
      return runApprovalAndQuestionScenario;
    }
  }

  // 2. Explicit scenario hint from Scenario Launchers or AskAIRequest
  if (ctx.scenarioHint && SCENARIO_RUNNERS[ctx.scenarioHint]) {
    return SCENARIO_RUNNERS[ctx.scenarioHint];
  }

  // 3. Slash command & natural-language keyword routing
  const lower = ctx.prompt.trim().toLowerCase();

  if (
    matchesSlashOrKeyword(
      lower,
      ["/approval", "/question", "/deploy", "/delete", "/push"],
      ["deploy", "push to ", "apply migration", "delete doc", "approval flow"]
    )
  ) {
    return runApprovalAndQuestionScenario;
  }

  if (
    matchesSlashOrKeyword(
      lower,
      ["/debug", "/error", "/diagnose", "/audit"],
      ["stack trace", "reproduce", "fix bug", "diagnose", "audit"]
    ) ||
    (ctx.config.mode === "debug" &&
      (lower.includes("error") ||
        lower.includes("fail") ||
        lower.includes("fix") ||
        lower.includes("bug")))
  ) {
    return runDebugAndDiagnosticsScenario;
  }

  if (
    matchesSlashOrKeyword(
      lower,
      ["/artifact", "/ui", "/preview", "/voice", "/media"],
      [
        "web preview",
        "jsx preview",
        "generate image",
        "voice",
        "audio",
        "speech",
        "narration",
      ]
    )
  ) {
    return runGenerativeUiAndMediaScenario;
  }

  if (
    matchesSlashOrKeyword(
      lower,
      ["/workflow", "/team", "/subagents", "/orchestrate"],
      ["subagent", "multi-agent", "workflow", "orchestrate"]
    )
  ) {
    return runMultiAgentWorkflowScenario;
  }

  if (
    matchesSlashOrKeyword(
      lower,
      ["/research", "/search"],
      ["research", "citation", "compare", "tradeoff"]
    )
  ) {
    return runResearchCitationsScenario;
  }

  if (
    matchesSlashOrKeyword(
      lower,
      ["/code", "/plan", "/feature"],
      ["implement", "refactor", "scaffold", "fullstack"]
    )
  ) {
    return runFullstackFeatureScenario;
  }

  return runGeneralFallbackScenario;
}

export {
  createScenarioReadableStream,
  MockStreamBuilder,
  type StreamScenarioContext,
} from "./streamBuilder";
