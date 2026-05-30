import { type Config } from "prettier"
import baseConfig from "./base"

const config: Config = {
  ...baseConfig,
  plugins: ["prettier-plugin-svelte", "prettier-plugin-tailwindcss"],
  overrides: [
    {
      files: "*.svelte",
      options: {
        parser: "svelte",
      },
    },
  ],
}

export default config
