# AI Context Architecture (Plan 11)

A three-layer reference system every Ask Keel interaction grounds on. Each layer has
a different update cadence and a different trust level, so they are composed at
request time rather than stored as a single blob.

## Layers

| Layer | What it holds | Lifetime | Source of truth |
| --- | --- | --- | --- |
| **A — Observed** | User's current financial state + 12-month projection | Rebuilt per request (60s user cache) | Prisma |
| **B — Learned** | Behavioural patterns derived from this user's transaction history | Rebuilt weekly via scheduled analyser | `UserLearnedPatterns` row in Prisma |
| **C — Structural** | CPI / wage growth / asset returns / tax brackets / life-stage costs | Edited via PR; revalidated at server start | Repo-tracked JSON in `assumptions/` |

## Data flow

```
Ask Keel request
  └─ composeAskContext(userId)
        ├─ buildLayerA(userId)      — reads Prisma, runs projection, caches 60s per-user
        ├─ loadLayerB(userId)       — reads UserLearnedPatterns row (safe default if missing)
        └─ loadLayerC()             — reads + Zod-validates JSON files (cached for server lifetime)
```

The composer returns a frozen `ComposedContext` object. That object is injected into the
Sonnet system prompt and passed to `validateCitations()` after the model responds. Any
citation pointing at a path outside the composed context is treated as a hallucination
and the user-facing answer is replaced with a calm fallback.

## Invariants

1. **No LLM calls outside a direct user action.** Layer B is deterministic statistics;
   Layer A is arithmetic on Prisma rows. The only LLM calls in Ask Keel are the intent
   classifier (Haiku) and the answer generator (Sonnet), and both happen in direct
   response to a submitted message.
2. **No per-user override of Layer C.** Users whose circumstances differ from the
   baseline assumptions record the variance in Layer A (on their own profile), not by
   mutating Layer C.
3. **Every Layer C value carries a confidence level.** The AI surfaces confidence levels
   for any long-horizon claim. "Medium confidence" is a feature, not a bug.
4. **Security.** Layer C files are read with `readFile` + Zod validation. Path is resolved
   server-side only; user input never influences which file is loaded.

## Adding a new Layer C assumption

1. Add the field to the relevant JSON file in `assumptions/`
2. Extend the Zod schema in `schemas/layer-c-schema.ts`
3. Update `meta.json` with the new `lastReviewed` date
4. Run `npm run lint && npm test`
5. Commit with the source citation in the commit message

## Future: Layer D (pooled anonymised aggregates)

Not built. `compose-context.ts` is structured to accept a fourth layer without refactor —
aggregate statistics across the user base, cohort-minimum-gated, never identifying.
