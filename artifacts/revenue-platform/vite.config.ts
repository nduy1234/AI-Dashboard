import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.VITE_PORT || "3000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || "/";

export default defineConfig({
  envDir: "../../",
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
        secure: false,
        // Return a clean 503 JSON instead of a noisy stack trace when the API
        // server is starting up or restarting.
        configure(proxy) {
          proxy.on("error", (err, _req, res) => {
            const isRefused =
              "code" in err &&
              (err.code === "ECONNREFUSED" || err.code === "ECONNRESET");
            if (isRefused) {
              // Suppress the full stack trace — just a one-liner is enough.
              console.warn("[proxy] API server unreachable — waiting for restart…");
            } else {
              console.error("[proxy] unexpected error:", err.message);
            }
            if (
              res &&
              typeof (res as { headersSent?: boolean }).headersSent === "boolean" &&
              !(res as { headersSent?: boolean }).headersSent
            ) {
              (res as { writeHead: (s: number, h: Record<string, string>) => void; end: (b: string) => void })
                .writeHead(503, { "Content-Type": "application/json" });
              (res as { end: (b: string) => void })
                .end(JSON.stringify({ error: "API server is starting up, please retry." }));
            }
          });
        },
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
