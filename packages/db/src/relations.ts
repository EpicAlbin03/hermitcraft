import { defineRelations } from 'drizzle-orm';
import { DB_SCHEMA } from './schema';

type DbRelations = ReturnType<typeof defineRelations<typeof DB_SCHEMA>>;

export const relations: DbRelations = defineRelations(DB_SCHEMA, (r) => ({
	creators: {
		videos: r.many.videos({
			from: r.creators.ytChannelId,
			to: r.videos.ytChannelId
		})
	},
	videos: {
		creator: r.one.creators({
			from: r.videos.ytChannelId,
			to: r.creators.ytChannelId
		})
	}
}));
