import { defineConfig } from "eslint/config"
import ts from "typescript-eslint"
import baseConfig from "./base.ts"
import svelte from "eslint-plugin-svelte"
import globals from "globals"

export default defineConfig(
  baseConfig,
  ...svelte.configs["flat/recommended"],
  ...svelte.configs["flat/prettier"],
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      "svelte/no-navigation-without-resolve": "off",
      "svelte/no-at-html-tags": "off"
    }
  },
  {
    files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
    languageOptions: {
      parserOptions: {
        // Only uncomment this if you want it to take 3 minutes https://github.com/sveltejs/eslint-plugin-svelte/issues/1084
        // projectService: true,
        extraFileExtensions: [".svelte"],
        parser: ts.parser
      }
    }
  },
  {
    ignores: ["node_modules", "build", ".turbo", ".svelte-kit"]
  }
)
