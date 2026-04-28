# Budget UI Rollout Sequence

This sequence applies the new Budget visual system across the app in small, reviewable phases with minimal risk.

## Principles

- Reuse shared UI primitives first (`MetricStatCard`, `ProgressMeter`, `InsightTile`, `SurfaceCard`) before route-specific styling.
- Keep route data contracts stable; only add thin view-model mappers in route files.
- Ship one page at a time with `lint`, `test`, `build`, and browser spot-checks in light/dark modes.

## Phase Order

1. **Goals**
   - Adopt the section/header/stat structure for progress, target, and pacing cards.
   - Keep goal contribution logic untouched and only remap display models.
2. **Wealth**
   - Port holdings summary and allocation cards to the same metric + insight layout.
   - Preserve BTC live pricing and history chart behaviors.
3. **Spend**
   - Apply the card hierarchy to account summary, import/reconcile actions, and transaction groups.
   - Keep transaction classification flows and server actions unchanged.
4. **Cashflow**
   - Re-skin chart framing, period controls, and scenario table wrappers with shared primitives.
   - Keep weekly buckets, override logic, and scenario actions unchanged.
5. **Commitments**
   - Move list/detail cards to the same stat/progress pattern with clear monthly equivalents.
   - Preserve skip/edit/archive behavior and links.
6. **Home**
   - Consolidate cockpit sections into the shared surface rhythm last, after all feature routes align.
   - Use this phase for final cross-page spacing and hierarchy adjustments.

## Done Definition Per Phase

- Route uses shared primitives for top-level hierarchy and key metrics.
- Existing navigation, links, and server actions remain behaviorally identical.
- `npm run lint`, `npm test`, and `npm run build` pass.
- Browser spot-check completed at desktop and narrow widths in both themes.
