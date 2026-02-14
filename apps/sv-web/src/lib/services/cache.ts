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

export class RateLimitError extends TaggedError('RateLimitError') {
	remaining: number;
	resetIn: number;
	constructor(message: string, remaining: number, resetIn: number) {
		super();
		this.message = message;
		this.remaining = remaining;
		this.resetIn = resetIn;
	}
}

const DEFAULT_TTL = 120; // 2 minutes

export const RATE_LIMITS = {
	sidebar: { limit: 60, windowSecs: 60 },
	live: { limit: 60, windowSecs: 60 },
	channel: { limit: 60, windowSecs: 60 },
	channelVideos: { limit: 240, windowSecs: 60 },
	allVideos: { limit: 240, windowSecs: 60 }
} as const;

export type RateLimitKey = keyof typeof RATE_LIMITS;

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
						await client.send('SET', [key, JSON.stringify(result), 'EX', ttl.toString()]);
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
			}).pipe(Effect.catchAll(() => Effect.succeed(undefined))),

		/**
		 * Rate limiting using sliding window counter
		 * @param identifier - Unique identifier (typically IP address or user ID)
		 * @param endpoint - The endpoint being rate limited (key of RATE_LIMITS)
		 * @returns Effect that succeeds with rate limit info or fails with RateLimitError
		 */
		rateLimit: (identifier: string, endpoint: RateLimitKey) =>
			Effect.gen(function* () {
				const config = RATE_LIMITS[endpoint];
				const key = `ratelimit:${endpoint}:${identifier}`;

				// Increment counter
				const count = yield* Effect.tryPromise({
					try: () => client.incr(key),
					catch: (err) => new CacheError('Failed to increment rate limit counter', { cause: err })
				});

				// Set expiry if this is the first request in window
				if (count === 1) {
					yield* Effect.tryPromise({
						try: () => client.expire(key, config.windowSecs),
						catch: (err) => new CacheError('Failed to set rate limit expiry', { cause: err })
					});
				}

				// Get TTL for reset time
				const ttl = yield* Effect.tryPromise({
					try: () => client.ttl(key),
					catch: () => config.windowSecs
				}).pipe(Effect.catchAll(() => Effect.succeed(config.windowSecs)));

				const remaining = Math.max(0, config.limit - count);
				const limited = count > config.limit;

				if (limited) {
					return yield* Effect.fail(
						new RateLimitError(
							`Rate limit exceeded for ${endpoint}. Try again in ${ttl} seconds.`,
							remaining,
							ttl
						)
					);
				}

				return { limited: false, remaining, resetIn: ttl };
			}).pipe(
				// If Redis fails, allow the request (fail-open)
				Effect.catchTag('CacheError', () =>
					Effect.succeed({ limited: false, remaining: 999, resetIn: 0 })
				)
			),

		/**
		 * Check rate limit without incrementing (peek)
		 */
		rateLimitPeek: (identifier: string, endpoint: RateLimitKey) =>
			Effect.gen(function* () {
				const config = RATE_LIMITS[endpoint];
				const key = `ratelimit:${endpoint}:${identifier}`;

				const countStr = yield* Effect.tryPromise({
					try: () => client.get(key),
					catch: (err) => new CacheError('Failed to get rate limit counter', { cause: err })
				}).pipe(Effect.catchAll(() => Effect.succeed(null)));

				const count = countStr ? parseInt(countStr, 10) : 0;
				const remaining = Math.max(0, config.limit - count);

				return { count, remaining, limit: config.limit };
			}).pipe(Effect.catchAll(() => Effect.succeed({ count: 0, remaining: 999, limit: 999 })))
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
	};
}

export type CacheServiceType = Effect.Effect.Success<typeof cacheService>;

export class CacheService extends Effect.Service<CacheService>()('CacheService', {
	scoped: cacheService
}) {}
