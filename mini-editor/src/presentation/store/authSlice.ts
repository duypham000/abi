import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { AuthUser } from "@/core/interfaces/auth";

export type AuthStatus = "unknown" | "authed" | "guest";

export interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
}

export const LOCAL_USER: AuthUser = {
  userId: 0,
  username: "Local User",
  email: "local@device",
  role: "USER",
};

export function decodeUser(token: string): AuthUser | null {
  if (!token) return null;
  if (token === "local-standalone-token") {
    return LOCAL_USER;
  }
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
    const username = email ? email.split("@")[0] : parsed.username || "User";
    return {
      userId: parsed.user_id || parsed.sub || 0,
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
    setUser(state, action: PayloadAction<AuthUser | null>) {
      state.user = action.payload;
      state.status = action.payload ? "authed" : "guest";
    },
  },
});

export const { setUser } = authSlice.actions;
export default authSlice.reducer;
