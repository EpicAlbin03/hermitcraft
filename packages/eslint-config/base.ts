import prettier from "eslint-config-prettier"
import js from "@eslint/js"
import { defineConfig } from "eslint/config"
import ts from "typescript-eslint"
import turboConfig from "eslint-config-turbo/flat"

export default defineConfig(
  js.configs.recommended,
  ...ts.configs.recommended,
  ...turboConfig,
  prettier,
  {
    rules: {
      // typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
      // see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
      "no-undef": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "no-useless-assignment": "off"
    }
  },
  {
    ignores: ["node_modules", "build", ".turbo"]
  }
)
