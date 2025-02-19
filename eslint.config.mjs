import globals from "globals";
import pluginJs from "@eslint/js";

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    files: ["**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: {
        browser: "readonly",
        chrome: "readonly",
        sprintf: "readonly",
        TabsAutomatic: "readonly",
        ...globals.browser, // Ensure all browser-related globals are recognized
      },
    },
    ignores: ["**/browser-polyfill.min.js", "**/sprintf.min.js", "**/js/tabsautomatic.js"],
    rules: {
      "no-unused-vars": ["error", {
        vars: "all",
        args: "after-used",
        ignoreRestSiblings: false
      }],
      "no-console": "error",
      "eqeqeq": ["error", "always"],
      "curly": ["error", "all"],
      "no-var": "error",
      "prefer-const": "error",
      "strict": ["error", "global"],
      "no-implicit-globals": "off",
      "no-alert": "error",
      "no-debugger": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-return-await": "off",
      "no-empty": ["error", { "allowEmptyCatch": true }],
    },
  },
  pluginJs.configs.recommended,
];
