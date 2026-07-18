import { defineConfig } from "eslint/config"
import svelteConfig from "./svelte.config.js"
import svelteBaseConfig from "@hc/eslint-config/svelte"

export default defineConfig(
	svelteBaseConfig,
	{
		languageOptions: {
			parserOptions: {
				tsconfigRootDir: import.meta.dirname,
				svelteConfig
			}
		}
	},
	{
		ignores: ["node_modules", "build", ".turbo", ".svelte-kit"]
	}
)
