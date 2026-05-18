# Context Map

## Contexts

- [Background Worker](./apps/bg-worker/CONTEXT.md) — runs recurring sync jobs against external platforms
- [Database](./packages/db/CONTEXT.md) — stores the project’s canonical records for HermitCraft creators and videos
- [Content Sync](./packages/content-sync/CONTEXT.md) — fetches platform data and reconciles it into the database

## Relationships

- **Background Worker → Content Sync**: the worker triggers recurring sync operations
- **Content Sync → Database**: content sync writes canonical channel and video records
- **Content Sync → External Platforms**: content sync reads YouTube and Twitch data before reconciling it into the database
