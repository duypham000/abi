/**
 * 3-way merge for plain JSON objects.
 *
 * Algorithm:
 *   - Field only local changed  → take local
 *   - Field only server changed → take server
 *   - Both changed to SAME value → no conflict
 *   - Both changed to DIFFERENT values → conflict
 *   - Neither changed → take base (= local = server, no difference)
 *
 * "Changed" means the value differs from base (deep-equal by JSON serialization).
 *
 * Returns:
 *   merged   — best-effort merged object (conflicting fields default to server)
 *   conflicts — list of field names that have true conflicts (caller shows dialog)
 */

function jsonEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export interface MergeResult<T> {
  merged: T;
  conflicts: string[];
}

export function threeWayMerge<T extends Record<string, unknown>>(
  base: T,
  local: T,
  server: T
): MergeResult<T> {
  const merged: Record<string, unknown> = {};
  const conflicts: string[] = [];

  const allKeys = new Set([
    ...Object.keys(base),
    ...Object.keys(local),
    ...Object.keys(server),
  ]);

  for (const key of allKeys) {
    const baseVal = base[key];
    const localVal = local[key];
    const serverVal = server[key];

    const localChanged = !jsonEq(baseVal, localVal);
    const serverChanged = !jsonEq(baseVal, serverVal);

    if (!localChanged && !serverChanged) {
      merged[key] = baseVal;
    } else if (localChanged && !serverChanged) {
      merged[key] = localVal;
    } else if (!localChanged && serverChanged) {
      merged[key] = serverVal;
    } else {
      // Both changed
      if (jsonEq(localVal, serverVal)) {
        merged[key] = localVal; // Same value → no conflict
      } else {
        conflicts.push(key);
        merged[key] = serverVal; // Default to server; dialog can override
      }
    }
  }

  return { merged: merged as T, conflicts };
}

/**
 * Convenience: parse JSON strings, merge, and re-serialize.
 * Returns null if either string is not valid JSON.
 */
export function threeWayMergeJson(
  baseJson: string | null,
  localJson: string | null,
  serverJson: string | null
): MergeResult<Record<string, unknown>> | null {
  try {
    const base = JSON.parse(baseJson ?? "{}") as Record<string, unknown>;
    const local = JSON.parse(localJson ?? "{}") as Record<string, unknown>;
    const server = JSON.parse(serverJson ?? "{}") as Record<string, unknown>;
    return threeWayMerge(base, local, server);
  } catch {
    return null;
  }
}
