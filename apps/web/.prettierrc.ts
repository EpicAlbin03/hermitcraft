import { type Config } from "prettier"
import svelteBaseConfig from "@hc/prettier-config/svelte"

const config: Config = {
	...svelteBaseConfig,
	tailwindStylesheet: "./src/routes/layout.css"
}

export default config
