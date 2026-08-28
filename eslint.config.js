import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "client/dist", "coverage", "client/public"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // The codebase predates linting; these trip often enough to block a
      // first pass without catching real defects.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  }
);
