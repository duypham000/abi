/**
 * Session Bootstrap & Server Connectivity Check.
 */

export async function pingServer(timeoutMs = 4000): Promise<boolean> {
  const endpoints = ["/health", "/go/health", "/healthz", "/actuator/health"];
  for (const url of endpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) return true;
    } catch {
      // try next
    }
  }
  return false;
}
