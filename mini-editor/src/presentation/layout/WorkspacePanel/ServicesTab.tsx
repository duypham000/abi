import { useState, useEffect, useCallback } from "react";
import { RefreshCwIcon } from "lucide-react";

const API_BASE = "/api/v1";

function healthUrl(): string {
  const base = API_BASE.replace(/\/api\/v1\/?$/, "");
  return `${base}/actuator/health`;
}

type HealthStatus = "UP" | "DOWN" | "UNKNOWN" | "checking";

interface ComponentHealth {
  name: string;
  status: HealthStatus;
  details?: Record<string, unknown>;
}

interface HealthResult {
  overall: HealthStatus;
  components: ComponentHealth[];
  error?: string;
  checkedAt: number;
}

// Named services the user wants tracked — names match Spring Boot component keys
const NAMED_SERVICES = ["infra", "base", "agent", "node"];

async function fetchHealth(): Promise<HealthResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(healthUrl(), { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      return { overall: "DOWN", components: [], error: `HTTP ${res.status}`, checkedAt: Date.now() };
    }
    const body = await res.json() as {
      status?: string;
      components?: Record<string, { status?: string; details?: Record<string, unknown> }>;
    };

    const overall = (body.status === "UP" ? "UP" : "DOWN") as HealthStatus;
    const rawComponents = body.components ?? {};

    // All components returned by actuator
    const allComponents: ComponentHealth[] = Object.entries(rawComponents).map(
      ([name, val]) => ({
        name,
        status: (val.status === "UP" ? "UP" : val.status === "DOWN" ? "DOWN" : "UNKNOWN") as HealthStatus,
        details: val.details,
      })
    );

    // Ensure named services appear first; add "UNKNOWN" stub if not present in response
    const namedSet = new Set(NAMED_SERVICES);
    const named: ComponentHealth[] = NAMED_SERVICES.map((name) => {
      const found = allComponents.find((c) => c.name === name);
      return found ?? { name, status: "UNKNOWN" };
    });
    const rest = allComponents.filter((c) => !namedSet.has(c.name));

    return { overall, components: [...named, ...rest], checkedAt: Date.now() };
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    return { overall: "DOWN", components: [], error: msg, checkedAt: Date.now() };
  }
}

const STATUS_LABELS: Record<HealthStatus, string> = {
  UP: "UP",
  DOWN: "DOWN",
  UNKNOWN: "—",
  checking: "…",
};

function StatusDot({ status }: { status: HealthStatus }) {
  return (
    <span className={`wp-svc-status wp-svc-status--${status}`}>
      <span className="wp-svc-status__dot" />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function ServicesTab() {
  const [result, setResult] = useState<HealthResult | null>(null);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    const r = await fetchHealth();
    setResult(r);
    setChecking(false);
  }, []);

  // Initial check + poll every 30 s
  useEffect(() => {
    check();
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, [check]);

  const checkedAt = result?.checkedAt
    ? new Date(result.checkedAt).toLocaleTimeString()
    : null;

  return (
    <div className="wp-services-view">
      <div className="wp-services-header">
        <div className="wp-services-overall">
          Overall:&nbsp;
          <StatusDot status={checking ? "checking" : (result?.overall ?? "UNKNOWN")} />
        </div>
        <div className="wp-services-meta">
          {checkedAt && <span className="wp-services-time">checked {checkedAt}</span>}
          <button
            className="wp-icon-btn"
            title="Refresh"
            disabled={checking}
            onClick={check}
          >
            <RefreshCwIcon size={12} className={checking ? "wp-spin" : ""} />
          </button>
        </div>
      </div>

      {result?.error && (
        <div className="wp-services-error">{result.error}</div>
      )}

      {result && result.components.length > 0 && (
        <table className="wp-table">
          <thead>
            <tr>
              <th>Service</th>
              <th>Status</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {result.components.map((svc) => (
              <tr key={svc.name}>
                <td><code className="wp-code">{svc.name}</code></td>
                <td><StatusDot status={svc.status} /></td>
                <td className="wp-services-detail">
                  {svc.details
                    ? Object.entries(svc.details)
                        .slice(0, 3)
                        .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
                        .join(" · ")
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {result && result.components.length === 0 && !result.error && (
        <p className="wp-empty">No component details returned by actuator.</p>
      )}
    </div>
  );
}
