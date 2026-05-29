import { USER_CONFIG_COOKIE_NAME, deserializeUserConfig } from '$lib/config/user-config.svelte';
import type { LayoutServerLoad } from './$types.js';

export const load: LayoutServerLoad = async ({ cookies }) => ({
	userConfig: deserializeUserConfig(cookies.get(USER_CONFIG_COOKIE_NAME))
});
