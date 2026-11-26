import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Artifact,
  ArtifactAction,
  ArtifactActions,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from "@/components/ai-elements/artifact";
import {
  AudioPlayer,
  AudioPlayerControlBar,
  AudioPlayerDurationDisplay,
  AudioPlayerElement,
  AudioPlayerMuteButton,
  AudioPlayerPlayButton,
  AudioPlayerSeekBackwardButton,
  AudioPlayerSeekForwardButton,
  AudioPlayerTimeDisplay,
  AudioPlayerTimeRange,
  AudioPlayerVolumeRange,
} from "@/components/ai-elements/audio-player";
import {
  Checkpoint,
  CheckpointIcon,
  CheckpointTrigger,
} from "@/components/ai-elements/checkpoint";
import { Image } from "@/components/ai-elements/image";
import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationCardTrigger,
  InlineCitationCarousel,
  InlineCitationCarouselContent,
  InlineCitationCarouselHeader,
  InlineCitationCarouselIndex,
  InlineCitationCarouselItem,
  InlineCitationCarouselNext,
  InlineCitationCarouselPrev,
  InlineCitationQuote,
  InlineCitationSource,
  InlineCitationText,
} from "@/components/ai-elements/inline-citation";
import {
  JSXPreview,
  JSXPreviewContent,
  JSXPreviewError,
} from "@/components/ai-elements/jsx-preview";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/sources";
import {
  Transcription,
  TranscriptionSegment,
} from "@/components/ai-elements/transcription";
import {
  WebPreview,
  WebPreviewBody,
  WebPreviewConsole,
  WebPreviewNavigation,
  WebPreviewNavigationButton,
  WebPreviewUrl,
} from "@/components/ai-elements/web-preview";
import type {
  ArtifactDataPart,
  AudioSpeechDataPart,
  GeneratedImageDataPart,
  InlineCitationsDataPart,
  JsxPreviewDataPart,
  WebPreviewDataPart,
} from "@/core/interfaces/agent";
import { cn } from "@/lib/utils";
import type { SourceDocumentUIPart, SourceUrlUIPart } from "ai";
import {
  DownloadIcon,
  ExternalLinkIcon,
  FileCode2Icon,
  FileTextIcon,
  HistoryIcon,
  Maximize2Icon,
  RotateCwIcon,
  SparklesIcon,
  Volume2Icon,
} from "lucide-react";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import {
  isAgentDeeplinkHref,
  openAgentDeeplinkFromHref,
  resolveAndOpenAgentDeeplink,
} from "@/infrastructure/agent";
import { AgentErrorBoundary } from "../AgentErrorBoundary";

const EMPTY_UINT8_ARRAY = new Uint8Array(0);

const SAFE_JSX_COMPONENTS = {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} as ComponentProps<typeof JSXPreview>["components"];

function normalizeSafeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return parsed.toString();
  } catch {
    return "https://tomo.local/reference";
  }
}

function parseSafeDate(iso: string): Date {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function InlineCitationsCard({
  data,
}: {
  data: InlineCitationsDataPart;
}) {
  return (
    <div className="space-y-2.5 rounded-lg border bg-card/50 p-3.5 text-sm leading-relaxed">
      {data.paragraphs.map((paragraph) => {
        const sourceUrls = paragraph.citations.map((c) =>
          normalizeSafeUrl(c.url)
        );
        return (
          <p className="text-foreground" key={paragraph.id}>
            <span>{paragraph.leadText}</span>
            <InlineCitation>
              <InlineCitationText className="rounded px-0.5 underline decoration-primary/40 decoration-dotted underline-offset-4">
                {paragraph.claimText}
              </InlineCitationText>
              <InlineCitationCard>
                <InlineCitationCardTrigger
                  className="cursor-pointer text-[11px]"
                  sources={sourceUrls}
                />
                <InlineCitationCardBody>
                  <InlineCitationCarousel>
                    <InlineCitationCarouselHeader>
                      <div className="flex items-center gap-1">
                        <InlineCitationCarouselPrev />
                        <InlineCitationCarouselNext />
                      </div>
                      <InlineCitationCarouselIndex />
                    </InlineCitationCarouselHeader>
                    <InlineCitationCarouselContent>
                      {paragraph.citations.map((citation, idx) => (
                        <InlineCitationCarouselItem
                          key={`${paragraph.id}-cit-${idx}`}
                        >
                          <InlineCitationSource
                            description={citation.description}
                            title={citation.title}
                            url={citation.url}
                          />
                          {citation.quote && (
                            <InlineCitationQuote>
                              {citation.quote}
                            </InlineCitationQuote>
                          )}
                        </InlineCitationCarouselItem>
                      ))}
                    </InlineCitationCarouselContent>
                  </InlineCitationCarousel>
                </InlineCitationCardBody>
              </InlineCitationCard>
            </InlineCitation>
            {paragraph.tailText && <span>{paragraph.tailText}</span>}
          </p>
        );
      })}
    </div>
  );
}

export function MessageSourcesBlock({
  sources,
}: {
  sources: (SourceUrlUIPart | SourceDocumentUIPart)[];
}) {
  if (sources.length === 0) {
    return null;
  }

  return (
    <Sources className="mb-1 rounded-lg border bg-muted/25 px-3 py-2">
      <SourcesTrigger
        className="cursor-pointer text-xs font-medium text-primary hover:underline"
        count={sources.length}
      />
      <SourcesContent className="w-full">
        {sources.map((src, index) => {
          if (src.type === "source-url") {
            const isDeeplink = isAgentDeeplinkHref(src.url);
            return (
              <Source
                className="flex items-center gap-2 text-xs text-primary hover:underline"
                href={src.url}
                key={`${src.sourceId}-${index}`}
                onClick={
                  isDeeplink
                    ? (e) => {
                        e.preventDefault();
                        void openAgentDeeplinkFromHref(src.url);
                      }
                    : undefined
                }
                title={src.title ?? src.url}
              />
            );
          }

          const docMatch = src.filename?.match(/(?:docs\/)?doc-([A-Za-z0-9-]+)(?:\.(?:md|json))?/i);
          const canvasMatch = src.filename?.match(/(?:canvases\/)?canvas-([A-Za-z0-9-]+)(?:\.(?:json|excalidraw))?/i);
          const canOpenInternal = Boolean(docMatch || canvasMatch);

          return (
            <Source
              className={cn(
                "flex items-center gap-2 text-xs",
                canOpenInternal ? "cursor-pointer text-primary hover:underline" : "text-foreground"
              )}
              key={`${src.sourceId}-${index}`}
              onClick={(e) => {
                e.preventDefault();
                if (docMatch) {
                  void resolveAndOpenAgentDeeplink({
                    kind: "doc",
                    rawRef: docMatch[1],
                    title: src.title,
                  });
                } else if (canvasMatch) {
                  void resolveAndOpenAgentDeeplink({
                    kind: "canvas",
                    rawRef: canvasMatch[1],
                    title: src.title,
                  });
                }
              }}
              title={src.title}
            >
              <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="font-medium">{src.title}</span>
              {src.filename && (
                <span className="font-mono text-[11px] text-muted-foreground">
                  ({src.filename})
                </span>
              )}
            </Source>
          );
        })}
      </SourcesContent>
    </Sources>
  );
}

export function GeneratedImageCard({
  data,
}: {
  data: GeneratedImageDataPart;
}) {
  const handleDownload = useCallback(() => {
    if (typeof document === "undefined") return;
    const ext = data.mediaType.includes("svg")
      ? "svg"
      : data.mediaType.includes("png")
        ? "png"
        : "jpg";
    const link = document.createElement("a");
    link.href = `data:${data.mediaType};base64,${data.base64}`;
    link.download = `generated-asset.${ext}`;
    link.click();
  }, [data.base64, data.mediaType]);

  return (
    <AgentErrorBoundary title="Generated image failed to load">
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2 text-xs">
          <span className="truncate font-medium text-foreground">
            {data.alt}
          </span>
          <Button
            aria-label="Download generated image"
            className="h-6 gap-1 px-2 text-[11px]"
            onClick={handleDownload}
            size="sm"
            type="button"
            variant="ghost"
          >
            <DownloadIcon className="size-3" />
            Save
          </Button>
        </div>
        <div className="bg-muted/20 p-2">
          <Image
            alt={data.alt}
            base64={data.base64}
            className="w-full rounded-md border object-contain"
            mediaType={data.mediaType}
            uint8Array={EMPTY_UINT8_ARRAY}
          />
        </div>
        {data.prompt && (
          <div className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
            Prompt: {data.prompt}
          </div>
        )}
      </div>
    </AgentErrorBoundary>
  );
}

export function WebPreviewCard({ data }: { data: WebPreviewDataPart }) {
  const [reloadNonce, setReloadNonce] = useState(0);
  const [useSrcDoc, setUseSrcDoc] = useState(
    Boolean(data.htmlSrcDoc && data.htmlSrcDoc.trim().length > 0)
  );
  const [activeUrl, setActiveUrl] = useState(data.defaultUrl);

  const mappedLogs = useMemo(
    () =>
      data.consoleLogs.map((log) => ({
        level: log.level,
        message: log.message,
        timestamp: parseSafeDate(log.timestampIso),
      })),
    [data.consoleLogs]
  );

  const canOpenExternal =
    activeUrl.startsWith("https://") || activeUrl.startsWith("http://");

  return (
    <AgentErrorBoundary title="Web preview failed to render">
      <WebPreview
        className="overflow-hidden"
        defaultUrl={data.defaultUrl}
        onUrlChange={(nextUrl) => {
          setActiveUrl(nextUrl);
          if (nextUrl !== data.defaultUrl && nextUrl.startsWith("http")) {
            setUseSrcDoc(false);
          }
        }}
      >
        <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5 text-xs">
          <span className="truncate font-medium text-foreground">
            {data.title}
          </span>
          <Badge className="text-[10px]" variant="secondary">
            {useSrcDoc ? "Sandboxed HTML" : "URL Preview"}
          </Badge>
        </div>

        <WebPreviewNavigation>
          <WebPreviewNavigationButton
            onClick={() => setReloadNonce((n) => n + 1)}
            tooltip="Reload preview"
          >
            <RotateCwIcon className="size-3.5" />
          </WebPreviewNavigationButton>
          <WebPreviewUrl className="h-7 text-xs" />
          {canOpenExternal && !activeUrl.includes("tomo.local") && (
            <WebPreviewNavigationButton
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.open(activeUrl, "_blank", "noopener,noreferrer");
                }
              }}
              tooltip="Open in browser"
            >
              <ExternalLinkIcon className="size-3.5" />
            </WebPreviewNavigationButton>
          )}
        </WebPreviewNavigation>

        <WebPreviewBody
          className="h-56 w-full bg-background"
          key={reloadNonce}
          src={useSrcDoc ? "" : undefined}
          srcDoc={useSrcDoc ? data.htmlSrcDoc : undefined}
          title={data.title}
        />

        <WebPreviewConsole logs={mappedLogs} />
      </WebPreview>
    </AgentErrorBoundary>
  );
}

export function JsxPreviewCard({ data }: { data: JsxPreviewDataPart }) {
  const bindings = useMemo(() => ({ title: data.title }), [data.title]);

  return (
    <AgentErrorBoundary title="JSX preview failed to compile">
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2 text-xs">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <SparklesIcon className="size-3.5 text-primary" />
            <span>{data.title}</span>
          </div>
          {data.isStreaming ? (
            <Shimmer as="span" className="text-[11px]" duration={1.1}>
              Streaming JSX...
            </Shimmer>
          ) : (
            <Badge className="text-[10px]" variant="secondary">
              JSX Live
            </Badge>
          )}
        </div>
        <div className="p-3">
          <JSXPreview
            bindings={bindings}
            components={SAFE_JSX_COMPONENTS}
            isStreaming={data.isStreaming}
            jsx={data.jsx}
          >
            <JSXPreviewContent />
            <JSXPreviewError className="mt-2 text-xs" />
          </JSXPreview>
        </div>
      </div>
    </AgentErrorBoundary>
  );
}

export function AudioSpeechCard({ data }: { data: AudioSpeechDataPart }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const audioSrc = useMemo(
    () => `data:${data.mediaType};base64,${data.base64Audio}`,
    [data.base64Audio, data.mediaType]
  );

  const handleSeek = useCallback((timeSec: number) => {
    const audioEl = audioRef.current;
    if (!audioEl) return;
    audioEl.currentTime = timeSec;
    setCurrentTime(timeSec);
    void audioEl.play().catch(() => {
      // Ignore autoplay restrictions when seeking before user play gesture
    });
  }, []);

  return (
    <AgentErrorBoundary title="Audio speech player failed">
      <div className="space-y-3 rounded-lg border bg-card p-3">
        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="flex min-w-0 items-center gap-2 font-medium text-foreground">
            <Volume2Icon
              className={cn(
                "size-4 shrink-0 text-primary",
                isPlaying && "animate-pulse"
              )}
            />
            <span className="truncate">{data.title}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Badge className="font-mono text-[10px]" variant="outline">
              {data.voiceId}
            </Badge>
            <Badge className="font-mono text-[10px]" variant="secondary">
              {data.durationSec.toFixed(1)}s
            </Badge>
          </div>
        </div>

        <AudioPlayer className="w-full max-w-full overflow-hidden">
          <AudioPlayerElement
            onEnded={() => setIsPlaying(false)}
            onPause={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            ref={audioRef}
            src={audioSrc}
          />
          <AudioPlayerControlBar className="w-full max-w-full overflow-x-auto scrollbar-hide">
            <AudioPlayerPlayButton />
            <span className="agent-sm-only contents">
              <AudioPlayerSeekBackwardButton seekOffset={5} />
              <AudioPlayerSeekForwardButton seekOffset={5} />
            </span>
            <AudioPlayerTimeDisplay />
            <AudioPlayerTimeRange className="min-w-10 flex-1" />
            <span className="agent-xs-hide contents">
              <AudioPlayerDurationDisplay />
            </span>
            <AudioPlayerMuteButton />
            <AudioPlayerVolumeRange className="agent-wide-only w-14" />
          </AudioPlayerControlBar>
        </AudioPlayer>

        {data.segments.length > 0 && (
          <div className="rounded-md border bg-muted/30 p-2.5">
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Synced Transcript (click cue to seek)
            </div>
            <Transcription
              className="text-xs"
              currentTime={currentTime}
              onSeek={handleSeek}
              segments={data.segments}
            >
              {(segment, index) => (
                <TranscriptionSegment
                  index={index}
                  key={`${index}-${segment.startSecond}`}
                  segment={segment}
                />
              )}
            </Transcription>
          </div>
        )}
      </div>
    </AgentErrorBoundary>
  );
}

export function InlineArtifactCard({
  data,
  onOpenArtifact,
}: {
  data: ArtifactDataPart;
  onOpenArtifact: (artifactId: string) => void;
}) {
  const previewLine = useMemo(() => {
    const lines = data.content
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    return lines.slice(0, 3).join("\n");
  }, [data.content]);

  return (
    <Artifact
      className="cursor-pointer transition-colors hover:border-primary/40"
      onClick={() => onOpenArtifact(data.id)}
    >
      <ArtifactHeader className="gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <FileCode2Icon className="size-4 shrink-0 text-primary" />
            <ArtifactTitle className="max-w-full truncate text-xs">
              {data.title}
            </ArtifactTitle>
            <Badge className="shrink-0 font-mono text-[10px]" variant="secondary">
              v{data.version}
            </Badge>
            <Badge className="shrink-0 text-[10px] uppercase" variant="outline">
              {data.kind}
            </Badge>
          </div>
          {data.description && (
            <ArtifactDescription className="truncate text-[11px]">
              {data.description}
            </ArtifactDescription>
          )}
        </div>
        <ArtifactActions
          className="shrink-0"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <ArtifactAction
            icon={Maximize2Icon}
            label="Open Artifact Drawer"
            onClick={() => onOpenArtifact(data.id)}
            tooltip="Open in Artifact Drawer"
          />
        </ArtifactActions>
      </ArtifactHeader>
      {previewLine && (
        <ArtifactContent className="bg-muted/20 px-3 py-2">
          <pre className="line-clamp-3 overflow-hidden font-mono text-[11px] text-muted-foreground">
            {previewLine}
          </pre>
        </ArtifactContent>
      )}
    </Artifact>
  );
}

export function CheckpointCard({
  checkpointId,
  label,
  affectedFiles,
  onRestoreCheckpoint,
}: {
  checkpointId: string;
  label: string;
  timestampIso?: string;
  affectedFiles: string[];
  onRestoreCheckpoint: (checkpointId: string) => void;
}) {
  const tooltipText =
    affectedFiles.length > 0
      ? `Restore checkpoint (${affectedFiles.length} file${
          affectedFiles.length === 1 ? "" : "s"
        })`
      : "Restore conversation & artifact state to this checkpoint";

  return (
    <TooltipProvider>
      <div className="my-1 rounded-lg border border-border/80 bg-muted/25 px-2.5 py-1.5">
        <Checkpoint className="text-xs">
          <CheckpointIcon className="size-3.5 text-primary" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
            {label}
          </span>
          {affectedFiles.length > 0 && (
            <Badge
              className="agent-sm-only shrink-0 px-1.5 py-0 font-mono text-[10px]"
              variant="secondary"
            >
              {affectedFiles.length} file{affectedFiles.length === 1 ? "" : "s"}
            </Badge>
          )}
          <CheckpointTrigger
            className="h-6 shrink-0 gap-1 px-2 text-[11px]"
            onClick={() => onRestoreCheckpoint(checkpointId)}
            tooltip={tooltipText}
            variant="outline"
          >
            <HistoryIcon className="size-3 shrink-0" />
            <span>Restore</span>
          </CheckpointTrigger>
        </Checkpoint>
      </div>
    </TooltipProvider>
  );
}
