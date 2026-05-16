import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'postgresql',
	schema: './src/schema.ts',
	dbCredentials: {
		url: Bun.env.DATABASE_URL!
	}
});
