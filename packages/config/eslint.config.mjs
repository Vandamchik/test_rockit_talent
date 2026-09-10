import js from "@eslint/js";
import globals from "globals";
import process from "node:process";
import tseslint from "typescript-eslint";

const defaultProjectFiles = process.cwd().endsWith("/apps/api")
  ? [
      "../../apps/api/test/public/*.ts",
      "../../apps/api/test/support/*.ts",
      "../../apps/api/vitest.config.ts",
    ]
  : process.cwd().endsWith("/packages/db")
    ? ["../db/prisma/*.ts", "../db/prisma.config.ts"]
    : undefined;

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/coverage/**",
      "**/src/generated/**",
      "**/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: defaultProjectFiles ? { allowDefaultProject: defaultProjectFiles } : true,
      },
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },
  {
    files: ["**/*.test.{ts,tsx}", "test/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/unbound-method": "off",
    },
  },
);
