import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    include: ["test/public/**/*.test.tsx"],
    environment: "jsdom",
    restoreMocks: true,
    clearMocks: true,
  },
});
