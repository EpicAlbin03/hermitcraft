import { defineConfig } from "eslint/config"
import baseConfig from "@hc/eslint-config/base"

export default defineConfig(baseConfig, {
	languageOptions: {
		parserOptions: {
			tsconfigRootDir: import.meta.dirname
		}
	},
	ignores: ["node_modules", ".turbo"]
})
