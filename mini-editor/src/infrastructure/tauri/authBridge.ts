import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const TOKEN_KEY = "tomo_access_token";

export async function getAccessToken(): Promise<string | null> {
  if (isTauri()) {
    try {
      return await invoke<string | null>("auth_access_token");
    } catch (err) {
      console.warn("Tauri auth_access_token error:", err);
      return null;
    }
  }
  return localStorage.getItem(TOKEN_KEY);
}

export async function peekAccessToken(): Promise<string | null> {
  if (isTauri()) {
    try {
      return await invoke<string | null>("auth_peek_access_token");
    } catch {
      return null;
    }
  }
  return localStorage.getItem(TOKEN_KEY);
}

export async function login(identifier: string, password: string): Promise<string> {
  if (isTauri()) {
    const apiBase =
      (import.meta.env.TOMO_API_BASE as string | undefined) ||
      (import.meta.env.VITE_GO_API_URL
        ? `${(import.meta.env.VITE_GO_API_URL as string).replace(/\/+$/, "")}/v1`
        : undefined);
    return await invoke<string>("auth_login", { identifier, password, apiBase });
  }

  const res = await fetch("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier,
      username: identifier,
      email: identifier,
      password,
    }),
  });

  if (!res.ok) {
    let errMsg = `Đăng nhập thất bại (${res.status})`;
    try {
      const errJson = await res.json();
      if (errJson.message) errMsg = errJson.message;
    } catch {
      // non-json response
    }
    throw new Error(errMsg);
  }

  const json = await res.json();
  const token =
    json.data?.accessToken ||
    json.data?.access_token ||
    json.data?.token ||
    "";

  if (!token) {
    throw new Error("Không nhận được access token từ server");
  }

  localStorage.setItem(TOKEN_KEY, token);
  return token;
}

export async function logout(): Promise<void> {
  if (isTauri()) {
    try {
      await invoke("auth_logout");
    } catch (err) {
      console.warn("Tauri auth_logout error:", err);
    }
  } else {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      try {
        await fetch("/api/v1/auth/logout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
      } catch {
        // ignore logout errors
      }
    }
    localStorage.removeItem(TOKEN_KEY);
  }
}

export async function isAuthenticated(): Promise<boolean> {
  if (isTauri()) {
    try {
      return await invoke<boolean>("auth_is_authenticated");
    } catch {
      return false;
    }
  }
  return !!localStorage.getItem(TOKEN_KEY);
}

export function onAuthChanged(cb: () => void): () => void {
  if (isTauri()) {
    let unlistenFn: (() => void) | null = null;
    listen("auth://changed", () => {
      cb();
    }).then((unlisten) => {
      unlistenFn = unlisten;
    });
    return () => {
      unlistenFn?.();
    };
  }

  const handler = (e: StorageEvent) => {
    if (e.key === TOKEN_KEY) {
      cb();
    }
  };
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("storage", handler);
  };
}
