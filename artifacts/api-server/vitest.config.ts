import { defineConfig } from "vitest/config";
import { config as loadDotenv } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(__dirname, ".env") });

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
