## @hc/content-sync

This is all of the shared internal functions for reconciling YouTube and Twitch data into the creators and videos stored in the database.

### Script flags

The `scripts/seed.ts` and `scripts/wipe.ts` scripts support non-interactive flags:

- `--id`, `-i`: Target a specific creator or video ID
- `--ops`, `-o`: Comma-separated operations (for example: `creators,videos` or `creator,youtubeLiveStatus`)
- `--all`, `-a`: Select all operations
- `--yes`, `-y`: Skip the confirmation prompt

Examples:

- `bun run scripts/seed.ts --all --yes`
- `bun run scripts/seed.ts --id UCxxxx --ops creator,videos --yes`
- `bun run scripts/wipe.ts --ops videos --yes`
- `bun run scripts/backfill.ts --id UCxxxx`
