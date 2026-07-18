import { type Config } from "prettier"
import sveltePlugin from "prettier-plugin-svelte"
import * as tailwindPlugin from "prettier-plugin-tailwindcss"
import baseConfig from "./base.ts"

const config: Config = {
	...baseConfig,
	plugins: [sveltePlugin, tailwindPlugin],
	overrides: [
		{
			files: "*.svelte",
			options: {
				parser: "svelte"
			}
		}
	]
}

export default config
