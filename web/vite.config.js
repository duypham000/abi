import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
export default defineConfig(function (_a) {
    var mode = _a.mode;
    var env = loadEnv(mode, process.cwd(), "");
    var goApiTarget = env.VITE_GO_API_URL || env.VITE_PROXY_TARGET || "http://api.tomoo.uk/go";
    var nodeApiTarget = env.VITE_NODE_API_URL || "http://api.tomoo.uk/node";
    var wsTarget = (env.VITE_NODE_WS_URL || "wss://ws.tomoo.uk").replace(/\/ws\/yjs\/?$/, "").replace(/\/+$/, "");
    var parseTarget = function (urlStr) {
        try {
            var u = new URL(urlStr);
            return {
                origin: u.origin,
                basePath: u.pathname.replace(/\/+$/, ""),
            };
        }
        catch (_a) {
            return { origin: urlStr, basePath: "" };
        }
    };
    var goParsed = parseTarget(goApiTarget);
    var nodeParsed = parseTarget(nodeApiTarget);
    var secure = false;
    var changeOrigin = true;
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
                    rewrite: function (p) { return (nodeParsed.basePath ? "".concat(nodeParsed.basePath).concat(p) : p); },
                    changeOrigin: changeOrigin,
                    secure: secure,
                },
                "/api": {
                    target: goParsed.origin,
                    rewrite: function (p) { return (goParsed.basePath ? "".concat(goParsed.basePath).concat(p) : p); },
                    changeOrigin: changeOrigin,
                    secure: secure,
                },
                "/actuator": {
                    target: goParsed.origin,
                    rewrite: function (p) { return (goParsed.basePath ? "".concat(goParsed.basePath).concat(p) : p); },
                    changeOrigin: changeOrigin,
                    secure: secure,
                },
                "/ws/yjs": {
                    target: wsTarget,
                    ws: true,
                    changeOrigin: changeOrigin,
                    secure: secure,
                },
            },
        },
    };
});
