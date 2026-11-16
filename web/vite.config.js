import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
export default defineConfig(function (_a) {
    var _b;
    var mode = _a.mode;
    var env = loadEnv(mode, process.cwd(), "");
    var target = (_b = env.VITE_PROXY_TARGET) !== null && _b !== void 0 ? _b : "https://api.tomoo.uk";
    var wsTarget = target.replace(/^http/, "ws");
    var secure = target.startsWith("https");
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
                "/api": {
                    target: target,
                    changeOrigin: true,
                    secure: secure,
                },
                "/ws/yjs": {
                    target: wsTarget,
                    ws: true,
                    changeOrigin: true,
                    secure: secure,
                },
            },
        },
    };
});
