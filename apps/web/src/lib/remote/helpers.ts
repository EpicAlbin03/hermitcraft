import { DbError, DbService } from '$lib/services/db';
import { CacheService, RateLimitError, type RateLimitKey } from '$lib/services/cache';
import { error } from '@sveltejs/kit';
import { Effect, ManagedRuntime, Layer } from 'effect';
import * as Data from 'effect/Data';

type RemoteErrorBody = {
	type: 'rate_limit' | 'db' | 'unknown';
	message: string;
	cause: string;
};

class AppError extends Data.TaggedError('AppError')<{
	status: number;
	body: RemoteErrorBody;
}> {}

const appLayer = Layer.mergeAll(
	CacheService.layer,
	DbService.layer.pipe(Layer.provide(CacheService.layer))
);
const runtime = ManagedRuntime.make(appLayer);

const shutdown = async () => {
	await runtime.dispose();
	process.exit(0);
};

process.once('SIGTERM', () => {
	void shutdown();
});
process.once('SIGINT', () => {
	void shutdown();
});

export const DbRemoteRunner = async <A>(
	effect: Effect.Effect<A, DbError, DbService>,
	rateLimit?: { ip: string; endpoint: RateLimitKey }
) => {
	const program = Effect.gen(function* () {
		if (rateLimit) {
			const cache = yield* Effect.service(CacheService);
			yield* cache.rateLimit(rateLimit.ip, rateLimit.endpoint);
		}

		return yield* effect;
	}).pipe(
		Effect.catchTags({
			RateLimitError: (err: RateLimitError) =>
				Effect.fail(
					new AppError({
						status: 429,
						body: {
							type: 'rate_limit',
							message: err.message,
							cause: `Remaining: ${err.remaining}, Reset in: ${err.resetIn}s`
						}
					})
				),
			DbError: (err) =>
				Effect.fail(
					new AppError({
						status: err.message === 'Creator not found' ? 404 : 500,
						body: {
							type: 'db',
							message: err.message,
							cause: err.cause instanceof Error ? err.cause.message : String(err.cause ?? '')
						}
					})
				)
		})
	);

	try {
		return await runtime.runPromise(program);
	} catch (cause) {
		if (cause instanceof AppError) {
			throw error(cause.status, cause.body);
		}

		throw error(500, {
			type: 'unknown',
			message: 'An unexpected error occurred',
			cause: cause instanceof Error ? cause.message : String(cause)
		});
	}
};

/**
 * Get client IP from SvelteKit request
 * Checks common proxy headers first, falls back to getClientAddress
 */
export function getClientIp(request: Request, getClientAddress: () => string): string {
	// Check common proxy headers (in order of preference)
	const forwardedFor = request.headers.get('x-forwarded-for');
	if (forwardedFor) {
		// x-forwarded-for can contain multiple IPs, take the first (client)
		return forwardedFor.split(',')[0]?.trim() || getClientAddress();
	}

	const realIp = request.headers.get('x-real-ip');
	if (realIp) {
		return realIp;
	}

	const cfConnectingIp = request.headers.get('cf-connecting-ip');
	if (cfConnectingIp) {
		return cfConnectingIp;
	}

	return getClientAddress();
}
