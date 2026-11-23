import { useEffect, useRef } from "react";
import { useAgentStore } from "../store/agentStore";

export interface UseAgentKeyboardShortcutsOptions {
  isStreaming?: boolean;
  onStop?: () => void;
  enabled?: boolean;
}

function isInsideAgentRoot(event: KeyboardEvent): boolean {
  if (typeof document === "undefined") return false;
  if (
    event.target instanceof Element &&
    event.target.closest(".ai-agent-root") !== null
  ) {
    return true;
  }
  if (
    document.activeElement instanceof Element &&
    document.activeElement.closest(".ai-agent-root") !== null
  ) {
    return true;
  }
  return false;
}

export function useAgentKeyboardShortcuts(
  options: UseAgentKeyboardShortcutsOptions = {}
): void {
  const { isStreaming = false, onStop, enabled = true } = options;

  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;

  const onStopRef = useRef(onStop);
  onStopRef.current = onStop;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;

      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "a"
      ) {
        e.preventDefault();
        useAgentStore.getState().toggleDock();
        return;
      }

      if (
        e.key === "Escape" &&
        isStreamingRef.current &&
        isInsideAgentRoot(e)
      ) {
        e.preventDefault();
        onStopRef.current?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabled]);
}
