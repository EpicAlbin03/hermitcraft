# Repository Guide for Agents

## Project Structure

- **Stack:** TypeScript, Effect v4, Svelte 5 (Runes), Tailwind CSS v4, Bun, Drizzle ORM.
- **Files:** `apps/web` (SvelteKit), `apps/bg-worker`, `packages/db`, `packages/content-sync/`.

## General Rules

- Be extremely concise.
- NEVER add unit tests. No standard test command.
- NEVER run `dev` or `build` commands.
- NEVER run migration commands.
- Always use `bun add <package>` when installing packages.
- Always run check/format/lint commands when your done making a change.
- NEVER write explicit return types unless necessary.
- `as any` should be an absolute last resort. Always use real type safety. Lean on type inference instead of manually writing new types over and over again.

## Vendored Repositories

- Vendored repositories live under `repos/`.
- Use vendored repositories as read-only reference material.
- Do not edit files under `repos/` unless explicitly asked.
- Do not import from `repos/`.

## Using Effect v4

- When writing Effect code, inspect `repos/effect-smol/` for idiomatic usage, tests, module structure, and API design.
- Prefer patterns from `repos/effect-smol/` over guesses or web search.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for this repo via `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical triage roles use the default label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context monorepo: use root `CONTEXT-MAP.md`, then per app/package `CONTEXT.md` files and relevant ADRs. See `docs/agents/domain.md`.
