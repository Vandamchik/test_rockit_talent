import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/public/**/*.test.ts"],
    environment: "node",
    restoreMocks: true,
    clearMocks: true,
  },
});
