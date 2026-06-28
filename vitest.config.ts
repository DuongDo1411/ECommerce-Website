import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(rootDir, "src"),
    },
  },
  test: {
    // Vitest 4's default (threads) pool throws
    // "Cannot read properties of undefined (reading 'config')" when running
    // multiple suites together in this project. The forks pool is stable here.
    pool: "forks",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
