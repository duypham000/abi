import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const goApiTarget = env.VITE_GO_API_URL || env.VITE_PROXY_TARGET || "https://api.tomoo.uk/go";
  const nodeApiTarget = env.VITE_NODE_API_URL || "https://api.tomoo.uk/node";
  const wsTarget = (env.VITE_NODE_WS_URL || "wss://ws.tomoo.uk").replace(/\/ws\/yjs\/?$/, "").replace(/\/+$/, "");

  const parseTarget = (urlStr: string) => {
    try {
      const u = new URL(urlStr);
      return {
        origin: u.origin,
        basePath: u.pathname.replace(/\/+$/, ""),
      };
    } catch {
      return { origin: urlStr, basePath: "" };
    }
  };

  const goParsed = parseTarget(goApiTarget);
  const nodeParsed = parseTarget(nodeApiTarget);

  const secure = false;
  const changeOrigin = true;

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: [
        "prosemirror-model",
        "prosemirror-state",
        "prosemirror-view",
        "prosemirror-transform",
      ],
    },
    server: {
      port: 5173,
      proxy: {
        "/api/v1/translate": {
          target: nodeParsed.origin,
          rewrite: (p) => (nodeParsed.basePath ? `${nodeParsed.basePath}${p}` : p),
          changeOrigin,
          secure,
        },
        "/api": {
          target: goParsed.origin,
          rewrite: (p) => (goParsed.basePath ? `${goParsed.basePath}${p}` : p),
          changeOrigin,
          secure,
        },
        "/actuator": {
          target: goParsed.origin,
          rewrite: (p) => (goParsed.basePath ? `${goParsed.basePath}${p}` : p),
          changeOrigin,
          secure,
        },
        "/ws/yjs": {
          target: wsTarget,
          ws: true,
          changeOrigin,
          secure,
        },
      },
    },
  };
});
