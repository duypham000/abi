import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const goApiTarget = env.VITE_GO_API_URL || "http://127.0.0.1:8080";
  const nodeApiTarget = env.VITE_NODE_API_URL || "http://127.0.0.1:8006";
  const wsTarget = (env.VITE_NODE_WS_URL || "ws://127.0.0.1:1234").replace(/\/ws\/yjs\/?$/, "").replace(/\/+$/, "");
  const isLocal = goApiTarget.includes("127.0.0.1") || goApiTarget.includes("localhost");
  const secure = !isLocal;
  const changeOrigin = true;
  const headers = undefined;

  return {
    envPrefix: ["VITE_", "TOMO_"],
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      // Force a single copy of every ProseMirror package in the bundle.
      // Without this, pnpm may install prosemirror-model@1.25.7 (for TipTap/BlockNote)
      // and prosemirror-model@1.25.9 (for prosemirror-view), causing
      // "Cannot convert to Fragment (multiple prosemirror-model versions)" on every keystroke.
      dedupe: [
        "prosemirror-model",
        "prosemirror-state",
        "prosemirror-view",
        "prosemirror-transform",
      ],
    },

    // Two HTML entries: index.html (main window + popups) and splash.html (the
    // dedicated loading window shown once at startup).
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, "index.html"),
          splash: path.resolve(__dirname, "splash.html"),
          login: path.resolve(__dirname, "login.html"),
        },
      },
    },

    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent Vite from obscuring rust errors
    clearScreen: false,
    // 2. tauri expects a fixed port, fail if that port is not available
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        // 3. tell Vite to ignore watching `src-tauri`
        ignored: ["**/src-tauri/**"],
      },
      // Dev-only: proxy API/WS to prod so the browser calls same-origin (localhost:1420)
      // and Vite forwards server-side — no CORS preflight. Set VITE_API_BASE_URL=/api/v1
      // in .env so the app uses the relative path. Cookie has no Domain attr -> stored for
      // localhost:1420 -> refresh flow works. (Tauri dev mode can also proxy to local K8s
      // on 127.0.0.1 while injecting the api.tomo.local Host header to avoid hosts file edits.)
      proxy: {
        "/api/v1/translate": {
          target: nodeApiTarget,
          changeOrigin,
          headers,
          secure,
        },
        "/api": {
          target: goApiTarget,
          changeOrigin,
          headers,
          secure,
        },
        "/actuator": {
          target: goApiTarget,
          changeOrigin,
          headers,
          secure,
        },
        "/ws/yjs": {
          target: wsTarget,
          ws: true,
          changeOrigin,
          secure,
          configure: (proxy) => {
            proxy.on("error", (err, _req, res) => {
              console.warn("[Vite Proxy WS] error connecting to Yjs server:", err.message);
              if (res && "writeHead" in res && !res.headersSent) {
                res.writeHead(502, { "Content-Type": "text/plain" });
                res.end("Bad Gateway: Yjs WebSocket backend unavailable");
              }
            });
          },
        },
      },
    },
  };
});
