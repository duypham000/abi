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
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return {
      userId: payload.userId,
      username: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  } catch {
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
