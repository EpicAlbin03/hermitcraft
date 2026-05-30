import { type Config } from "prettier";
import baseConfig from "@hc/prettier-config/base";

const config: Config = {
  ...baseConfig,
  tailwindStylesheet: "./src/routes/layout.css",
};

export default config;
