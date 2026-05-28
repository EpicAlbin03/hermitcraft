---
name: thermo-nuclear-code-quality-review
description: Run an extremely strict maintainability review for abstraction quality, giant files, and spaghetti-condition growth. Use for a thermo-nuclear code quality review, thermonuclear review, deep code quality audit, or especially harsh maintainability review.
disable-model-invocation: true
---

# Thermo-Nuclear Code Quality Review

Use this skill for an unusually strict review focused on maintainability, abstraction quality, and codebase health.

Above all, be **ambitious** about structural simplification. Do not stop at local cleanup. Look for "code judo" moves: restructurings that preserve behavior while making the implementation materially simpler, smaller, more direct, and more elegant.

## Core Prompt

Start from this baseline:

> Perform a deep code quality audit of the current branch's changes.
> Rethink how to structure / implement the changes to meaningfully improve code quality without impacting behavior.
> Improve abstractions, modularity, succinctness, and legibility.
> Be ambitious: if there is a clear path to improving the implementation by restructuring the code, go for it.
> Be extremely thorough and rigorous. Measure twice, cut once.

## Non-Negotiable Standards

Apply the baseline prompt above, plus these review rules:

1. **Push for structural simplification.**
   - Prefer deleting complexity over rearranging it.
   - Look for chances to eliminate branches, helpers, modes, or layers entirely.
   - Prefer solutions that feel inevitable in hindsight.

2. **Treat file-size growth as a design smell.**
   - Do not let a PR push a file from under 1k lines to over 1k lines without a strong reason.
   - Prefer extracting helpers, subcomponents, or modules instead of letting a file sprawl.
   - If the diff crosses that threshold, explicitly ask whether decomposition should come first.

3. **Do not accept spaghetti growth.**
   - Be highly suspicious of ad-hoc conditionals, scattered special cases, or one-off branches in unrelated flows.
   - Treat this as a design problem, not a style nit.
   - Prefer dedicated abstractions, simpler state models, or separate modules over tangling existing paths.

4. **Prefer direct, boring, maintainable code.**
   - Flag brittle, magical, or overly generic mechanisms that hide simple structure.
   - Flag thin abstractions, identity wrappers, and pass-through helpers that add indirection without clarity.

5. **Keep boundaries and types clean when they affect maintainability.**
   - Question unnecessary optionality, casts, `unknown`, or `any` when a clearer boundary could exist.
   - Prefer explicit models and shared contracts over loosely-shaped ad-hoc objects.
   - Call out feature logic in the wrong layer and duplication of existing canonical helpers.

6. **Flag avoidable orchestration complexity.**
   - If independent work is serialized for no good reason, ask whether the flow should run in parallel.
   - If related updates can leave state half-applied, push for a more atomic structure.
   - Do not nit-pick micro-optimizations; focus on brittleness and design clarity.

## Primary Review Questions

For every meaningful change, ask:

- Is there a code-judo move that would make this dramatically simpler?
- Can this change be reframed so fewer concepts, branches, or layers are needed?
- Did the diff worsen architecture, coupling, statefulness, or scanability?
- Did it add branching complexity where a better model or abstraction should exist?
- Is the logic in the right file and layer?
- Did it grow a file or component past a healthy size boundary?
- Is the implementation direct and legible, or driven by special cases and incidental control flow?
- Is the abstraction earning its keep, or just adding indirection?
- Did the diff obscure the real contract with casts, optionality, or ad-hoc object shapes?
- Is the orchestration more sequential or less atomic than it needs to be?

## What to Flag Aggressively

Escalate findings when you see:

- Complexity that could be removed by reframing the implementation.
- Refactors that move code around without reducing concepts or cognitive load.
- A file crossing 1000 lines due to the PR.
- New conditionals bolted onto unrelated code paths.
- One-off flags, nullable modes, or edge-case logic complicating existing control flow.
- Feature logic leaking into general-purpose modules or the wrong layer.
- Thin wrappers, magical handling, duplicated helpers, or cast-heavy contracts that make the design more indirect.
- Partial-update or needlessly sequential async flows that make the code more brittle.

## Preferred Remedies

When you identify a problem, prefer suggestions like:

- Delete a whole layer of indirection.
- Reframe the state model so conditionals disappear.
- Move ownership so the feature becomes a natural extension of an existing abstraction.
- Turn special-case logic into a simpler default flow.
- Extract focused helpers or split a large file into smaller modules.
- Replace condition chains with a typed model or explicit dispatcher.
- Separate orchestration from business logic.
- Collapse duplicate branches into one clearer flow.
- Reuse the canonical helper instead of introducing a near-duplicate.
- Make boundaries more explicit so control flow gets simpler.
- Parallelize independent work or make related updates more atomic when that also simplifies the design.

Do not settle for cosmetic feedback when the real issue is structural.
Do not settle for a cleaner version of the same messy idea when a much simpler idea is plausible.

## Output Expectations

Prioritize findings in this order:

1. Structural code-quality regressions
2. Missed opportunities for major simplification
3. Spaghetti / branching complexity increases
4. Boundary / abstraction / type-contract problems
5. File-size and decomposition concerns
6. Legibility and maintainability concerns

Do not flood the review with low-value nits if there are larger structural issues.
Prefer a smaller number of high-conviction comments over a long list of cosmetic notes.

## Approval Bar

Do not approve merely because behavior seems correct.

Approve only when there is:

- no clear structural regression
- no obvious missed simplification path
- no unjustified file-size explosion
- no obvious spaghetti-growth from special-case branching
- no hacky, magical, or needlessly indirect abstraction
- no unnecessary wrapper/cast/optionality churn obscuring the design
- no clear boundary leak, wrong-layer logic, or avoidable helper duplication

Treat the opposite conditions as presumptive blockers unless clearly justified.
If they are not met, leave explicit, actionable feedback and push for a cleaner decomposition.
