import type { GqlRequest, GqlResponseEvent, GqlSchemaType } from "../types/graphql";
import type { KeyValueRow } from "../types/common";
import type { Auth } from "../types/rest";

function buildHeaders(
  headers: KeyValueRow[],
  auth: Auth
): Record<string, string> {
  const result: Record<string, string> = {};

  headers.filter((h) => h.enabled && h.key).forEach((h) => {
    result[h.key] = h.value;
  });

  if (auth.type === "bearer" && "token" in auth && auth.token) {
    result["Authorization"] = `Bearer ${auth.token}`;
  } else if (auth.type === "basic" && "username" in auth) {
    const creds = btoa(`${auth.username}:${"password" in auth ? auth.password : ""}`);
    result["Authorization"] = `Basic ${creds}`;
  }

  return result;
}

function safeParseJson(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}

function extractOperationName(query: string): string | undefined {
  const match = query.match(/(?:query|mutation|subscription)\s+(\w+)/);
  return match?.[1];
}

export async function executeGqlRequest(
  request: GqlRequest,
  signal: AbortSignal
): Promise<GqlResponseEvent[]> {
  const start = Date.now();
  const res = await fetch(request.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildHeaders(request.headers, request.auth),
    },
    body: JSON.stringify({
      query: request.query,
      variables: safeParseJson(request.variables) ?? {},
    }),
    signal,
  });

  const data = await res.text();
  return [
    {
      time: Date.now() - start,
      data,
      operationName: extractOperationName(request.query),
    },
  ];
}

const INTROSPECTION_QUERY = `
  query IntrospectionQuery {
    __schema {
      queryType { name }
      mutationType { name }
      subscriptionType { name }
      types {
        name kind description
        fields(includeDeprecated: true) {
          name description isDeprecated deprecationReason
          type { name kind ofType { name kind ofType { name kind ofType { name kind } } } }
          args { name description defaultValue type { name kind ofType { name kind ofType { name kind ofType { name kind } } } } }
        }
        inputFields {
          name description defaultValue
          type { name kind ofType { name kind ofType { name kind ofType { name kind } } } }
        }
        interfaces { name }
        enumValues(includeDeprecated: true) { name description isDeprecated deprecationReason }
      }
    }
  }
`;

function resolveTypeName(typeRef: unknown): string {
  if (!typeRef || typeof typeRef !== "object") return "Unknown";
  const t = typeRef as { name?: string; kind?: string; ofType?: unknown };
  if (t.name) return t.name;
  if (t.kind === "NON_NULL") return `${resolveTypeName(t.ofType)}!`;
  if (t.kind === "LIST") return `[${resolveTypeName(t.ofType)}]`;
  return "Unknown";
}

export function subscribeGql(
  request: GqlRequest,
  onEvent: (event: GqlResponseEvent) => void,
  onComplete: () => void,
  onError: (msg: string) => void
): () => void {
  const wsUrl = request.url.replace(/^https?/, (m) => (m === "https" ? "wss" : "ws"));
  const ws = new WebSocket(wsUrl, "graphql-transport-ws");
  const id = "sub-1";
  const connHeaders = buildHeaders(request.headers, request.auth);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "connection_init", payload: connHeaders }));
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data as string) as {
      type: string;
      id?: string;
      payload?: unknown;
    };
    if (msg.type === "connection_ack") {
      ws.send(
        JSON.stringify({
          type: "subscribe",
          id,
          payload: {
            query: request.query,
            variables: safeParseJson(request.variables),
          },
        })
      );
    } else if (msg.type === "next" && msg.id === id) {
      onEvent({
        time: Date.now(),
        data: JSON.stringify(msg.payload),
        operationName: extractOperationName(request.query),
      });
    } else if (msg.type === "complete" && msg.id === id) {
      ws.close();
      onComplete();
    } else if (msg.type === "error") {
      onError(JSON.stringify(msg.payload));
      ws.close();
    }
  };

  ws.onerror = () => onError("WebSocket connection error");
  ws.onclose = () => onComplete();

  return () => {
    try {
      ws.send(JSON.stringify({ type: "complete", id }));
    } catch {
      // ignore if already closed
    }
    ws.close();
  };
}

export async function fetchSchema(
  url: string,
  headers: KeyValueRow[],
  auth: Auth,
  signal: AbortSignal
): Promise<GqlSchemaType[]> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildHeaders(headers, auth),
    },
    body: JSON.stringify({ query: INTROSPECTION_QUERY }),
    signal,
  });

  const json = await res.json() as { data?: { __schema?: { types?: unknown[] } } };
  const rawTypes = json?.data?.__schema?.types ?? [];

  return (rawTypes as Array<{
    name: string;
    kind: string;
    description?: string;
    fields?: Array<{ name: string; description?: string; type: unknown; args?: Array<{ name: string; type: unknown; description?: string; defaultValue?: string }> }>;
    inputFields?: Array<{ name: string; description?: string; type: unknown; defaultValue?: string }>;
    interfaces?: Array<{ name: string }>;
    enumValues?: Array<{ name: string; description?: string }>;
  }>)
    .filter((t) => !t.name.startsWith("__"))
    .map((t) => ({
      name: t.name,
      kind: t.kind,
      description: t.description,
      fields: t.fields?.map((f) => ({
        name: f.name,
        description: f.description,
        type: resolveTypeName(f.type),
        args: f.args?.map((a) => ({
          name: a.name,
          type: resolveTypeName(a.type),
          defaultValue: a.defaultValue,
          description: a.description,
        })),
      })),
      inputFields: t.inputFields?.map((f) => ({
        name: f.name,
        description: f.description,
        type: resolveTypeName(f.type),
      })),
      interfaces: t.interfaces?.map((i) => i.name),
      enumValues: t.enumValues?.map((e) => ({
        name: e.name,
        description: e.description,
      })),
    }));
}
