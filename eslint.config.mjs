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
        robotstxt: "readonly",
        ...globals.browser, // Ensure all browser-related globals are recognized
      },
    },
    ignores: ["**/browser-polyfill.min.js", "**/robotstxt.min.js", "**/sprintf.min.js", "**/js/tabsautomatic.js"],
    rules: {
      "no-unused-vars": ["error", {
        vars: "all",
        args: "after-used",
        ignoreRestSiblings: false
      }],
      "no-console": "error", // Disallow console usage entirely
      "eqeqeq": ["error", "always"], // Enforce strict equality
      "curly": ["error", "all"], // Require braces for all control structures
      "no-var": "error", // Enforce the use of let/const over var
      "prefer-const": ["error", {
        destructuring: "all",
        ignoreReadBeforeAssign: false
      }], // Enforce the use of const where possible
      "strict": ["error", "global"], // Enforce strict mode at the global level
      // "no-implicit-globals": "error", // Disallow global variable/function declarations
      "no-alert": "error", // Disallow use of alert/confirm/prompt
      "no-debugger": "error", // Disallow debugger statements
      "no-eval": "error", // Disallow the use of eval()
      "no-implied-eval": "error", // Disallow indirect eval() calls
      "no-return-await": "error", // Disallow redundant return-await
      "no-empty": ["error", { "allowEmptyCatch": false }], // Disallow empty blocks entirely, even in catch
      "consistent-return": "error", // Enforce consistent return values in functions
      "no-undefined": "error", // Disallow the use of undefined
      "no-multi-assign": "error", // Disallow multiple variable assignments in a single statement
      "no-shadow": "error", // Disallow variable declarations from shadowing outer scope variables
      "no-duplicate-imports": "error", // Disallow duplicate imports
      // "max-len": ["warn", { "code": 80, "ignoreUrls": true }], // Enforce a maximum line length of 80 characters
      "no-floating-decimal": "error", // Disallow floating decimals without a leading or trailing 0
      "no-extra-bind": "error", // Disallow unnecessary function binding
      "no-extra-semi": "error", // Disallow unnecessary semicolons
      "no-lonely-if": "error", // Disallow if statements as the only statement in else blocks
      "block-scoped-var": "error", // Enforce the use of block-scoped variables
      "dot-notation": "error", // Enforce dot notation whenever possible
      "yoda": ["error", "never"], // Disallow Yoda conditions
      "radix": "error", // Enforce the use of the radix parameter when using parseInt()
      "array-callback-return": "error", // Enforce return statements in array method callbacks
      "no-param-reassign": ["error", { "props": false }], // Disallow reassignment of function parameters
      "no-magic-numbers": ["error", { "ignore": [0, 1, -1] }], // Disallow magic numbers except common ones like 0 and 1
      "no-new": "off", // Allow the use of the `new` operator without assignment
      "no-restricted-syntax": ["error", "WithStatement"], // Disallow the use of `with`
    }
  },
  pluginJs.configs.recommended,
];
