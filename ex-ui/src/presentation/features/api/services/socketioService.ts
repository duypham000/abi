import { io, type Socket } from "socket.io-client";
import type { SioAuthConfig } from "../types/realtime";

let socket: Socket | null = null;

export const socketioService = {
  connect(
    url: string,
    path: string,
    auth: SioAuthConfig,
    callbacks: {
      onConnect: () => void;
      onEvent: (event: string, data: unknown) => void;
      onDisconnect: () => void;
      onError: (e: Error) => void;
    }
  ) {
    socketioService.disconnect();

    const socketAuth =
      auth.enabled && auth.type === "bearer" && auth.token
        ? { token: auth.token }
        : undefined;

    socket = io(url, {
      path,
      auth: socketAuth,
      transports: ["websocket"],
    });

    socket.on("connect", callbacks.onConnect);
    socket.onAny((event: string, ...args: unknown[]) =>
      callbacks.onEvent(event, args[0])
    );
    socket.on("disconnect", callbacks.onDisconnect);
    socket.on("connect_error", (e: Error) => callbacks.onError(e));
  },

  emit(event: string, data: string) {
    if (!socket) return;
    try {
      socket.emit(event, JSON.parse(data));
    } catch {
      socket.emit(event, data);
    }
  },

  disconnect() {
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
      socket = null;
    }
  },
};
