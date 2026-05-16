DELETE FROM "videos"
WHERE NOT EXISTS (
	SELECT 1
	FROM "channels"
	WHERE "channels"."yt_channel_id" = "videos"."yt_channel_id"
);
--> statement-breakpoint
ALTER TABLE "channels" DROP CONSTRAINT IF EXISTS "channels_yt_live_video_id_videos_yt_video_id_fk";
--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_yt_live_video_id_videos_yt_video_id_fk" FOREIGN KEY ("yt_live_video_id") REFERENCES "videos"("yt_video_id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_yt_channel_id_channels_yt_channel_id_fk" FOREIGN KEY ("yt_channel_id") REFERENCES "channels"("yt_channel_id") ON DELETE cascade ON UPDATE no action;
