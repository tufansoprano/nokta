import { defineConfig } from "vitest/config";

/** Integration tests run against real dependencies: the QA Supabase project, never prod. */
export default defineConfig({
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    testTimeout: 60_000,
  },
});
