import { Button, Tooltip } from "antd";
import { CopyIcon, PlayIcon, WandSparklesIcon } from "lucide-react";
import { useGraphqlStore } from "../../store/graphqlStore";

interface QueryEditorProps {
  tabId: string;
  query: string;
  onRun: () => void;
}

function basicPrettify(query: string): string {
  try {
    let indent = 0;
    const lines: string[] = [];
    for (const line of query.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const opens = (trimmed.match(/\{/g) ?? []).length;
      const closes = (trimmed.match(/\}/g) ?? []).length;
      if (closes > opens) indent = Math.max(0, indent - (closes - opens));
      lines.push("  ".repeat(indent) + trimmed);
      indent += Math.max(0, opens - closes);
    }
    return lines.join("\n");
  } catch {
    return query;
  }
}

export function QueryEditor({ tabId, query, onRun }: QueryEditorProps) {
  const updateTabRequest = useGraphqlStore((s) => s.updateTabRequest);

  const handlePrettify = () => {
    updateTabRequest(tabId, { query: basicPrettify(query) });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(query);
  };

  return (
    <div className="query-editor">
      <div className="query-editor-toolbar">
        <Tooltip title="Run (Ctrl+Enter)">
          <Button
            size="small"
            type="primary"
            icon={<PlayIcon size={14} />}
            onClick={onRun}
          >
            Run
          </Button>
        </Tooltip>
        <Tooltip title="Prettify">
          <Button
            size="small"
            type="text"
            icon={<WandSparklesIcon size={14} />}
            onClick={handlePrettify}
          />
        </Tooltip>
        <Tooltip title="Copy">
          <Button
            size="small"
            type="text"
            icon={<CopyIcon size={14} />}
            onClick={handleCopy}
          />
        </Tooltip>
      </div>
      <textarea
        className="query-editor-textarea"
        value={query}
        onChange={(e) => updateTabRequest(tabId, { query: e.target.value })}
        placeholder={"# Write your GraphQL query here\nquery {\n\n}"}
        spellCheck={false}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            onRun();
          }
        }}
      />
    </div>
  );
}
