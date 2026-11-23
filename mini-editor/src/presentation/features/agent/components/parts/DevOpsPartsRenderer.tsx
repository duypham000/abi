import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockLanguageSelector,
  CodeBlockLanguageSelectorContent,
  CodeBlockLanguageSelectorItem,
  CodeBlockLanguageSelectorTrigger,
  CodeBlockLanguageSelectorValue,
  CodeBlockTitle,
} from "@/components/ai-elements/code-block";
import {
  Commit,
  CommitActions,
  CommitAuthor,
  CommitAuthorAvatar,
  CommitContent,
  CommitCopyButton,
  CommitFile,
  CommitFileAdditions,
  CommitFileChanges,
  CommitFileDeletions,
  CommitFileIcon,
  CommitFileInfo,
  CommitFilePath,
  CommitFileStatus,
  CommitFiles,
  CommitHash,
  CommitHeader,
  CommitInfo,
  CommitMessage,
  CommitMetadata,
  CommitSeparator,
  CommitTimestamp,
} from "@/components/ai-elements/commit";
import {
  EnvironmentVariable,
  EnvironmentVariableCopyButton,
  EnvironmentVariableGroup,
  EnvironmentVariableName,
  EnvironmentVariableRequired,
  EnvironmentVariables,
  EnvironmentVariablesContent,
  EnvironmentVariablesHeader,
  EnvironmentVariablesTitle,
  EnvironmentVariablesToggle,
  EnvironmentVariableValue,
} from "@/components/ai-elements/environment-variables";
import {
  FileTree,
  FileTreeActions,
  FileTreeFile,
  FileTreeFolder,
  FileTreeIcon,
  FileTreeName,
} from "@/components/ai-elements/file-tree";
import {
  PackageInfo,
  PackageInfoChangeType,
  PackageInfoContent,
  PackageInfoDependencies,
  PackageInfoDependency,
  PackageInfoDescription,
  PackageInfoHeader,
  PackageInfoName,
  PackageInfoVersion,
} from "@/components/ai-elements/package-info";
import {
  SchemaDisplay,
  SchemaDisplayBody,
  SchemaDisplayContent,
  SchemaDisplayDescription,
  SchemaDisplayExample,
  SchemaDisplayHeader,
  SchemaDisplayMethod,
  SchemaDisplayParameter,
  SchemaDisplayParameters,
  SchemaDisplayPath,
  SchemaDisplayProperty,
  SchemaDisplayRequest,
  SchemaDisplayResponse,
} from "@/components/ai-elements/schema-display";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Snippet,
  SnippetAddon,
  SnippetCopyButton,
  SnippetInput,
  SnippetText,
} from "@/components/ai-elements/snippet";
import {
  StackTrace,
  StackTraceActions,
  StackTraceContent,
  StackTraceCopyButton,
  StackTraceError,
  StackTraceErrorMessage,
  StackTraceErrorType,
  StackTraceExpandButton,
  StackTraceFrames,
  StackTraceHeader,
} from "@/components/ai-elements/stack-trace";
import {
  Terminal,
  TerminalActions,
  TerminalClearButton,
  TerminalContent,
  TerminalCopyButton,
  TerminalHeader,
  TerminalStatus,
  TerminalTitle,
} from "@/components/ai-elements/terminal";
import {
  Test,
  TestDuration,
  TestError,
  TestErrorMessage,
  TestErrorStack,
  TestName,
  TestResults,
  TestResultsContent,
  TestResultsDuration,
  TestResultsHeader,
  TestResultsProgress,
  TestResultsSummary,
  TestStatus,
  TestSuite,
  TestSuiteContent,
  TestSuiteName,
  TestSuiteStats,
} from "@/components/ai-elements/test-results";
import type {
  CommitDataPart,
  EnvVarsDataPart,
  FileTreeDataPart,
  FileTreeNode,
  PackageInfoDataPart,
  SchemaDisplayDataPart,
  StackTraceDataPart,
  TerminalDataPart,
  TestResultsDataPart,
} from "@/core/interfaces/agent";
import { cn } from "@/lib/utils";
import {
  FileCode2Icon,
  FolderTreeIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { BundledLanguage } from "shiki";

const LANGUAGE_MAP: Record<string, BundledLanguage> = {
  ts: "typescript",
  typescript: "typescript",
  tsx: "tsx",
  js: "javascript",
  javascript: "javascript",
  jsx: "jsx",
  json: "json",
  jsonc: "jsonc",
  sh: "bash",
  bash: "bash",
  shell: "shell",
  zsh: "zsh",
  ps1: "powershell",
  powershell: "powershell",
  html: "html",
  css: "css",
  scss: "scss",
  md: "markdown",
  markdown: "markdown",
  mdx: "mdx",
  sql: "sql",
  py: "python",
  python: "python",
  go: "go",
  golang: "go",
  rs: "rust",
  rust: "rust",
  yml: "yaml",
  yaml: "yaml",
  diff: "diff",
  patch: "diff",
  toml: "toml",
  xml: "xml",
  graphql: "graphql",
  gql: "graphql",
  dockerfile: "dockerfile",
  docker: "docker",
  dotenv: "dotenv",
  env: "dotenv",
  mermaid: "mermaid",
  log: "log",
};

const SELECTABLE_LANGUAGES: { value: BundledLanguage; label: string }[] = [
  { value: "typescript", label: "TypeScript" },
  { value: "tsx", label: "TSX" },
  { value: "javascript", label: "JavaScript" },
  { value: "json", label: "JSON" },
  { value: "bash", label: "Bash" },
  { value: "sql", label: "SQL" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "markdown", label: "Markdown" },
  { value: "diff", label: "Diff" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "python", label: "Python" },
  { value: "yaml", label: "YAML" },
];

export function toBundledLanguage(lang?: string): BundledLanguage {
  if (!lang) return "typescript";
  const normalized = lang.trim().toLowerCase();
  return LANGUAGE_MAP[normalized] ?? "typescript";
}

export interface AgentCodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  showLineNumbers?: boolean;
  allowLanguageSwitch?: boolean;
  className?: string;
}

export function AgentCodeBlock({
  code,
  language,
  filename,
  showLineNumbers = false,
  allowLanguageSwitch = true,
  className,
}: AgentCodeBlockProps) {
  const initialLang = toBundledLanguage(language);
  const [selectedLang, setSelectedLang] =
    useState<BundledLanguage>(initialLang);

  const languageOptions = useMemo(() => {
    const hasInitial = SELECTABLE_LANGUAGES.some(
      (item) => item.value === initialLang
    );
    if (hasInitial) return SELECTABLE_LANGUAGES;
    return [
      { value: initialLang, label: initialLang.toUpperCase() },
      ...SELECTABLE_LANGUAGES,
    ];
  }, [initialLang]);

  return (
    <CodeBlock
      className={className}
      code={code}
      language={selectedLang}
      showLineNumbers={showLineNumbers}
    >
      <CodeBlockHeader>
        <CodeBlockTitle>
          <FileCode2Icon className="size-3.5 shrink-0" />
          <CodeBlockFilename>{filename ?? selectedLang}</CodeBlockFilename>
        </CodeBlockTitle>
        <CodeBlockActions>
          {allowLanguageSwitch && (
            <span className="agent-sm-only">
              <CodeBlockLanguageSelector
                onValueChange={(next) =>
                  setSelectedLang(toBundledLanguage(next))
                }
                value={selectedLang}
              >
                <CodeBlockLanguageSelectorTrigger aria-label="Select code language">
                  <CodeBlockLanguageSelectorValue />
                </CodeBlockLanguageSelectorTrigger>
                <CodeBlockLanguageSelectorContent>
                  {languageOptions.map((opt) => (
                    <CodeBlockLanguageSelectorItem
                      key={opt.value}
                      value={opt.value}
                    >
                      {opt.label}
                    </CodeBlockLanguageSelectorItem>
                  ))}
                </CodeBlockLanguageSelectorContent>
              </CodeBlockLanguageSelector>
            </span>
          )}
          <CodeBlockCopyButton />
        </CodeBlockActions>
      </CodeBlockHeader>
    </CodeBlock>
  );
}

export function CommandSnippetCard({
  command,
  prefix = "$",
  className,
}: {
  command: string;
  prefix?: string;
  className?: string;
}) {
  return (
    <Snippet className={className} code={command}>
      <SnippetAddon align="inline-start">
        <SnippetText>{prefix}</SnippetText>
      </SnippetAddon>
      <SnippetInput aria-label="Shell command" className="text-xs" />
      <SnippetAddon align="inline-end">
        <SnippetCopyButton />
      </SnippetAddon>
    </Snippet>
  );
}

export function TerminalCard({ data }: { data: TerminalDataPart }) {
  const [clearedSnapshot, setClearedSnapshot] = useState<string | null>(null);
  const displayedOutput =
    clearedSnapshot === data.ansiOutput ? "" : data.ansiOutput;

  return (
    <div className="space-y-2">
      {data.command && (
        <CommandSnippetCard className="h-8 text-xs" command={data.command} />
      )}
      <Terminal
        isStreaming={data.isStreaming}
        onClear={() => setClearedSnapshot(data.ansiOutput)}
        output={displayedOutput}
      >
        <TerminalHeader>
          <TerminalTitle>{data.title}</TerminalTitle>
          <div className="flex items-center gap-2">
            <TerminalStatus>
              <Shimmer as="span" className="text-xs" duration={1.1}>
                Running...
              </Shimmer>
            </TerminalStatus>
            {!data.isStreaming && data.exitCode !== undefined && (
              <Badge
                className={cn(
                  "h-5 px-1.5 font-mono text-[10px]",
                  data.exitCode === 0
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-red-500/15 text-red-400"
                )}
                variant="secondary"
              >
                exit {data.exitCode}
                {data.durationMs !== undefined ? ` • ${data.durationMs}ms` : ""}
              </Badge>
            )}
            <TerminalActions>
              <TerminalCopyButton />
              <TerminalClearButton title="Clear terminal output" />
            </TerminalActions>
          </div>
        </TerminalHeader>
        <TerminalContent className="max-h-72 text-xs" />
      </Terminal>
    </div>
  );
}

export function TestResultsCard({ data }: { data: TestResultsDataPart }) {
  return (
    <TestResults summary={data.summary}>
      <TestResultsHeader>
        <TestResultsSummary />
        <TestResultsDuration />
      </TestResultsHeader>
      <TestResultsContent>
        {data.summary.total > 0 && <TestResultsProgress className="pb-2" />}
        {data.suites.map((suite) => (
          <TestSuite
            defaultOpen={suite.status === "failed" || data.suites.length <= 2}
            key={suite.id}
            name={suite.name}
            status={suite.status}
          >
            <TestSuiteName>
              <span className="flex w-full items-center justify-between gap-2">
                <span className="truncate">{suite.name}</span>
                <TestSuiteStats
                  failed={suite.failed}
                  passed={suite.passed}
                  skipped={suite.skipped}
                />
              </span>
            </TestSuiteName>
            <TestSuiteContent>
              {suite.tests.map((testItem) => (
                <div key={testItem.id}>
                  <Test
                    duration={testItem.duration}
                    name={testItem.name}
                    status={testItem.status}
                  >
                    <TestStatus />
                    <TestName />
                    {testItem.duration !== undefined && <TestDuration />}
                  </Test>
                  {(testItem.errorMessage || testItem.errorStack) && (
                    <div className="px-4 pb-3">
                      <TestError>
                        {testItem.errorMessage && (
                          <TestErrorMessage>
                            {testItem.errorMessage}
                          </TestErrorMessage>
                        )}
                        {testItem.errorStack && (
                          <TestErrorStack>{testItem.errorStack}</TestErrorStack>
                        )}
                      </TestError>
                    </div>
                  )}
                </div>
              ))}
            </TestSuiteContent>
          </TestSuite>
        ))}
      </TestResultsContent>
    </TestResults>
  );
}

export function StackTraceCard({
  data,
  onSendFollowUp,
}: {
  data: StackTraceDataPart;
  onSendFollowUp?: (prompt: string) => void;
}) {
  const fixPrompt =
    data.fixPrompt ??
    `Diagnose and fix ${data.errorType}: ${data.message}${data.filePath ? ` in ${data.filePath}` : ""
    }${data.line ? `:${data.line}` : ""}`;

  return (
    <StackTrace defaultOpen trace={data.rawTrace}>
      <StackTraceHeader>
        <StackTraceError>
          <StackTraceErrorType>{data.errorType}</StackTraceErrorType>
          <StackTraceErrorMessage>{data.message}</StackTraceErrorMessage>
        </StackTraceError>
        <StackTraceActions>
          {onSendFollowUp && (
            <Button
              className="h-7 gap-1 px-2 font-sans text-xs"
              onClick={() => onSendFollowUp(fixPrompt)}
              size="sm"
              type="button"
              variant="secondary"
            >
              <SparklesIcon className="size-3" />
              Fix with Agent
            </Button>
          )}
          <StackTraceCopyButton />
          <StackTraceExpandButton />
        </StackTraceActions>
      </StackTraceHeader>
      <StackTraceContent>
        {data.filePath && (
          <div className="border-b px-3 py-1.5 text-[11px] text-muted-foreground">
            Source: <span className="font-mono text-foreground">{data.filePath}</span>
            {data.line !== undefined ? `:${data.line}` : ""}
          </div>
        )}
        <StackTraceFrames />
      </StackTraceContent>
    </StackTrace>
  );
}

const FILE_STATUS_BADGE: Record<
  NonNullable<FileTreeNode["status"]>,
  { label: string; className: string }
> = {
  added: {
    label: "A",
    className: "text-emerald-600 dark:text-emerald-400",
  },
  modified: {
    label: "M",
    className: "text-amber-600 dark:text-amber-400",
  },
  deleted: {
    label: "D",
    className: "text-red-600 dark:text-red-400",
  },
  unchanged: {
    label: "",
    className: "text-muted-foreground",
  },
};

function collectFolderPaths(nodes: FileTreeNode[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.kind === "folder") {
      paths.push(node.path);
      if (node.children) {
        paths.push(...collectFolderPaths(node.children));
      }
    }
  }
  return paths;
}

function findNodeByPath(
  nodes: FileTreeNode[],
  targetPath: string
): FileTreeNode | undefined {
  for (const node of nodes) {
    if (node.path === targetPath) {
      return node;
    }
    if (node.children) {
      const match = findNodeByPath(node.children, targetPath);
      if (match) return match;
    }
  }
  return undefined;
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

    const statusInfo = node.status ? FILE_STATUS_BADGE[node.status] : undefined;

    return (
      <FileTreeFile key={node.path} name={node.name} path={node.path}>
        <span className="size-4 shrink-0" />
        <FileTreeIcon>
          <FileCode2Icon className="size-4 text-muted-foreground" />
        </FileTreeIcon>
        <FileTreeName>{node.name}</FileTreeName>
        {statusInfo && statusInfo.label && (
          <FileTreeActions>
            <span
              className={cn("font-mono text-[11px] font-semibold", statusInfo.className)}
            >
              {statusInfo.label}
            </span>
          </FileTreeActions>
        )}
      </FileTreeFile>
    );
  });
}

export function FileTreeCard({ data }: { data: FileTreeDataPart }) {
  const [selectedPath, setSelectedPath] = useState<string | undefined>(
    data.selectedPath
  );
  const [showPreview, setShowPreview] = useState<boolean>(
    Boolean(data.selectedPath)
  );

  const defaultExpanded = useMemo(
    () => new Set(collectFolderPaths(data.nodes)),
    [data.nodes]
  );

  const selectedNode = useMemo(
    () => (selectedPath ? findNodeByPath(data.nodes, selectedPath) : undefined),
    [data.nodes, selectedPath]
  );

  const handleSelect = (path: string) => {
    setSelectedPath(path);
    const matched = findNodeByPath(data.nodes, path);
    if (matched?.kind === "file") {
      setShowPreview(true);
    }
  };

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border bg-background">
        <div className="flex min-w-0 items-center justify-between gap-2 border-b bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground">
          <div className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
            <FolderTreeIcon className="size-3.5 shrink-0" />
            <span className="truncate font-mono">{data.rootLabel}</span>
          </div>
          {selectedNode && selectedNode.kind === "file" && (
            <span className="agent-sm-only max-w-[50%] truncate font-mono text-[11px]">
              {selectedNode.path}
            </span>
          )}
        </div>
        <FileTree
          className="rounded-none border-0"
          defaultExpanded={defaultExpanded}
          onSelect={handleSelect}
          selectedPath={selectedPath}
        >
          {renderTreeNodes(data.nodes)}
        </FileTree>
      </div>

      {showPreview && selectedNode && selectedNode.kind === "file" && (
        <div className="space-y-1.5">
          {selectedNode.content ? (
            <div className="relative">
              <AgentCodeBlock
                code={selectedNode.content}
                filename={selectedNode.path}
                language={selectedNode.language}
                showLineNumbers
              />
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <span className="truncate font-mono">{selectedNode.path}</span>
              <div className="flex items-center gap-2">
                {selectedNode.status && (
                  <Badge className="text-[10px]" variant="secondary">
                    {selectedNode.status}
                  </Badge>
                )}
                <Button
                  aria-label="Close file preview"
                  className="size-6"
                  onClick={() => setShowPreview(false)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <XIcon className="size-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function parseSafeDate(iso: string): Date {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function CommitCard({ data }: { data: CommitDataPart }) {
  const commitDate = useMemo(() => parseSafeDate(data.timestamp), [data.timestamp]);

  return (
    <Commit defaultOpen>
      <CommitHeader>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <CommitAuthor>
            <CommitAuthorAvatar initials={data.author.initials} />
          </CommitAuthor>
          <CommitInfo className="min-w-0">
            <CommitMessage className="truncate">{data.message}</CommitMessage>
            <CommitMetadata>
              <span>{data.author.name}</span>
              <CommitSeparator />
              <CommitHash>{data.hash}</CommitHash>
              <CommitSeparator />
              <CommitTimestamp date={commitDate} />
            </CommitMetadata>
          </CommitInfo>
        </div>
        <CommitActions>
          <CommitCopyButton hash={data.hash} />
        </CommitActions>
      </CommitHeader>
      <CommitContent>
        <CommitFiles>
          {data.files.map((file) => (
            <CommitFile key={file.path}>
              <CommitFileInfo>
                <CommitFileStatus status={file.status} />
                <CommitFileIcon />
                <CommitFilePath>{file.path}</CommitFilePath>
              </CommitFileInfo>
              <CommitFileChanges>
                <CommitFileAdditions count={file.additions} />
                <CommitFileDeletions count={file.deletions} />
              </CommitFileChanges>
            </CommitFile>
          ))}
        </CommitFiles>
      </CommitContent>
    </Commit>
  );
}

export function SchemaDisplayCard({ data }: { data: SchemaDisplayDataPart }) {
  return (
    <SchemaDisplay
      description={data.description}
      method={data.method}
      parameters={data.parameters}
      path={data.path}
      requestBody={data.requestBody}
      responseBody={data.responseBody}
    >
      <SchemaDisplayHeader>
        <div className="flex min-w-0 items-center gap-2.5">
          <SchemaDisplayMethod />
          <SchemaDisplayPath className="truncate" />
        </div>
      </SchemaDisplayHeader>
      {data.description && <SchemaDisplayDescription />}
      <SchemaDisplayContent>
        {data.parameters && data.parameters.length > 0 && (
          <SchemaDisplayParameters>
            {data.parameters.map((param) => (
              <SchemaDisplayParameter key={param.name} {...param} />
            ))}
          </SchemaDisplayParameters>
        )}
        {data.requestBody && data.requestBody.length > 0 && (
          <SchemaDisplayRequest>
            {data.requestBody.map((prop) => (
              <SchemaDisplayProperty depth={0} key={prop.name} {...prop} />
            ))}
          </SchemaDisplayRequest>
        )}
        {data.responseBody && data.responseBody.length > 0 && (
          <SchemaDisplayResponse>
            {data.responseBody.map((prop) => (
              <SchemaDisplayProperty depth={0} key={prop.name} {...prop} />
            ))}
          </SchemaDisplayResponse>
        )}
        {(data.exampleRequest || data.exampleResponse) && (
          <SchemaDisplayBody className="space-y-3 py-3">
            {data.exampleRequest && (
              <div className="space-y-1">
                <div className="px-4 text-xs font-medium text-muted-foreground">
                  Example Request
                </div>
                <SchemaDisplayExample className="mb-0 text-xs">
                  {data.exampleRequest}
                </SchemaDisplayExample>
              </div>
            )}
            {data.exampleResponse && (
              <div className="space-y-1">
                <div className="px-4 text-xs font-medium text-muted-foreground">
                  Example Response
                </div>
                <SchemaDisplayExample className="mb-0 text-xs">
                  {data.exampleResponse}
                </SchemaDisplayExample>
              </div>
            )}
          </SchemaDisplayBody>
        )}
      </SchemaDisplayContent>
    </SchemaDisplay>
  );
}

export function EnvVarsCard({ data }: { data: EnvVarsDataPart }) {
  return (
    <EnvironmentVariables defaultShowValues={false}>
      <EnvironmentVariablesHeader>
        <EnvironmentVariablesTitle>{data.title}</EnvironmentVariablesTitle>
        <EnvironmentVariablesToggle />
      </EnvironmentVariablesHeader>
      <EnvironmentVariablesContent>
        {data.variables.map((envVar) => (
          <EnvironmentVariable
            key={envVar.name}
            name={envVar.name}
            value={envVar.value}
          >
            <EnvironmentVariableGroup className="min-w-0">
              <EnvironmentVariableName className="truncate text-xs" />
              {envVar.required && <EnvironmentVariableRequired />}
            </EnvironmentVariableGroup>
            <EnvironmentVariableGroup className="shrink-0">
              <EnvironmentVariableValue className="max-w-44 truncate text-xs" />
              <EnvironmentVariableCopyButton copyFormat="export" />
            </EnvironmentVariableGroup>
          </EnvironmentVariable>
        ))}
      </EnvironmentVariablesContent>
    </EnvironmentVariables>
  );
}

export function PackageInfoCard({ data }: { data: PackageInfoDataPart }) {
  return (
    <PackageInfo
      changeType={data.changeType}
      currentVersion={data.currentVersion}
      name={data.name}
      newVersion={data.newVersion}
    >
      <PackageInfoHeader>
        <PackageInfoName />
        {data.changeType && <PackageInfoChangeType />}
      </PackageInfoHeader>
      {(data.currentVersion || data.newVersion) && <PackageInfoVersion />}
      {data.description && (
        <PackageInfoDescription>{data.description}</PackageInfoDescription>
      )}
      {data.dependencies && data.dependencies.length > 0 && (
        <PackageInfoContent>
          <PackageInfoDependencies>
            {data.dependencies.map((dep) => (
              <PackageInfoDependency
                key={dep.name}
                name={dep.name}
                version={dep.version}
              />
            ))}
          </PackageInfoDependencies>
        </PackageInfoContent>
      )}
    </PackageInfo>
  );
}
