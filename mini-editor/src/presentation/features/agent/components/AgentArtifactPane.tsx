import {
  Artifact,
  ArtifactAction,
  ArtifactActions,
  ArtifactClose,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from "@/components/ai-elements/artifact";
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from "@/components/ai-elements/code-block";
import {
  FileTree,
  FileTreeFile,
  FileTreeFolder,
} from "@/components/ai-elements/file-tree";
import {
  JSXPreview,
  JSXPreviewContent,
  JSXPreviewError,
} from "@/components/ai-elements/jsx-preview";
import { MessageResponse } from "@/components/ai-elements/message";
import {
  WebPreview,
  WebPreviewBody,
  WebPreviewConsole,
  WebPreviewNavigation,
  WebPreviewNavigationButton,
  WebPreviewUrl,
} from "@/components/ai-elements/web-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  AgentScenarioId,
  ArtifactDataPart,
  FileTreeNode,
} from "@/core/interfaces/agent";
import { insertMarkdownSnippet } from "@/infrastructure/agent";
import { cn } from "@/lib/utils";
import {
  CheckIcon,
  Code2Icon,
  CopyIcon,
  DownloadIcon,
  FilePlus2Icon,
  LayersIcon,
  RotateCwIcon,
  SparklesIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { BundledLanguage } from "shiki";
import { AgentErrorBoundary } from "./AgentErrorBoundary";

export interface AgentArtifactPaneProps {
  artifacts: ArtifactDataPart[];
  activeArtifactId: string | null;
  isStreaming?: boolean;
  showCloseButton?: boolean;
  className?: string;
  onSelectArtifact: (artifactId: string) => void;
  onClose?: () => void;
  onLaunchScenario?: (scenarioId: AgentScenarioId) => void;
}

const SUPPORTED_SHIKI_LANGUAGES = new Set<string>([
  "typescript",
  "tsx",
  "javascript",
  "jsx",
  "json",
  "html",
  "css",
  "markdown",
  "diff",
  "sql",
  "go",
  "bash",
  "yaml",
  "rust",
  "python",
]);

function resolveBundledLanguage(
  lang: string | undefined,
  kind: ArtifactDataPart["kind"]
): BundledLanguage {
  if (kind === "diff") return "diff";
  const normalized = (lang ?? "").toLowerCase().trim();
  if (normalized === "ts") return "typescript";
  if (normalized === "js") return "javascript";
  if (normalized === "md") return "markdown";
  if (normalized === "sh") return "bash";
  if (SUPPORTED_SHIKI_LANGUAGES.has(normalized)) {
    return normalized as BundledLanguage;
  }
  return "typescript";
}

function getFileExtension(artifact: ArtifactDataPart): string {
  if (artifact.kind === "web") return "html";
  if (artifact.kind === "markdown") return "md";
  if (artifact.kind === "diff") return "diff";
  if (artifact.kind === "jsx") return "tsx";
  const lang = (artifact.language ?? "").toLowerCase();
  if (lang === "typescript" || lang === "ts") return "ts";
  if (lang === "javascript" || lang === "js") return "js";
  if (lang === "json") return "json";
  if (lang === "go") return "go";
  if (lang === "sql") return "sql";
  return "txt";
}

function buildMarkdownSnippetForInsert(artifact: ArtifactDataPart): string {
  if (artifact.kind === "markdown") {
    return artifact.content;
  }
  const lang = artifact.language ?? (artifact.kind === "diff" ? "diff" : "ts");
  return `### ${artifact.title}\n\n\`\`\`${lang}\n${artifact.content}\n\`\`\`\n`;
}

function collectFolderPaths(nodes: FileTreeNode[]): Set<string> {
  const paths = new Set<string>();
  const visit = (list: FileTreeNode[]) => {
    for (const node of list) {
      if (node.kind === "folder") {
        paths.add(node.path);
        if (node.children) {
          visit(node.children);
        }
      }
    }
  };
  visit(nodes);
  return paths;
}

function findNodeByPath(
  nodes: FileTreeNode[],
  targetPath: string | undefined
): FileTreeNode | null {
  if (!targetPath) return null;
  for (const node of nodes) {
    if (node.path === targetPath) return node;
    if (node.children) {
      const found = findNodeByPath(node.children, targetPath);
      if (found) return found;
    }
  }
  return null;
}

function renderTreeNodes(nodes: FileTreeNode[]): ReactNode {
  return nodes.map((node) => {
    if (node.kind === "folder") {
      return (
        <FileTreeFolder key={node.path} name={node.name} path={node.path}>
          {node.children ? renderTreeNodes(node.children) : null}
        </FileTreeFolder>
      );
    }
    return <FileTreeFile key={node.path} name={node.name} path={node.path} />;
  });
}

export function AgentArtifactPane({
  artifacts,
  activeArtifactId,
  isStreaming = false,
  showCloseButton = true,
  className,
  onSelectArtifact,
  onClose,
  onLaunchScenario,
}: AgentArtifactPaneProps) {
  const [copied, setCopied] = useState(false);
  const [inserted, setInserted] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [selectedTreePath, setSelectedTreePath] = useState<string | undefined>(
    undefined
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeArtifact = useMemo(() => {
    if (artifacts.length === 0) return null;
    if (activeArtifactId) {
      const found = artifacts.find((a) => a.id === activeArtifactId);
      if (found) return found;
    }
    return artifacts[artifacts.length - 1];
  }, [artifacts, activeArtifactId]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!activeArtifact?.files || activeArtifact.files.length === 0) {
      setSelectedTreePath(undefined);
      return;
    }
    const firstFile = activeArtifact.files.find((n) => n.kind === "file");
    setSelectedTreePath(firstFile?.path ?? activeArtifact.files[0]?.path);
  }, [activeArtifact?.id, activeArtifact?.files]);

  const handleCopy = useCallback(async () => {
    if (!activeArtifact) return;
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return;
    }
    try {
      await navigator.clipboard.writeText(activeArtifact.content);
      setCopied(true);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  }, [activeArtifact]);

  const handleDownload = useCallback(() => {
    if (!activeArtifact) return;
    const ext = getFileExtension(activeArtifact);
    const filename = activeArtifact.title.includes(".")
      ? activeArtifact.title
      : `${activeArtifact.title}.${ext}`;
    const blob = new Blob([activeArtifact.content], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [activeArtifact]);

  const handleInsertToDoc = useCallback(async () => {
    if (!activeArtifact) return;
    const snippet = buildMarkdownSnippetForInsert(activeArtifact);
    const ok = await insertMarkdownSnippet(snippet);
    if (ok) {
      setInserted(true);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setInserted(false), 1800);
    }
  }, [activeArtifact]);

  const jsxComponents = useMemo(
    () => ({
      Badge,
      Button,
    }),
    []
  );

  if (!activeArtifact) {
    return (
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center gap-3 p-6 text-center",
          className
        )}
      >
        <div className="flex size-11 items-center justify-center rounded-xl border border-border bg-muted/40">
          <LayersIcon className="size-5 text-muted-foreground" />
        </div>
        <div className="max-w-sm space-y-1">
          <h3 className="text-sm font-semibold text-foreground">
            No Artifacts Generated Yet
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Code modules, interactive Web/JSX previews, file trees, and patch
            diffs produced during conversations appear here.
          </p>
        </div>
        {onLaunchScenario && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              className="gap-1.5 text-xs"
              onClick={() => onLaunchScenario("fullstack")}
              size="sm"
              type="button"
              variant="outline"
            >
              <Code2Icon className="size-3.5" />
              Generate Code Artifact
            </Button>
            <Button
              className="gap-1.5 text-xs"
              onClick={() => onLaunchScenario("generative-media")}
              size="sm"
              type="button"
              variant="default"
            >
              <SparklesIcon className="size-3.5" />
              Generate UI Preview
            </Button>
          </div>
        )}
      </div>
    );
  }

  const webConsoleLogs = (activeArtifact.consoleLogs ?? []).map((log) => ({
    level: log.level,
    message: log.message,
    timestamp: new Date(log.timestampIso),
  }));

  const selectedFileNode = activeArtifact.files
    ? findNodeByPath(activeArtifact.files, selectedTreePath)
    : null;

  return (
    <Artifact
      className={cn(
        "h-full rounded-none border-0 bg-background shadow-none",
        className
      )}
    >
      <ArtifactHeader className="flex-wrap gap-2 px-2.5 py-2">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <ArtifactTitle className="max-w-full truncate text-xs font-semibold">
              {activeArtifact.title}
            </ArtifactTitle>
            <Badge className="px-1.5 py-0 font-mono text-[10px]" variant="secondary">
              v{activeArtifact.version}
            </Badge>
            <Badge className="px-1.5 py-0 text-[10px] uppercase" variant="outline">
              {activeArtifact.kind}
            </Badge>
          </div>
          {activeArtifact.description && (
            <ArtifactDescription className="line-clamp-1 text-[11px]">
              {activeArtifact.description}
            </ArtifactDescription>
          )}
        </div>

        <ArtifactActions className="max-w-full shrink-0 flex-wrap">
          {artifacts.length > 1 && (
            <Select
              onValueChange={onSelectArtifact}
              value={activeArtifact.id}
            >
              <SelectTrigger
                aria-label="Select artifact"
                className="h-7 max-w-[130px] text-xs"
                size="sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {artifacts.map((art) => (
                  <SelectItem key={art.id} value={art.id}>
                    <span className="truncate">
                      {art.title} (v{art.version})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <ArtifactAction
            icon={copied ? CheckIcon : CopyIcon}
            label="Copy artifact content"
            onClick={() => {
              void handleCopy();
            }}
            tooltip={copied ? "Copied!" : "Copy"}
          />
          <ArtifactAction
            icon={DownloadIcon}
            label="Download artifact"
            onClick={handleDownload}
            tooltip="Download"
          />
          <ArtifactAction
            className="w-auto gap-1 px-2 text-xs"
            label="Insert into Active Doc"
            onClick={() => {
              void handleInsertToDoc();
            }}
            tooltip="Insert into Active Tomo Doc"
            variant="outline"
          >
            {inserted ? (
              <CheckIcon className="size-3.5 text-emerald-500" />
            ) : (
              <FilePlus2Icon className="size-3.5" />
            )}
            <span className="agent-wide-only">
              {inserted ? "Inserted" : "Insert Doc"}
            </span>
          </ArtifactAction>

          {showCloseButton && onClose && (
            <ArtifactClose className="size-7" onClick={onClose} />
          )}
        </ArtifactActions>
      </ArtifactHeader>

      <ArtifactContent className="flex min-h-0 flex-1 flex-col p-3">
        {(activeArtifact.kind === "code" || activeArtifact.kind === "diff") && (
          <CodeBlock
            className="min-h-0 flex-1 overflow-auto"
            code={activeArtifact.content}
            language={resolveBundledLanguage(
              activeArtifact.language,
              activeArtifact.kind
            )}
            showLineNumbers
          >
            <CodeBlockHeader>
              <CodeBlockTitle>
                <CodeBlockFilename>{activeArtifact.title}</CodeBlockFilename>
              </CodeBlockTitle>
              <CodeBlockActions>
                <CodeBlockCopyButton />
              </CodeBlockActions>
            </CodeBlockHeader>
          </CodeBlock>
        )}

        {activeArtifact.kind === "web" && (
          <WebPreview
            className="min-h-[320px] flex-1 overflow-hidden"
            defaultUrl={
              activeArtifact.previewUrl ?? "https://tomo.local/preview"
            }
          >
            <WebPreviewNavigation>
              <WebPreviewNavigationButton
                onClick={() => setPreviewKey((k) => k + 1)}
                tooltip="Reload Preview"
              >
                <RotateCwIcon className="size-3.5" />
              </WebPreviewNavigationButton>
              <WebPreviewUrl readOnly />
            </WebPreviewNavigation>
            <WebPreviewBody
              key={previewKey}
              src=""
              srcDoc={activeArtifact.content}
            />
            <WebPreviewConsole logs={webConsoleLogs} />
          </WebPreview>
        )}

        {activeArtifact.kind === "jsx" && (
          <AgentErrorBoundary>
            <div className="flex-1 overflow-auto rounded-lg border border-border bg-card p-4">
              <JSXPreview
                components={jsxComponents}
                isStreaming={isStreaming}
                jsx={activeArtifact.content}
              >
                <JSXPreviewError className="mb-3" />
                <JSXPreviewContent />
              </JSXPreview>
            </div>
          </AgentErrorBoundary>
        )}

        {activeArtifact.kind === "file-tree" && (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            {activeArtifact.files && activeArtifact.files.length > 0 ? (
              <>
                <FileTree
                  defaultExpanded={collectFolderPaths(activeArtifact.files)}
                  onSelect={setSelectedTreePath}
                  selectedPath={selectedTreePath}
                >
                  {renderTreeNodes(activeArtifact.files)}
                </FileTree>
                {selectedFileNode?.kind === "file" &&
                  selectedFileNode.content && (
                    <CodeBlock
                      code={selectedFileNode.content}
                      language={resolveBundledLanguage(
                        selectedFileNode.language,
                        "code"
                      )}
                      showLineNumbers
                    >
                      <CodeBlockHeader>
                        <CodeBlockTitle>
                          <CodeBlockFilename>
                            {selectedFileNode.path}
                          </CodeBlockFilename>
                        </CodeBlockTitle>
                        <CodeBlockActions>
                          <CodeBlockCopyButton />
                        </CodeBlockActions>
                      </CodeBlockHeader>
                    </CodeBlock>
                  )}
              </>
            ) : (
              <CodeBlock
                code={activeArtifact.content}
                language={resolveBundledLanguage(
                  activeArtifact.language,
                  "code"
                )}
                showLineNumbers
              />
            )}
          </div>
        )}

        {activeArtifact.kind === "markdown" && (
          <div className="prose prose-sm max-w-none flex-1 overflow-auto rounded-lg border border-border bg-card p-4 dark:prose-invert">
            <MessageResponse>{activeArtifact.content}</MessageResponse>
          </div>
        )}
      </ArtifactContent>
    </Artifact>
  );
}
