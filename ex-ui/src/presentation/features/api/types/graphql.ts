import type { KeyValueRow } from "./common";
import type { Auth } from "./rest";

export type GqlConnectionState = "DISCONNECTED" | "CONNECTING" | "CONNECTED";
export type GqlOptionTab = "query" | "variables" | "headers" | "auth";

export interface GqlRequest {
  id: string;
  name: string;
  url: string;
  query: string;
  variables: string;
  headers: KeyValueRow[];
  auth: Auth;
}

export interface GqlResponseEvent {
  time: number;
  data: string;
  operationName?: string;
}

export interface GqlTab {
  id: string;
  name: string;
  request: GqlRequest;
  isDirty: boolean;
  response: GqlResponseEvent[] | null;
  connectionState: GqlConnectionState;
  isLoading: boolean;
  schema: GqlSchemaType[] | null;
}

export interface GqlSchemaField {
  name: string;
  description?: string;
  type: string;
  args?: GqlSchemaArg[];
  isDeprecated?: boolean;
  deprecationReason?: string;
}

export interface GqlSchemaArg {
  name: string;
  type: string;
  defaultValue?: string;
  description?: string;
}

export interface GqlSchemaType {
  name: string;
  kind: string;
  description?: string;
  fields?: GqlSchemaField[];
  inputFields?: GqlSchemaField[];
  interfaces?: string[];
  enumValues?: { name: string; description?: string }[];
}
