import { BunContext } from '@effect/platform-bun';
import { DbError, DbService } from '$lib/services/db';
import { CacheService, RateLimitError, type RateLimitKey } from '$lib/services/cache';
import { error } from '@sveltejs/kit';
import { Effect, Cause, ManagedRuntime, Layer } from 'effect';
import { TaggedError } from 'effect/Data';

export class AppError extends TaggedError('AppError') {
	status: number;
	body: App.Error;
	constructor(body: App.Error, status = 500) {
		super();
		this.message = body.message;
		this.cause = body.cause;
		this.body = body;
		this.status = status;
	}
}

const appLayer = Layer.mergeAll(BunContext.layer, CacheService.Default, DbService.Default);

const runtime = ManagedRuntime.make(appLayer);

const shutdown = async () => {
	console.log('sveltekit:shutdown');
	await runtime.dispose();
	process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export const DbRemoteRunner = async <A>(
	fn: (ctx: { db: DbService }) => Effect.Effect<A, DbError | AppError, DbService>,
	rateLimit?: { ip: string; endpoint: RateLimitKey }
) => {
	const result = await Effect.gen(function* () {
		const db = yield* DbService;

		if (rateLimit) {
			const cache = yield* CacheService;
			yield* cache.rateLimit(rateLimit.ip, rateLimit.endpoint);
		}

		return yield* fn({ db });
	}).pipe(
		Effect.catchTag('RateLimitError', (err: RateLimitError) =>
			Effect.fail(
				new AppError(
					{
						type: 'rate_limit',
						message: err.message,
						cause: `Remaining: ${err.remaining}, Reset in: ${err.resetIn}s`
					},
					429
				)
			)
		),
		Effect.catchTag('DbError', (err) =>
			Effect.fail(
				new AppError(
					{
						type: 'db',
						message: err.message,
						cause: err.cause instanceof Error ? err.cause.message : String(err.cause ?? '')
					},
					err.message === 'Channel not found' ? 404 : 500
				)
			)
		),
		Effect.matchCause({
			onSuccess: (res): { _type: 'success'; value: A } => ({
				_type: 'success',
				value: res
			}),
			onFailure: (cause): { _type: 'failure'; value: AppError } => {
				const failures = Array.from(Cause.failures(cause));
				if (failures.length > 0 && failures[0]) {
					return { _type: 'failure', value: failures[0] };
				}
				return {
					_type: 'failure',
					value: new AppError(
						{ type: 'unknown', message: 'An unexpected error occurred', cause: cause.toString() },
						500
					)
				};
			}
		}),
		runtime.runPromise
	);

	if (result._type === 'failure') {
		return error(result.value.status, result.value.body);
	}

	return result.value;
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
