import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { DB_QUERIES } from '$lib/db/queries';

export const load: LayoutServerLoad = async () => {
	const channels = await DB_QUERIES.getAllChannels();
	if (channels.status === 'error') {
		console.error(channels.cause);
		return error(500, { message: channels.message });
	}

	return {
		channels: channels.data
	};
};
