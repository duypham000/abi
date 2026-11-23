import { useAgentStore } from "./store/agentStore";

let agentPanelPromise: Promise<unknown> | null = null;
let workflowPanelPromise: Promise<unknown> | null = null;
let secondaryTabsPromise: Promise<unknown> | null = null;

/**
 * Idempotently preloads the Agent chat panel chunk (`AgentPanelPage`).
 * Safe to invoke on hover/focus intent or from idle background warming.
 */
export function preloadAgentPanel(): Promise<unknown> {
  if (!agentPanelPromise) {
    agentPanelPromise = import("./pages/AgentPanelPage").catch((err) => {
      agentPanelPromise = null;
      return Promise.reject(err);
    });
  }
  return agentPanelPromise.catch(() => undefined);
}

/**
 * Idempotently preloads the standalone Workflow tab chunk (`WorkflowPanelPage`
 * + `@xyflow/react`). Safe to invoke on hover/focus or background idle.
 */
export function preloadWorkflowPanel(): Promise<unknown> {
  if (!workflowPanelPromise) {
    workflowPanelPromise = import("./pages/WorkflowPanelPage").catch((err) => {
      workflowPanelPromise = null;
      return Promise.reject(err);
    });
  }
  return workflowPanelPromise.catch(() => undefined);
}

/**
 * Sequentially warms secondary Agent drawer tabs (`AgentArtifactPane`,
 * `AgentInspectorDrawer`) so tab switching is instant without racing chunks.
 */
export function preloadAgentSecondaryTabs(): Promise<unknown> {
  if (!secondaryTabsPromise) {
    secondaryTabsPromise = import("./components/AgentArtifactPane")
      .then(() => import("./components/AgentInspectorDrawer"))
      .catch((err) => {
        secondaryTabsPromise = null;
        return Promise.reject(err);
      });
  }
  return secondaryTabsPromise.catch(() => undefined);
}

interface IdleCapableWindow {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout?: number }
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
}

function runWhenIdle(
  callback: () => void,
  delayMs: number,
  idleTimeoutMs = 2000
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  let delayTimer: number | null = null;
  let idleHandle: number | null = null;
  let fallbackTimer: number | null = null;
  const idleWin = window as unknown as IdleCapableWindow;

  delayTimer = window.setTimeout(() => {
    delayTimer = null;
    if (typeof idleWin.requestIdleCallback === "function") {
      idleHandle = idleWin.requestIdleCallback(
        () => {
          idleHandle = null;
          callback();
        },
        { timeout: idleTimeoutMs }
      );
    } else {
      fallbackTimer = window.setTimeout(() => {
        fallbackTimer = null;
        callback();
      }, 150);
    }
  }, delayMs);

  return () => {
    if (delayTimer !== null) {
      window.clearTimeout(delayTimer);
      delayTimer = null;
    }
    if (
      idleHandle !== null &&
      typeof idleWin.cancelIdleCallback === "function"
    ) {
      idleWin.cancelIdleCallback(idleHandle);
      idleHandle = null;
    }
    if (fallbackTimer !== null) {
      window.clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
  };
}

/**
 * Staggers background store hydration and lazy chunk warming across 3 sequential
 * idle stages after the main workspace finishes booting, so opening Agent +
 * Workflow simultaneously feels instant and never causes concurrent Vite/network spikes.
 */
export function scheduleBackgroundAgentPreload(): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  let cancelled = false;
  let cancelStage: (() => void) | null = null;

  cancelStage = runWhenIdle(() => {
    if (cancelled) return;

    void useAgentStore
      .getState()
      .hydrate()
      .catch(() => undefined)
      .then(() => (cancelled ? undefined : preloadAgentPanel()))
      .finally(() => {
        if (cancelled) return;
        cancelStage = runWhenIdle(() => {
          if (cancelled) return;
          void preloadWorkflowPanel().finally(() => {
            if (cancelled) return;
            cancelStage = runWhenIdle(() => {
              if (cancelled) return;
              void preloadAgentSecondaryTabs();
            }, 1600);
          });
        }, 1400);
      });
  }, 1200);

  return () => {
    cancelled = true;
    cancelStage?.();
    cancelStage = null;
  };
}
