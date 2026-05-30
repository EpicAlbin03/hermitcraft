import svelte from "eslint-plugin-svelte";
import { defineConfig } from "eslint/config";
import svelteConfig from "./svelte.config.js";
import svelteBaseConfig from "@hc/eslint-config/svelte";

export default defineConfig(
  svelteBaseConfig,
  ...svelte.configs["flat/prettier"],
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
        svelteConfig,
      },
    },
  },
  {
    ignores: ["node_modules", "dist", "build", ".turbo", ".svelte-kit"],
  },
);
