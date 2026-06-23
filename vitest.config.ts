import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "src"),
    },
  },
  test: {
    environment: "node",
    // Only include vitest-native suites and the legacy-script wrapper.
    // Legacy script-style tests (top-level `ok()` + `process.exit`) are run
    // through src/__tests__/legacy-suites.vitest.ts so vitest can collect them.
    include: [
      "src/**/*.vitest.ts",
      "src/integrations/portal/__tests__/portal.test.ts",
    ],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
