import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror the "@/*" path alias from tsconfig so tests import like app code.
    alias: { "@": import.meta.dirname },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
