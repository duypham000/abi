import { Button } from "@/components/ui/button";
import { Persona, type PersonaState } from "@/components/ai-elements/persona";
import type { AgentPersonaState, PersonaVariant } from "@/core/interfaces/agent";
import { cn } from "@/lib/utils";
import { AlertTriangleIcon, RotateCcwIcon } from "lucide-react";
import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";

export interface AgentErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  title?: string;
  className?: string;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onReset?: () => void;
}

interface AgentErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Defensive error boundary isolating rich media, WebGL, and dynamic JSX widgets
 * so a widget failure never crashes the surrounding Agent conversation panel.
 */
export class AgentErrorBoundary extends Component<
  AgentErrorBoundaryProps,
  AgentErrorBoundaryState
> {
  public state: AgentErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): AgentErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.props.onError?.(error, errorInfo);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  public render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const activeError =
      this.state.error ?? new Error("Unexpected widget rendering error");

    if (typeof this.props.fallback === "function") {
      return this.props.fallback(activeError, this.handleReset);
    }

    if (this.props.fallback !== undefined) {
      return this.props.fallback;
    }

    return (
      <div
        className={cn(
          "flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-foreground",
          this.props.className
        )}
        role="alert"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-medium text-destructive">
            <AlertTriangleIcon className="size-4 shrink-0" />
            <span>{this.props.title ?? "Failed to render widget"}</span>
          </div>
          <Button
            className="h-7 gap-1 px-2 text-xs"
            onClick={this.handleReset}
            size="sm"
            type="button"
            variant="outline"
          >
            <RotateCcwIcon className="size-3" />
            Retry
          </Button>
        </div>
        {activeError.message && (
          <p className="line-clamp-3 font-mono text-[11px] text-muted-foreground">
            {activeError.message}
          </p>
        )}
      </div>
    );
  }
}

export type AgentPersonaOrbSize = "xs" | "sm" | "md" | "lg";

export interface AgentPersonaOrbProps {
  state: AgentPersonaState;
  variant?: PersonaVariant;
  size?: AgentPersonaOrbSize;
  className?: string;
  /**
   * Defaults to false so header, empty-state, and gallery orbs render the
   * zero-WASM animated CSS/SVG orb instead of spawning WebGL2 + Rive WASM
   * instances and fetching remote .riv binaries on mount.
   */
  enableWebGL?: boolean;
}

const ORB_SIZE_CLASSES: Record<AgentPersonaOrbSize, string> = {
  xs: "size-5",
  sm: "size-6",
  md: "size-9",
  lg: "size-12",
};

const VARIANT_GRADIENTS: Record<PersonaVariant, string> = {
  command:
    "from-sky-500/85 via-indigo-500/80 to-slate-900 dark:from-sky-400/90 dark:via-indigo-500/85 dark:to-slate-950",
  glint:
    "from-amber-400/85 via-orange-500/80 to-rose-600 dark:from-amber-300/90 dark:via-orange-500/85 dark:to-rose-700",
  halo:
    "from-cyan-400/85 via-blue-500/80 to-violet-600 dark:from-cyan-300/90 dark:via-blue-500/85 dark:to-violet-700",
  mana:
    "from-violet-500/85 via-fuchsia-500/80 to-indigo-700 dark:from-violet-400/90 dark:via-fuchsia-500/85 dark:to-indigo-800",
  obsidian:
    "from-slate-600/90 via-zinc-800/90 to-zinc-950 dark:from-zinc-300/85 dark:via-slate-500/85 dark:to-zinc-900",
  opal:
    "from-teal-400/85 via-sky-400/80 to-purple-500 dark:from-teal-300/90 dark:via-sky-400/85 dark:to-purple-600",
};

const STATE_RING_CLASSES: Record<PersonaState, string> = {
  idle: "ring-1 ring-primary/25 shadow-xs",
  listening:
    "ring-2 ring-emerald-500/60 shadow-[0_0_12px_rgba(16,185,129,0.35)]",
  thinking:
    "ring-2 ring-sky-500/60 shadow-[0_0_12px_rgba(56,189,248,0.35)]",
  speaking:
    "ring-2 ring-violet-500/60 shadow-[0_0_14px_rgba(139,92,246,0.4)]",
  asleep: "opacity-60 ring-1 ring-border",
};

interface FallbackOrbProps {
  state: AgentPersonaState;
  variant: PersonaVariant;
  size: AgentPersonaOrbSize;
  className?: string;
}

function FallbackOrb({ state, variant, size, className }: FallbackOrbProps) {
  const sizeClass = ORB_SIZE_CLASSES[size];
  const gradientClass = VARIANT_GRADIENTS[variant];
  const stateRingClass = STATE_RING_CLASSES[state];

  return (
    <span
      aria-label={`Agent status: ${state}`}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br transition-all duration-300",
        sizeClass,
        gradientClass,
        stateRingClass,
        className
      )}
      role="img"
    >
      {state === "listening" && (
        <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/35" />
      )}

      {state === "thinking" && (
        <svg
          aria-hidden="true"
          className="absolute inset-0 size-full animate-spin"
          viewBox="0 0 36 36"
        >
          <circle
            cx="18"
            cy="18"
            fill="none"
            r="15"
            stroke="rgba(255,255,255,0.7)"
            strokeDasharray="28 66"
            strokeLinecap="round"
            strokeWidth="2.5"
          />
        </svg>
      )}

      {state === "speaking" && (
        <span className="relative z-10 flex items-center gap-[2px]">
          <span className="h-2 w-[2px] animate-pulse rounded-full bg-white/95" />
          <span className="h-3.5 w-[2px] animate-bounce rounded-full bg-white/95" />
          <span className="h-2.5 w-[2px] animate-pulse rounded-full bg-white/95" />
        </span>
      )}

      {state === "idle" && (
        <span className="relative z-10 size-2.5 animate-pulse rounded-full bg-white/85 shadow-sm" />
      )}

      {state === "listening" && (
        <span className="relative z-10 size-2.5 rounded-full bg-emerald-100 shadow-sm" />
      )}

      {state === "thinking" && (
        <span className="relative z-10 size-2 rounded-full bg-sky-100/90" />
      )}

      {state === "asleep" && (
        <span className="relative z-10 h-[2px] w-3 rounded-full bg-white/65" />
      )}

      <span className="pointer-events-none absolute inset-[2px] rounded-full bg-gradient-to-t from-transparent via-transparent to-white/25" />
    </span>
  );
}

/**
 * Renders the AI Elements <Persona> orb inside an error boundary.
 * Defaults to the lightweight CSS/SVG orb (`enableWebGL = false`) so opening
 * the Agent Panel does not allocate multiple WebGL2 + Rive WASM heaps.
 */
export function AgentPersonaOrb({
  state,
  variant = "obsidian",
  size = "md",
  className,
  enableWebGL = false,
}: AgentPersonaOrbProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [variant]);

  const sizeClass = ORB_SIZE_CLASSES[size];
  const fallback = (
    <FallbackOrb
      className={className}
      size={size}
      state={state}
      variant={variant}
    />
  );

  if (!enableWebGL || failed) {
    return fallback;
  }

  return (
    <AgentErrorBoundary fallback={fallback}>
      <span
        aria-label={`Agent persona (${state})`}
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
          sizeClass,
          className
        )}
      >
        <Persona
          className={cn(sizeClass, "pointer-events-none")}
          onLoadError={() => setFailed(true)}
          state={state}
          variant={variant}
        />
      </span>
    </AgentErrorBoundary>
  );
}
