import React from "react";
import { Select, Input, Switch, Button, Tooltip } from "antd";
import { Trash2Icon } from "lucide-react";
import { useRestStore } from "../../../../store/restStore";
import type { Auth, AuthType } from "../../../../types/rest";

const AUTH_TYPES: { value: AuthType; label: string }[] = [
  { value: "inherit", label: "Inherit" },
  { value: "none", label: "None" },
  { value: "basic", label: "Basic Auth" },
  { value: "digest", label: "Digest Auth" },
  { value: "bearer", label: "Bearer Token" },
  { value: "oauth2", label: "OAuth 2.0" },
  { value: "api-key", label: "API Key" },
  { value: "aws-signature", label: "AWS Signature" },
  { value: "hawk", label: "HAWK" },
  { value: "jwt", label: "JWT" },
];

const AUTH_DEFAULTS: Record<AuthType, Auth> = {
  inherit: { type: "inherit" },
  none: { type: "none" },
  basic: { type: "basic", username: "", password: "" },
  digest: { type: "digest", username: "", password: "", algorithm: "MD5" },
  bearer: { type: "bearer", token: "" },
  oauth2: { type: "oauth2", grantType: "authorization_code", clientId: "", clientSecret: "", tokenUrl: "", authUrl: "", scope: "", token: "" },
  "api-key": { type: "api-key", key: "", value: "", addTo: "headers" },
  "aws-signature": { type: "aws-signature", accessKey: "", secretKey: "", region: "", serviceName: "", sessionToken: "" },
  hawk: { type: "hawk", authId: "", authKey: "", algorithm: "sha256" },
  jwt: { type: "jwt", secret: "", algorithm: "HS256", payload: '{\n  "sub": "1234567890"\n}', headerPrefix: "Bearer", paramName: "Authorization", isBase64Encoded: false },
};

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="auth-field-row">
      <label className="auth-field-label">{label}</label>
      <div className="auth-field-control">{children}</div>
    </div>
  );
}

interface AuthTabProps {
  auth?: Auth;
  onChange?: (auth: Auth) => void;
}

export function AuthTab({ auth: authProp, onChange: onChangeProp }: AuthTabProps = {}) {
  const storeAuth = useRestStore((s) => s.currentRequest.auth);
  const setCurrentRequest = useRestStore((s) => s.setCurrentRequest);

  const controlled = authProp !== undefined && onChangeProp !== undefined;
  const auth = controlled ? authProp : storeAuth;

  const setAuth = (patch: Partial<Auth>) => {
    const next = { ...auth, ...patch } as Auth;
    if (controlled) onChangeProp!(next);
    else setCurrentRequest({ auth: next });
  };

  const setType = (type: AuthType) => {
    const next = AUTH_DEFAULTS[type];
    if (controlled) onChangeProp!(next);
    else setCurrentRequest({ auth: next });
  };

  const clearAuth = () => {
    const none: Auth = { type: "none" };
    if (controlled) onChangeProp!(none);
    else setCurrentRequest({ auth: none });
  };

  return (
    <div className="request-tab-content auth-tab">
      <div className="auth-header">
        <div className="auth-type-row">
          <label className="auth-field-label">Authorization type</label>
          <Select
            value={auth.type}
            onChange={setType}
            size="small"
            style={{ width: 180 }}
            options={AUTH_TYPES}
          />
        </div>
        <div className="auth-actions">
          <Tooltip title="Clear">
            <Button size="small" type="text" icon={<Trash2Icon size={14} />} onClick={clearAuth} />
          </Tooltip>
        </div>
      </div>

      {(auth.type === "none" || auth.type === "inherit") && (
        <div className="auth-empty-msg">
          {auth.type === "inherit"
            ? "Authentication will be inherited from the parent collection."
            : "No authentication configured."}
        </div>
      )}

      {auth.type === "basic" && "username" in auth && (
        <>
          <FieldRow label="Username">
            <Input value={auth.username} onChange={(e) => setAuth({ username: e.target.value } as Partial<Auth>)} placeholder="Username" />
          </FieldRow>
          <FieldRow label="Password">
            <Input.Password value={auth.password} onChange={(e) => setAuth({ password: e.target.value } as Partial<Auth>)} placeholder="Password" />
          </FieldRow>
        </>
      )}

      {auth.type === "digest" && "username" in auth && (
        <>
          <FieldRow label="Username">
            <Input value={auth.username} onChange={(e) => setAuth({ username: e.target.value } as Partial<Auth>)} placeholder="Username" />
          </FieldRow>
          <FieldRow label="Password">
            <Input.Password value={auth.password} onChange={(e) => setAuth({ password: e.target.value } as Partial<Auth>)} placeholder="Password" />
          </FieldRow>
          <FieldRow label="Algorithm">
            <Select
              value={auth.algorithm}
              onChange={(v) => setAuth({ algorithm: v } as Partial<Auth>)}
              size="small"
              options={[{ value: "MD5", label: "MD5" }, { value: "SHA-256", label: "SHA-256" }, { value: "SHA-512", label: "SHA-512" }]}
            />
          </FieldRow>
        </>
      )}

      {auth.type === "bearer" && "token" in auth && (
        <FieldRow label="Token">
          <Input.Password value={auth.token} onChange={(e) => setAuth({ token: e.target.value } as Partial<Auth>)} placeholder="Bearer token" />
        </FieldRow>
      )}

      {auth.type === "oauth2" && "clientId" in auth && (
        <>
          <FieldRow label="Grant Type">
            <Select
              value={auth.grantType}
              onChange={(v) => setAuth({ grantType: v } as Partial<Auth>)}
              size="small"
              options={[
                { value: "authorization_code", label: "Authorization Code" },
                { value: "client_credentials", label: "Client Credentials" },
                { value: "password", label: "Resource Owner Password" },
                { value: "implicit", label: "Implicit" },
              ]}
              style={{ width: "100%" }}
            />
          </FieldRow>
          <FieldRow label="Client ID"><Input value={auth.clientId} onChange={(e) => setAuth({ clientId: e.target.value } as Partial<Auth>)} placeholder="Client ID" /></FieldRow>
          <FieldRow label="Client Secret"><Input.Password value={auth.clientSecret} onChange={(e) => setAuth({ clientSecret: e.target.value } as Partial<Auth>)} placeholder="Client Secret" /></FieldRow>
          <FieldRow label="Auth URL"><Input value={auth.authUrl} onChange={(e) => setAuth({ authUrl: e.target.value } as Partial<Auth>)} placeholder="https://..." /></FieldRow>
          <FieldRow label="Token URL"><Input value={auth.tokenUrl} onChange={(e) => setAuth({ tokenUrl: e.target.value } as Partial<Auth>)} placeholder="https://..." /></FieldRow>
          <FieldRow label="Scope"><Input value={auth.scope} onChange={(e) => setAuth({ scope: e.target.value } as Partial<Auth>)} placeholder="openid profile email" /></FieldRow>
          <FieldRow label="Access Token"><Input.Password value={auth.token} onChange={(e) => setAuth({ token: e.target.value } as Partial<Auth>)} placeholder="Paste access token" /></FieldRow>
        </>
      )}

      {auth.type === "api-key" && "key" in auth && (
        <>
          <FieldRow label="Key"><Input value={auth.key} onChange={(e) => setAuth({ key: e.target.value } as Partial<Auth>)} placeholder="X-API-Key" /></FieldRow>
          <FieldRow label="Value"><Input.Password value={auth.value} onChange={(e) => setAuth({ value: e.target.value } as Partial<Auth>)} placeholder="API key value" /></FieldRow>
          <FieldRow label="Add to">
            <Select
              value={auth.addTo}
              onChange={(v) => setAuth({ addTo: v } as Partial<Auth>)}
              size="small"
              options={[{ value: "headers", label: "Headers" }, { value: "query", label: "Query Params" }]}
            />
          </FieldRow>
        </>
      )}

      {auth.type === "aws-signature" && "accessKey" in auth && (
        <>
          <FieldRow label="Access Key"><Input value={auth.accessKey} onChange={(e) => setAuth({ accessKey: e.target.value } as Partial<Auth>)} placeholder="AWS Access Key" /></FieldRow>
          <FieldRow label="Secret Key"><Input.Password value={auth.secretKey} onChange={(e) => setAuth({ secretKey: e.target.value } as Partial<Auth>)} placeholder="AWS Secret Key" /></FieldRow>
          <FieldRow label="Region"><Input value={auth.region} onChange={(e) => setAuth({ region: e.target.value } as Partial<Auth>)} placeholder="us-east-1" /></FieldRow>
          <FieldRow label="Service"><Input value={auth.serviceName} onChange={(e) => setAuth({ serviceName: e.target.value } as Partial<Auth>)} placeholder="s3, execute-api…" /></FieldRow>
          <FieldRow label="Session Token"><Input.Password value={auth.sessionToken} onChange={(e) => setAuth({ sessionToken: e.target.value } as Partial<Auth>)} placeholder="Optional" /></FieldRow>
        </>
      )}

      {auth.type === "hawk" && "authId" in auth && (
        <>
          <FieldRow label="Auth ID"><Input value={auth.authId} onChange={(e) => setAuth({ authId: e.target.value } as Partial<Auth>)} placeholder="HAWK auth ID" /></FieldRow>
          <FieldRow label="Auth Key"><Input.Password value={auth.authKey} onChange={(e) => setAuth({ authKey: e.target.value } as Partial<Auth>)} placeholder="HAWK auth key" /></FieldRow>
          <FieldRow label="Algorithm">
            <Select value={auth.algorithm} onChange={(v) => setAuth({ algorithm: v } as Partial<Auth>)} size="small"
              options={[{ value: "sha256", label: "SHA-256" }, { value: "sha1", label: "SHA-1" }]} />
          </FieldRow>
        </>
      )}

      {auth.type === "jwt" && "secret" in auth && (
        <>
          <FieldRow label="Secret"><Input.Password value={auth.secret} onChange={(e) => setAuth({ secret: e.target.value } as Partial<Auth>)} placeholder="JWT secret" /></FieldRow>
          <FieldRow label="Algorithm">
            <Select value={auth.algorithm} onChange={(v) => setAuth({ algorithm: v } as Partial<Auth>)} size="small"
              options={["HS256","HS384","HS512","RS256","RS384","RS512","ES256","ES384","ES512"].map(a => ({ value: a, label: a }))} />
          </FieldRow>
          <FieldRow label="Payload">
            <Input.TextArea value={auth.payload} onChange={(e) => setAuth({ payload: e.target.value } as Partial<Auth>)} rows={4} style={{ fontFamily: "monospace", fontSize: 12 }} />
          </FieldRow>
          <FieldRow label="Header Prefix"><Input value={auth.headerPrefix} onChange={(e) => setAuth({ headerPrefix: e.target.value } as Partial<Auth>)} placeholder="Bearer" /></FieldRow>
          <FieldRow label="Base64 Encoded">
            <Switch checked={auth.isBase64Encoded} onChange={(v) => setAuth({ isBase64Encoded: v } as Partial<Auth>)} size="small" />
          </FieldRow>
        </>
      )}
    </div>
  );
}
