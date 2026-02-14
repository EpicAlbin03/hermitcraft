## @hc/channel-sync

This is all of the shared internal functions for syncing Youtube and Twitch to the channels and videos in the database.

### Script flags

The `scripts/seed.ts` and `scripts/wipe.ts` scripts support non-interactive flags:

- `--id`, `-i`: Target a specific channel/video ID
- `--ops`, `-o`: Comma-separated operations (for example: `channels,videos` or `channel`)
- `--all`, `-a`: Select all operations
- `--yes`, `-y`: Skip the `Type "yes" to continue` confirmation

Examples:

- `bun run scripts/seed.ts --all --yes`
- `bun run scripts/seed.ts --id UCxxxx --ops channel --yes`
- `bun run scripts/wipe.ts --ops videos --yes`
