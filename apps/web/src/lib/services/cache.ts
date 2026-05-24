import { RedisClient } from 'bun';
import { env } from '$env/dynamic/private';
import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';

export class CacheError extends Data.TaggedError('CacheError')<{
	message: string;
	cause?: unknown;
}> {}

export class RateLimitError extends Data.TaggedError('RateLimitError')<{
	message: string;
	remaining: number;
	resetIn: number;
}> {}

const DEFAULT_TTL = 120; // 2 minutes

export const RATE_LIMITS = {
	sidebar: { limit: 60, windowSecs: 60 },
	live: { limit: 60, windowSecs: 60 },
	channel: { limit: 60, windowSecs: 60 },
	channelVideos: { limit: 240, windowSecs: 60 },
	allVideos: { limit: 240, windowSecs: 60 }
} as const;

export type RateLimitKey = keyof typeof RATE_LIMITS;

const decodeCachedValue = <T>(value: string) =>
	Option.getOrNull(Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(value)) as T | null;

const encodeCachedValue = (value: unknown) =>
	Schema.encodeUnknownSync(Schema.UnknownFromJsonString)(value);

const createNoOpCache = () => ({
	getOrSet: <T>(key: string, fetcher: Effect.Effect<T>) => {
		void key;
		return fetcher;
	},
	get: <T>(key: string) => {
		void key;
		return Effect.succeed(null as T | null);
	},
	set: <T>(key: string, value: T, ttl?: number) => {
		void key;
		void value;
		void ttl;
		return Effect.void;
	},
	del: (key: string) => {
		void key;
		return Effect.void;
	},
	delPattern: (pattern: string) => {
		void pattern;
		return Effect.void;
	},
	rateLimit: (identifier: string, endpoint: RateLimitKey) => {
		void identifier;
		void endpoint;
		return Effect.succeed({ limited: false as const, remaining: 999, resetIn: 0 });
	},
	rateLimitPeek: (identifier: string, endpoint: RateLimitKey) => {
		void identifier;
		void endpoint;
		return Effect.succeed({ count: 0, remaining: 999, limit: 999 });
	}
});

const cacheService = Effect.gen(function* () {
	const redisUrl = yield* Effect.sync(() => env.REDIS_URL);

	if (!redisUrl) {
		Effect.logError('REDIS_URL is not set, caching disabled');
		return createNoOpCache();
	}

	const client = yield* Effect.acquireRelease(
		Effect.try({
			try: () => new RedisClient(redisUrl),
			catch: (cause) => new CacheError({ message: 'Failed to connect to Redis', cause })
		}),
		(redis) => Effect.sync(() => redis.close())
	).pipe(Effect.catchTag('CacheError', () => Effect.succeed(null)));

	if (!client) {
		Effect.logError('Failed to get Redis client, caching disabled');
		return createNoOpCache();
	}

	const getRaw = (key: string) =>
		Effect.tryPromise({
			try: () => client.get(key),
			catch: (cause) => new CacheError({ message: 'Failed to get from cache', cause })
		});

	const setRaw = (key: string, value: unknown, ttl: number) =>
		Effect.try({
			try: () => encodeCachedValue(value),
			catch: (cause) => new CacheError({ message: 'Failed to serialize cache value', cause })
		}).pipe(
			Effect.flatMap((encoded) =>
				Effect.tryPromise({
					try: () => client.send('SET', [key, encoded, 'EX', ttl.toString()]),
					catch: (cause) => new CacheError({ message: 'Failed to set cache', cause })
				})
			),
			Effect.asVoid
		);

	return {
		getOrSet: <T>(key: string, fetcher: Effect.Effect<T>, ttl = DEFAULT_TTL) =>
			getRaw(key).pipe(
				Effect.catch(() => Effect.succeed(null)),
				Effect.flatMap((cached) => {
					const decoded = cached ? decodeCachedValue<T>(cached) : null;
					if (decoded !== null) {
						return Effect.succeed(decoded);
					}

					return fetcher.pipe(Effect.tap((result) => setRaw(key, result, ttl).pipe(Effect.ignore)));
				})
			),

		get: <T>(key: string) =>
			getRaw(key).pipe(
				Effect.map((cached) => (cached ? decodeCachedValue<T>(cached) : null)),
				Effect.catch(() => Effect.succeed(null))
			),

		set: <T>(key: string, value: T, ttl = DEFAULT_TTL) =>
			setRaw(key, value, ttl).pipe(Effect.catch(() => Effect.void)),

		del: (key: string) =>
			Effect.tryPromise({
				try: () => client.del(key),
				catch: (cause) => new CacheError({ message: 'Failed to delete from cache', cause })
			}).pipe(Effect.catch(() => Effect.void)),

		delPattern: (pattern: string) =>
			Effect.tryPromise({
				try: async () => {
					const keys = (await client.send('KEYS', [pattern])) as string[];
					if (keys.length > 0) {
						await client.send('DEL', keys);
					}
				},
				catch: (cause) => new CacheError({ message: 'Failed to delete pattern from cache', cause })
			}).pipe(Effect.catch(() => Effect.void)),

		rateLimit: (identifier: string, endpoint: RateLimitKey) =>
			Effect.gen(function* () {
				const config = RATE_LIMITS[endpoint];
				const key = `ratelimit:${endpoint}:${identifier}`;

				const count = yield* Effect.tryPromise({
					try: () => client.incr(key),
					catch: (cause) =>
						new CacheError({ message: 'Failed to increment rate limit counter', cause })
				});

				if (count === 1) {
					yield* Effect.tryPromise({
						try: () => client.expire(key, config.windowSecs),
						catch: (cause) => new CacheError({ message: 'Failed to set rate limit expiry', cause })
					});
				}

				const ttl = yield* Effect.tryPromise({
					try: () => client.ttl(key),
					catch: (cause) => new CacheError({ message: 'Failed to get rate limit TTL', cause })
				}).pipe(Effect.catch(() => Effect.succeed(config.windowSecs)));

				const remaining = Math.max(0, config.limit - count);
				if (count > config.limit) {
					return yield* Effect.fail(
						new RateLimitError({
							message: `Rate limit exceeded for ${endpoint}. Try again in ${ttl} seconds.`,
							remaining,
							resetIn: ttl
						})
					);
				}

				return { limited: false as const, remaining, resetIn: ttl };
			}).pipe(
				Effect.catchTag('CacheError', () =>
					Effect.succeed({ limited: false as const, remaining: 999, resetIn: 0 })
				)
			),

		rateLimitPeek: (identifier: string, endpoint: RateLimitKey) =>
			Effect.gen(function* () {
				const config = RATE_LIMITS[endpoint];
				const key = `ratelimit:${endpoint}:${identifier}`;
				const countStr = yield* getRaw(key).pipe(Effect.catch(() => Effect.succeed(null)));
				const count = countStr ? parseInt(countStr, 10) : 0;
				const remaining = Math.max(0, config.limit - count);
				return { count, remaining, limit: config.limit };
			}).pipe(Effect.catch(() => Effect.succeed({ count: 0, remaining: 999, limit: 999 })))
	};
});

type CacheServiceShape = Effect.Success<typeof cacheService>;

export class CacheService extends Context.Service<CacheService, CacheServiceShape>()(
	'web/lib/services/cache/CacheService',
	{ make: cacheService }
) {
	static readonly layer = Layer.effect(this, this.make);
}
