import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["dist/**", "coverage/**", "releases/**", "node_modules/**"],
  },
  js.configs.recommended,
  // Type-aware rules: these catch floating promises and unsafe narrowing that
  // the syntax-only preset cannot see.
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // The test project spans src, tests and the config files; the default
        // tsconfig covers src alone and would leave the rest unparsed.
        project: ["./tsconfig.test.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: {
      // Test doubles stand in for DOM and WebGL objects that are impractical
      // to build in full, so these casts are deliberate.
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      // `expect(mock.method)` is the normal way to assert on a spy; the rule
      // reads it as an unbound method reference.
      "@typescript-eslint/unbound-method": "off",
      // Async test doubles stand in for async production code even when the
      // stub body has nothing to await.
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    // Node-side tooling, outside the type-aware TS project. Two entries, not
    // one: spreading disableTypeChecked into the same object would replace
    // languageOptions and drop the Node globals with it.
    files: ["scripts/**/*.mjs", "*.config.js"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ["scripts/**/*.mjs", "*.config.js"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  // Must come last: disables ESLint rules that conflict with Prettier.
  prettier,
);
