## @hc/content-sync

This is all of the shared internal functions for syncing Youtube and Twitch to the creators and videos in the database.

### Script flags

The `scripts/seed.ts` and `scripts/wipe.ts` scripts support non-interactive flags:

- `--id`, `-i`: Target a specific creator/video ID
- `--ops`, `-o`: Comma-separated operations (for example: `creators,videos` or `creator`)
- `--all`, `-a`: Select all operations
- `--yes`, `-y`: Skip the `Type "yes" to continue` confirmation

Examples:

- `bun run scripts/seed.ts --all --yes`
- `bun run scripts/seed.ts --id UCxxxx --ops creator --yes`
- `bun run scripts/wipe.ts --ops videos --yes`
