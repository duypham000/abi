import { useEffect, useRef, useState } from "react";
import { Button, Input, Spin } from "antd";
import { ArrowLeftIcon, ChevronRightIcon } from "lucide-react";
import { fetchSchema } from "../../../services/gqlService";
import type { GqlSchemaType } from "../../../types/graphql";
import type { GqlRequest } from "../../../types/graphql";

interface SchemaExplorerProps {
  request: GqlRequest;
}

export function SchemaExplorer({ request }: SchemaExplorerProps) {
  const [types, setTypes] = useState<GqlSchemaType[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [navStack, setNavStack] = useState<string[]>([]);
  const acRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!request.url) return;
    acRef.current?.abort();
    acRef.current = new AbortController();
    setLoading(true);
    setError(null);
    fetchSchema(request.url, request.headers, request.auth, acRef.current.signal)
      .then((t) => setTypes(t))
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [request.url]);

  if (loading) {
    return (
      <div className="schema-explorer schema-loading">
        <Spin size="small" />
        <span>Loading schema…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="schema-explorer schema-error">
        <p>Failed to load schema</p>
        <p className="schema-error-msg">{error}</p>
      </div>
    );
  }

  if (!types) return <div className="schema-explorer schema-empty">Schema unavailable</div>;

  const typeMap = Object.fromEntries(types.map((t) => [t.name, t]));
  const rootTypeNames = ["Query", "Mutation", "Subscription"].filter((n) => n in typeMap);

  const currentTypeName = navStack[navStack.length - 1] ?? null;
  const currentType = currentTypeName ? typeMap[currentTypeName] : null;

  const filteredTypes = search
    ? types.filter(
        (t) =>
          !t.name.startsWith("__") &&
          t.name.toLowerCase().includes(search.toLowerCase())
      )
    : null;

  return (
    <div className="schema-explorer">
      <div className="schema-search">
        <Input
          size="small"
          placeholder="Search types…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setNavStack([]);
          }}
          allowClear
        />
      </div>

      <div className="schema-tree">
        {navStack.length > 0 && (
          <Button
            size="small"
            type="text"
            icon={<ArrowLeftIcon size={12} />}
            onClick={() => setNavStack((s) => s.slice(0, -1))}
            className="schema-back-btn"
          >
            Back
          </Button>
        )}

        {currentType ? (
          <TypeView
            type={currentType}
            onNavigate={(name) => setNavStack((s) => [...s, name])}
          />
        ) : filteredTypes ? (
          <ul className="schema-type-list">
            {filteredTypes.map((t) => (
              <li
                key={t.name}
                className="schema-type-item"
                onClick={() => setNavStack([t.name])}
              >
                <span className="schema-type-name">{t.name}</span>
                <ChevronRightIcon size={12} />
              </li>
            ))}
          </ul>
        ) : (
          <>
            <p className="schema-section-label">Root Types</p>
            <ul className="schema-type-list">
              {rootTypeNames.map((name) => (
                <li
                  key={name}
                  className="schema-type-item"
                  onClick={() => setNavStack([name])}
                >
                  <span className="schema-type-name">{name}</span>
                  <ChevronRightIcon size={12} />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

interface TypeViewProps {
  type: GqlSchemaType;
  onNavigate: (name: string) => void;
}

function TypeView({ type, onNavigate }: TypeViewProps) {
  return (
    <div className="schema-type-view">
      <div className="schema-type-header">
        <span className="schema-type-kind">{type.kind}</span>
        <span className="schema-type-view-name">{type.name}</span>
      </div>
      {type.description && <p className="schema-type-desc">{type.description}</p>}
      {type.fields && type.fields.length > 0 && (
        <ul className="schema-fields-list">
          {type.fields.map((field) => (
            <li key={field.name} className="schema-field-item">
              <div className="schema-field-row">
                <span
                  className="schema-field-name clickable"
                  onClick={() => onNavigate(field.type.replace(/[!\[\]]/g, ""))}
                >
                  {field.name}
                </span>
                <span className="schema-field-type">{field.type}</span>
              </div>
              {field.description && <p className="schema-field-desc">{field.description}</p>}
            </li>
          ))}
        </ul>
      )}
      {type.inputFields && type.inputFields.length > 0 && (
        <>
          <p className="schema-section-label">Input Fields</p>
          <ul className="schema-fields-list">
            {type.inputFields.map((field) => (
              <li key={field.name} className="schema-field-item">
                <div className="schema-field-row">
                  <span
                    className="schema-field-name clickable"
                    onClick={() => onNavigate(field.type.replace(/[!\[\]]/g, ""))}
                  >
                    {field.name}
                  </span>
                  <span className="schema-field-type">{field.type}</span>
                </div>
                {field.description && <p className="schema-field-desc">{field.description}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
      {type.kind === "ENUM" && type.enumValues && type.enumValues.length > 0 && (
        <>
          <p className="schema-section-label">Values</p>
          <ul className="schema-fields-list">
            {type.enumValues.map((ev) => (
              <li key={ev.name} className="schema-field-item">
                <div className="schema-field-row">
                  <span className="schema-field-name">{ev.name}</span>
                </div>
                {ev.description && <p className="schema-field-desc">{ev.description}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
