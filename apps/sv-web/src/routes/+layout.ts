import { browser } from '$app/environment';
import { parseUserConfig } from '$lib/config/user-config.svelte';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = ({ data }) => {
	if (!browser) return data;

	return { ...data, userSettings: parseUserConfig(document.cookie) };
};
