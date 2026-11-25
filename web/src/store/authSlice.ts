import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { AuthUser } from "@/core/interfaces/auth";

/**
 * Auth state is now a thin mirror of the Rust auth core (the source of truth).
 * Tokens are NOT stored here — windows fetch a fresh access token on demand via
 * `authBridge.getAccessToken()`. We only keep the decoded user for UI/routing.
 */
/**
 * "unknown" — auth not resolved yet (background sync in progress). Render flows
 * use this to show a loading state WITHOUT blocking on any fetch.
 * "authed" / "guest" — resolved.
 */
export type AuthStatus = "unknown" | "authed" | "guest";

export interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
}

/** Decode the user claims from a JWT access token (no verification). */
export function decodeUser(token: string): AuthUser | null {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    const parsed = JSON.parse(jsonPayload);
    const email = parsed.email || "";
    const username =
      parsed.username || (email ? email.split("@")[0] : "User");
    return {
      userId: parsed.user_id || parsed.userId || parsed.sub || 0,
      username,
      email,
      role: parsed.role || "USER",
    };
  } catch (err) {
    console.error("Failed to decode JWT claims:", err);
    return null;
  }
}

const initialState: AuthState = {
  user: null,
  status: "unknown",
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    // Resolves auth: sets the user and flips status to authed/guest.
    setUser(state, action: PayloadAction<AuthUser | null>) {
      state.user = action.payload;
      state.status = action.payload ? "authed" : "guest";
    },
  },
});

export const { setUser } = authSlice.actions;
export default authSlice.reducer;
