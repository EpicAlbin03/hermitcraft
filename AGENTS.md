# Repository Guide for Agents

## Project Structure

- **Stack:** TypeScript 7, Effect v4, Svelte 5 (Runes), Tailwind CSS v4, Bun, Drizzle ORM v1.
- **Files:** `apps/web` (SvelteKit), `apps/bg-worker`, `packages/db`, `packages/content-sync/`.

## General Rules

- NEVER use subagents unless explicitly asked to do so.
- Be extremely concise.
- NEVER add unit tests. No standard test command.
- NEVER run `dev` or `build` commands.
- NEVER run migration commands.
- Always run check/format/lint commands when you are done making a change.
- NEVER write explicit return types unless necessary.
- `as any` should be an absolute last resort. Always use real type safety. Lean on type inference instead of manually writing new types over and over again.
- NEVER generate html reports, give a short summary instead.
- NEVER remove comments in the code.

## Vendored Repositories

- Vendored repositories live under `repos/`.
- Use vendored repositories as read-only reference material.
- Do not edit files under `repos/`.
- Do not import from `repos/`.

Available repositories:

- `effect-smol`: Effect v4
- `drizzle-orm`: Drizzle ORM
- `t3code`: Large effect codebase with many examples and patterns.

## Using Effect v4

- When writing Effect code, inspect `repos/effect-smol/` for idiomatic usage, tests, module structure, and API design.
- Prefer patterns from `repos/effect-smol/` over guesses or web search.
