import type { KeyValueRow } from "./common";

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS"
  | "CONNECT"
  | "TRACE";

export type AuthType =
  | "inherit"
  | "none"
  | "basic"
  | "digest"
  | "bearer"
  | "oauth2"
  | "api-key"
  | "aws-signature"
  | "hawk"
  | "jwt";

export type BodyType =
  | "none"
  | "multipart/form-data"
  | "application/x-www-form-urlencoded"
  | "application/octet-stream"
  | "application/json"
  | "application/xml"
  | "text/html"
  | "text/plain";

export type RequestTab =
  | "params"
  | "body"
  | "headers"
  | "auth"
  | "pre-request"
  | "tests"
  | "variables";

export type ResponseTab = "body" | "headers" | "test-results";
export type LeftPanelTab = "collections" | "history";

export interface AuthNone {
  type: "none" | "inherit";
}
export interface AuthBasic {
  type: "basic";
  username: string;
  password: string;
}
export interface AuthDigest {
  type: "digest";
  username: string;
  password: string;
  algorithm: "MD5" | "SHA-256" | "SHA-512";
}
export interface AuthBearer {
  type: "bearer";
  token: string;
}
export interface AuthOAuth2 {
  type: "oauth2";
  grantType: string;
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  authUrl: string;
  scope: string;
  token: string;
}
export interface AuthApiKey {
  type: "api-key";
  key: string;
  value: string;
  addTo: "headers" | "query";
}
export interface AuthAws {
  type: "aws-signature";
  accessKey: string;
  secretKey: string;
  region: string;
  serviceName: string;
  sessionToken: string;
}
export interface AuthHawk {
  type: "hawk";
  authId: string;
  authKey: string;
  algorithm: "sha256" | "sha1";
}
export interface AuthJwt {
  type: "jwt";
  secret: string;
  algorithm: string;
  payload: string;
  headerPrefix: string;
  paramName: string;
  isBase64Encoded: boolean;
}

export type Auth =
  | AuthNone
  | AuthBasic
  | AuthDigest
  | AuthBearer
  | AuthOAuth2
  | AuthApiKey
  | AuthAws
  | AuthHawk
  | AuthJwt;

export interface RequestBody {
  type: BodyType;
  content: string;
  formData?: KeyValueRow[];
  urlEncoded?: KeyValueRow[];
  binaryFile?: File; // transient — not serialized
}

export interface ApiRequest {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  params: KeyValueRow[];
  headers: KeyValueRow[];
  auth: Auth;
  body: RequestBody;
  preRequestScript: string;
  testScript: string;
  variables: KeyValueRow[];
}

export interface TestResult {
  description: string;
  passed: boolean;
  error?: string;
}

export interface ApiResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  timeMs: number;
  sizeBytes: number;
  testResults?: TestResult[];
}

export interface ApiFolder {
  id: string;
  name: string;
  auth?: Auth;
  headers?: KeyValueRow[];
  folders: ApiFolder[];
  requests: ApiRequest[];
}

export interface ApiCollection {
  id: string;
  name: string;
  auth?: Auth;
  headers?: KeyValueRow[];
  folders: ApiFolder[];
  requests: ApiRequest[];
}

export interface ApiEnvironment {
  id: string;
  name: string;
  variables: KeyValueRow[];
}

export interface HistoryItem {
  id: string;
  request: ApiRequest;
  response: ApiResponse;
  timestamp: string;
}

export interface RestTab {
  id: string;
  name: string;
  isDirty: boolean;
  snapshot: {
    request: ApiRequest;
    response: ApiResponse | null;
    activeRequestTab: RequestTab;
    activeResponseTab: ResponseTab;
  };
}

export function createDefaultRequest(): ApiRequest {
  return {
    id: "",
    name: "Untitled",
    method: "GET",
    url: "",
    params: [],
    headers: [],
    auth: { type: "none" },
    body: { type: "none", content: "" },
    preRequestScript: "",
    testScript: "",
    variables: [],
  };
}
