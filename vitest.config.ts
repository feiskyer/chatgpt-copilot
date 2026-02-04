import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/test/**/*.test.ts"],
    setupFiles: ["src/test/vitest.setup.ts"],
    clearMocks: true,
  },
});
