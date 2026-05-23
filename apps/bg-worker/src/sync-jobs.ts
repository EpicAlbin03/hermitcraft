import * as Cron from 'effect/Cron';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Schedule from 'effect/Schedule';
import { SyncService } from '@hc/content-sync/sync-service';

// 06:00 UTC
// 01:00 ET (US Eastern)
// 22:00 PT (previous day) (US Pacific)
// 06:00 GMT (UK)
// 07:00 CET (Central Europe)
const dailyCron = Schedule.cron(Cron.parseUnsafe('0 0 6 * * *', 'UTC'));

const syncJobs = Effect.gen(function* () {
	const syncService = yield* SyncService;

	const runRecurringSyncJob = <Out, ScheduleError, ScheduleEnv, RunError>(
		jobName: string,
		schedule: Schedule.Schedule<Out, unknown, ScheduleError, ScheduleEnv>,
		run: Effect.Effect<void, RunError, never>
	) =>
		Effect.gen(function* () {
			yield* Effect.log(`BUN_WORKER: starting ${jobName}`);
			yield* run;
			yield* Effect.log(`BUN_WORKER: finished ${jobName}`);
		}).pipe(
			Effect.annotateLogs({ jobName }),
			Effect.withSpan(`SyncJobs.${jobName}`),
			Effect.catchCause((cause) => Effect.logError('BUN_WORKER sync job failed', cause)),
			Effect.schedule(schedule)
		);

	const creatorSyncJob = runRecurringSyncJob(
		'creator sync',
		dailyCron,
		syncService.runCreatorSync('BUN_WORKER')
	);

	const twitchLiveStatusSyncJob = runRecurringSyncJob(
		'twitch live status sync',
		Schedule.spaced('2 minutes'),
		syncService.runTwitchLiveStatusSync('BUN_WORKER')
	);

	// * Disabled due to yt quota limits
	// const ytLiveStatusSyncJob = runRecurringSyncJob(
	// 	'youtube live video sync',
	// 	Schedule.spaced('2 minutes'),
	// 	syncService.runYtLiveStatusSync('BUN_WORKER')
	// );

	// 25 creators * 15 videos = 375 videos
	// 1 quota per 50 videos (375 / 50 = 7.5 = 8 batches) + (1 quota per creator for new videos checking isVideoShort)
	// Each run = 8 * 1 + upto 25 * playlist batches
	// Assuming <= 50 videos per creator (rss = 15 videos):
	// Best case: 8 quotas (no new videos)
	// Worst case: 33 quotas (every creator has new videos)
	// Every 2 minutes = 5,760 quotas
	const videoSyncJob = runRecurringSyncJob(
		'video sync',
		Schedule.spaced('2 minutes'),
		syncService.runVideoSync({ taskName: 'BUN_WORKER', maxResults: 50 })
	);

	// Example backfill 100 videos per creator (using uploads playlist):
	// 25 * 100 = 2500 videos
	// 100 / 50 = 2 playlist batches per creator
	// Uploads playlist = 25 * 2 = 50 quotas
	// Video details = 2500 / 50 = 50 quotas
	// Shorts playlist = 25 * 2 = 50 quotas (if videos aren't new, this can be excluded)
	// Total = 150 quotas
	// Backfill all 61,662 videos = 3,702 quotas or 2,468 quotas if videos already exist
	const backfillSyncJob = runRecurringSyncJob(
		'backfill sync',
		dailyCron,
		syncService.runVideoBackfill('BUN_WORKER')
	);

	const runAll = Effect.fn('runAll')(function* () {
		return yield* Effect.all(
			[creatorSyncJob, twitchLiveStatusSyncJob, videoSyncJob, backfillSyncJob],
			{
				concurrency: 5
			}
		).pipe(Effect.withSpan('SyncJobs.runAll'));
	});

	return {
		runAll
	} as const;
});

type SyncJobsShape = Effect.Success<typeof syncJobs>;

export class SyncJobs extends Context.Service<SyncJobs, SyncJobsShape>()(
	'@hc/bg-worker/sync-jobs/SyncJobs',
	{ make: syncJobs }
) {
	static readonly layer = Layer.effect(this, this.make);
}
