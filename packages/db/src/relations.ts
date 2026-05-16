import { defineRelations } from 'drizzle-orm';
import { DB_SCHEMA } from './schema';

type DbRelations = ReturnType<typeof defineRelations<typeof DB_SCHEMA>>;

export const relations: DbRelations = defineRelations(DB_SCHEMA, (r) => ({
	channels: {
		videos: r.many.videos({
			from: r.channels.ytChannelId,
			to: r.videos.ytChannelId
		}),
		liveVideo: r.one.videos({
			from: r.channels.ytLiveVideoId,
			to: r.videos.ytVideoId,
			optional: true
		})
	},
	videos: {
		channel: r.one.channels({
			from: r.videos.ytChannelId,
			to: r.channels.ytChannelId
		})
	}
}));
