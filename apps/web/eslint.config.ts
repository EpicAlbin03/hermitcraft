import svelte from "eslint-plugin-svelte";
import { defineConfig } from "eslint/config";
import svelteConfig from "./svelte.config.js";
import baseConfig from "@hc/eslint-config/base";

export default defineConfig(
  baseConfig,
  ...svelte.configs["flat/prettier"],
  {
    languageOptions: {
      parserOptions: {
        svelteConfig,
      },
    },
  },
  {
    ignores: ["node_modules", "dist", "build", ".turbo", ".svelte-kit"],
  },
);
