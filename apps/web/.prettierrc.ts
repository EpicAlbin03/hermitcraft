import { type Config } from 'prettier';
import rootConfig from '../../.prettierrc.ts';

const config: Config = {
	...rootConfig,
	tailwindStylesheet: './src/routes/layout.css'
};

export default config;
