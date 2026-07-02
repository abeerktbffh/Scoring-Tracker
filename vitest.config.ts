import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    // Default environment is "node" (fast, for pure-logic tests). Component tests
    // that need the DOM opt in per-file via a `// @vitest-environment jsdom` docblock
    // at the top of the test file — jsdom is a devDependency so this works with no
    // further config.
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
