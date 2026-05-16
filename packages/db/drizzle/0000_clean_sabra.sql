CREATE TABLE `channels` (
	`yt_channel_id` varchar(24) NOT NULL,
	`yt_name` varchar(60) NOT NULL,
	`yt_handle` varchar(30) NOT NULL,
	`yt_description` text NOT NULL,
	`yt_avatar_url` varchar(255) NOT NULL,
	`yt_banner_url` varchar(255) NOT NULL,
	`yt_banner_thumb_hash` text,
	`yt_view_count` bigint NOT NULL,
	`yt_subscriber_count` int NOT NULL,
	`yt_video_count` int NOT NULL,
	`yt_joined_at` datetime NOT NULL,
	`twitch_user_id` varchar(20),
	`twitch_user_login` varchar(25),
	`is_twitch_live` boolean NOT NULL,
	`yt_live_video_id` varchar(11),
	`links` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`modified_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `channels_yt_channel_id` PRIMARY KEY(`yt_channel_id`)
);
--> statement-breakpoint
CREATE TABLE `videos` (
	`yt_video_id` varchar(11) NOT NULL,
	`yt_channel_id` varchar(24) NOT NULL,
	`title` varchar(100) NOT NULL,
	`thumbnail_url` varchar(255) NOT NULL,
	`published_at` datetime NOT NULL,
	`privacy_status` enum('private','public','unlisted') NOT NULL,
	`upload_status` enum('deleted','failed','processed','rejected','uploaded') NOT NULL,
	`view_count` int NOT NULL,
	`like_count` int NOT NULL,
	`comment_count` int NOT NULL,
	`duration` varchar(30) NOT NULL,
	`is_short` boolean NOT NULL,
	`livestream_type` enum('live','none','upcoming','completed') NOT NULL DEFAULT 'none',
	`livestream_scheduled_start_time` datetime,
	`livestream_actual_start_time` datetime,
	`livestream_concurrent_viewers` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`modified_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `videos_yt_video_id` PRIMARY KEY(`yt_video_id`)
);
--> statement-breakpoint
ALTER TABLE `channels` ADD CONSTRAINT `channels_yt_live_video_id_videos_yt_video_id_fk` FOREIGN KEY (`yt_live_video_id`) REFERENCES `videos`(`yt_video_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `yt_channel_id_and_published_at` ON `videos` (`yt_channel_id`,`published_at`);--> statement-breakpoint
CREATE INDEX `channel_filtered_videos` ON `videos` (`yt_channel_id`,`privacy_status`,`upload_status`,`livestream_type`,`is_short`,`published_at`);--> statement-breakpoint
CREATE INDEX `all_filtered_videos` ON `videos` (`privacy_status`,`upload_status`,`livestream_type`,`is_short`,`published_at`);--> statement-breakpoint
CREATE INDEX `view_count` ON `videos` (`view_count`);--> statement-breakpoint
CREATE INDEX `like_count` ON `videos` (`like_count`);