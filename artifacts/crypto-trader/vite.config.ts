import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = loadEnv(process.env.NODE_ENV ?? "development", __dirname, "");
const rawPort = (env.PORT || process.env.PORT || "5173").trim();
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

function normalizeBasePath(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("/") ? trimmed : null;
}

const basePath =
  normalizeBasePath(env.BASE_PATH) ??
  normalizeBasePath(process.env.BASE_PATH) ??
  "/";

export default defineConfig({
  base: basePath,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(
        import.meta.dirname,
        "..",
        "..",
        "attached_assets",
      ),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: false,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
