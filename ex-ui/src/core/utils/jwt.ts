/**
 * Lightweight JWT helpers — decode the payload without any external library
 * (same base64 approach as `decodeUser` in authSlice).
 */

interface JwtPayload {
  exp?: number;
  [key: string]: unknown;
}

function decodePayload(token: string): JwtPayload | null {
  try {
    return JSON.parse(atob(token.split(".")[1])) as JwtPayload;
  } catch {
    return null;
  }
}

/** Returns the token expiry as a unix timestamp in seconds, or null if absent/invalid. */
export function getTokenExp(token: string): number | null {
  const payload = decodePayload(token);
  return typeof payload?.exp === "number" ? payload.exp : null;
}

/**
 * Whether the token is expired (or about to expire within `skewSeconds`).
 * A missing/undecodable `exp` is treated as expired so we err on refreshing.
 */
export function isTokenExpired(token: string, skewSeconds = 30): boolean {
  const exp = getTokenExp(token);
  if (exp === null) return true;
  const nowSeconds = Date.now() / 1000;
  return exp - skewSeconds <= nowSeconds;
}
