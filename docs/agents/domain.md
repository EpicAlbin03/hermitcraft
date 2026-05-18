# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root — it points at one `CONTEXT.md` per app/package. Read each one relevant to the topic.
- **Relevant per-context `CONTEXT.md` files** — use the context(s) touched by the work.
- **`docs/adr/`** at the repo root — read system-wide ADRs that touch the area you're about to work in.
- **Per-context ADRs** — also check context-scoped ADR directories for the app/package you're working in.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

Multi-context repo:

```text
/
├── CONTEXT-MAP.md
├── docs/adr/                        ← system-wide decisions
├── apps/
│   ├── web/
│   │   ├── CONTEXT.md
│   │   └── docs/adr/
│   └── bg-worker/
│       ├── CONTEXT.md
│       └── docs/adr/
└── packages/
    ├── db/
    │   ├── CONTEXT.md
    │   └── docs/adr/
    └── content-sync/
        ├── CONTEXT.md
        └── docs/adr/
```

## Use the glossary's vocabulary

When your output names a domain concept, use the term as defined in the relevant `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use or there’s a real gap to capture later with `/grill-with-docs`.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 — but worth reopening because…_
