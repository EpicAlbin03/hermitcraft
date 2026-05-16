# Repository Guide for Agents

## Project Structure

- **Stack:** TypeScript, Effect v4, Svelte 5 (Runes), Tailwind CSS v4, Bun, Drizzle ORM.
- **Files:** `apps/web` (SvelteKit), `apps/bg-worker`, `packages/db`, `packages/content-sync/`.

## General Rules

- Be extremely concise.
- NEVER add unit tests. No standard test command.
- NEVER run `dev` or `build` commands.
- Always use `bun add <package>` when installing packages.
- Always run check/format/lint commands when your done making a change.
- NEVER write explicit return types unless necessary.
- `as any` should be an absolute last resort. Always use real type safety. Lean on type inference instead of manually writing new types over and over again.

## Using Effect v4

The Effect v4 repo is cloned locally at `$HOME\cloned-repos\effect-smol`. Look at this when writing effect code.
