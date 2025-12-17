import { RedisClient } from 'bun';
import { Effect } from 'effect';
import { TaggedError } from 'effect/Data';
import { env } from '$env/dynamic/private';

export class CacheError extends TaggedError('CacheError') {
	constructor(message: string, options?: { cause?: unknown }) {
		super();
		this.message = message;
		this.cause = options?.cause;
	}
}

// Default cache TTL: 2 minutes
const DEFAULT_TTL = 120;

const cacheService = Effect.gen(function* () {
	const redisUrl = yield* Effect.sync(() => env.REDIS_URL);

	if (!redisUrl) {
		console.warn('REDIS_URL not set, caching disabled');
		return createNoOpCache();
	}

	const client = yield* Effect.acquireRelease(
		Effect.try(() => {
			const redis = new RedisClient(redisUrl);
			return redis;
		}),
		(redis) =>
			Effect.sync(() => {
				console.log('Closing Redis connection...');
				redis.close();
			})
	).pipe(
		Effect.catchAll((err) => {
			console.error('Failed to connect to Redis, caching disabled:', err);
			return Effect.succeed(null);
		})
	);

	if (!client) {
		return createNoOpCache();
	}

	return {
		/**
		 * Get a value from cache, or fetch from source and cache it (cache-aside pattern)
		 */
		getOrSet: <T, E, R>(key: string, fetcher: Effect.Effect<T, E, R>, ttl = DEFAULT_TTL) =>
			Effect.gen(function* () {
				// Try to get from cache first
				const cached = yield* Effect.tryPromise({
					try: () => client.get(key),
					catch: (err) => new CacheError('Failed to get from cache', { cause: err })
				}).pipe(Effect.catchAll(() => Effect.succeed(null)));

				if (cached) {
					try {
						return JSON.parse(cached) as T;
					} catch {
						// Invalid JSON, fetch fresh
					}
				}

				// Not in cache, fetch from source
				const result = yield* fetcher;

				// Store in cache (fire and forget, don't block on cache write)
				yield* Effect.tryPromise({
					try: async () => {
						await client.set(key, JSON.stringify(result));
						await client.expire(key, ttl);
					},
					catch: (err) => new CacheError('Failed to set cache', { cause: err })
				}).pipe(Effect.catchAll(() => Effect.succeed(undefined)));

				return result;
			}) as Effect.Effect<T, E, R>,

		/**
		 * Get a value from cache
		 */
		get: <T>(key: string) =>
			Effect.gen(function* () {
				const cached = yield* Effect.tryPromise({
					try: () => client.get(key),
					catch: (err) => new CacheError('Failed to get from cache', { cause: err })
				}).pipe(Effect.catchAll(() => Effect.succeed(null)));

				if (cached) {
					try {
						return JSON.parse(cached) as T;
					} catch {
						return null;
					}
				}
				return null;
			}),

		/**
		 * Set a value in cache
		 */
		set: <T>(key: string, value: T, ttl = DEFAULT_TTL) =>
			Effect.tryPromise({
				try: async () => {
					await client.set(key, JSON.stringify(value));
					await client.expire(key, ttl);
				},
				catch: (err) => new CacheError('Failed to set cache', { cause: err })
			}).pipe(Effect.catchAll(() => Effect.succeed(undefined))),

		/**
		 * Delete a value from cache
		 */
		del: (key: string) =>
			Effect.tryPromise({
				try: () => client.del(key),
				catch: (err) => new CacheError('Failed to delete from cache', { cause: err })
			}).pipe(Effect.catchAll(() => Effect.succeed(undefined))),

		/**
		 * Delete multiple keys matching a pattern (using SCAN + DEL)
		 */
		delPattern: (pattern: string) =>
			Effect.tryPromise({
				try: async () => {
					// Use SCAN to find keys matching pattern, then delete them
					const keys = (await client.send('KEYS', [pattern])) as string[];
					if (keys.length > 0) {
						await client.send('DEL', keys);
					}
				},
				catch: (err) => new CacheError('Failed to delete pattern from cache', { cause: err })
			}).pipe(Effect.catchAll(() => Effect.succeed(undefined)))
	};
});

function createNoOpCache() {
	return {
		getOrSet: <T, E, R>(key: string, fetcher: Effect.Effect<T, E, R>) => {
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
			return Effect.succeed(undefined);
		},
		del: (key: string) => {
			void key;
			return Effect.succeed(undefined);
		},
		delPattern: (pattern: string) => {
			void pattern;
			return Effect.succeed(undefined);
		}
	};
}

export type CacheServiceType = Effect.Effect.Success<typeof cacheService>;

export class CacheService extends Effect.Service<CacheService>()('CacheService', {
	scoped: cacheService
}) {}
