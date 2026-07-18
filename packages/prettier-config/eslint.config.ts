import { defineConfig } from "eslint/config"
import baseConfig from "@hc/eslint-config/base"

export default defineConfig(baseConfig, {
  ignores: ["node_modules", ".turbo"]
})
