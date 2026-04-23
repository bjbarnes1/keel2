---
name: Timeline Rebuild — Waterline with Available Money scrub, trajectory curve, scroll-synced legend
overview: Rebuild the Timeline screen end-to-end around the Waterline thesis. Narrows viewport from 6 weeks to 14 days for real data density (30-50 commitments/month). Renders proportional depths above and below the line by per-event amount. Introduces same-day stacking (primary anchor at deepest item's depth plus a small companion dot). Adds the Now line as the spine (dashed vertical, always centered, data moves past). Adds the Available Money pinned card above the chart, updating in real time as the user scrubs. Adds a subtle trajectory curve below the Waterline showing projected Available Money over the visible period, with a sea-green focal dot sliding along the curve. Bidirectional scroll sync between chart and legend via useTimelineSync. Chunked event loading via useTimelineEvents. Commits explicitly to the motion, easing, opacity, and haptic polish that makes the chart feel physical rather than diagrammatic.
todos:
  - id: design-tokens-verify
    content: |
      Verify Keel2 design tokens are in place. Check `globals.css` and `tailwind.config.ts` for:
      - Color tokens: `--keel-tide` (#0e1412), `--keel-tide-2` (#141a17), `--keel-ink` (#f0ebdc), `--keel-ink-2` through `--keel-ink-5`, `--keel-safe` (#6bb391), `--keel-safe-soft` (#8ec4a8), `--keel-attend` (#d48f46)
      - Glass utilities: `.glass-clear`, `.glass-heavy`, `.glass-tint-safe`, `.glass-tint-attend`
      - Radius tokens: `--radius-sm` (14px), `--radius-md` (18px), `--radius-lg` (24px), `--radius-xl` (38px)

      If any missing, apply from the design brief before proceeding. Every subsequent todo depends on these.
    status: pending

  - id: timeline-page-shell
    content: |
      Rewrite `src/app/timeline/page.tsx` as an orchestrator. The page owns no gesture/event logic — just composes.

      ```
      AppShell
        Header: "Timeline" + "14 days" chip + avatar
        Chart container (position: relative):
          AvailableMoneyCard (absolute, top-center, pinned to Now line)
          WaterlineChart (full-width, 220px height)
        AnnualTotalsStrip (kept as-is)
        TimelineLegend (fills remaining vertical, scrolls internally)
      ```

      Data flow:
      1. `useTimelineEvents(focalDate)` → events, viewport-filtered events, loading state
      2. `useTimelineSync()` → focalDate + setters
      3. `availableMoneyAtFocal = availableMoneyAt(focalDate, allEvents, startingAvailableMoney)`
      4. `availableMoneyTrajectory`: for every event in viewport plus viewport boundaries, compute `{date, value}` points
      5. Props to children accordingly

      Initial focal = today.

      Empty state (no events): centered glass-clear card in chart zone, "Your timeline will fill in as you add income and commitments." Button routes to commitments add.

      Loading skeleton: subtle shimmer across chart area for 300ms minimum while initial chunk loads.

      Max horizon message: if `hasReachedMaxHorizon` and user approaches edge, inline callout in legend area "Projections beyond 6 months are fuzzy. Keel will fill in the details as the time comes closer."
    status: pending

  - id: waterline-chart-svg
    content: |
      Create `src/components/keel/waterline-chart.tsx`. Pure presentational SVG — no data fetching, no state beyond gesture handling.

      Props:
      ```typescript
      {
        eventsInViewport: ProjectionEvent[];
        focalDate: Date;
        availableMoneyAtFocal: number;
        availableMoneyTrajectory: Array<{ date: Date; value: number }>;
        onFocalChange: (date: Date) => void;
        viewportDays: 14;
        width: number;
        height: 220;
      }
      ```

      SVG viewBox: `0 0 W 220`.

      Layout zones (vertical):
      - 0-32: reserved for AvailableMoneyCard overlay
      - 32-108: above-waterline (income markers rise from baseline)
      - 108-118: waterline zone (baseline at y=113)
      - 118-195: below-waterline (commitment anchors + trajectory curve)
      - 195-215: horizon labels (dates)

      **Waterline baseline.** Horizontal line at y=113, `stroke="rgba(240, 235, 220, 0.3)"`, width 0.75px, spans x=10 to x=W-10.

      **Now line.** Vertical dashed line at x=W/2, y=32 to y=195. `stroke="rgba(240, 235, 220, 0.15)"`, width 1px, dasharray "3 4". "NOW" label at top in `--keel-safe-soft`, 8px uppercase, letter-spacing 1.5. NEVER moves.

      **Now intersection band.** 20px tall, 80px wide centered on Now line at waterline. Fill `rgba(142, 196, 168, 0.06)`. A whisper of sea-green signaling "you are here."

      **Income markers (above line).**
      For each income in viewport:
      - normalized = event.amount / maxAmountInViewport
      - height = 8 + normalized * 65
      - y = 113 - height
      - x = proportional to (event.date - viewportStart) / viewportDuration
      - Stem from (x, 113) to (x, y+4), `stroke="rgba(240, 235, 220, 0.25)"`, width 0.75
      - Circle at (x, y), radius 3 + normalized * 2.5, fill `#f0ebdc`
      - Fade if >2 weeks from focal: opacity *= 0.65. >4 weeks: opacity *= 0.35
      - Past events (date < today): opacity *= 0.65

      **Commitment anchors (below line).** Mirror of income markers.
      - Stem from (x, 113) downward to (x, y-4)
      - Circle at y = 113 + (8 + normalized * 65), radius same scale
      - Fill `rgba(240, 235, 220, 0.85)` — slightly dimmer than incomes
      - If attention state (under-funded): fill `#d48f46`, matching amber stroke

      **Same-day stacking.** Pre-process events by ISO date string. For each group with >1 event of same type:
      - Primary = event with largest amount, render as normal
      - Companions: radius 60% of primary, position offset (primary.x + 4, primary.y + 4), opacity 70% of primary, no stems
      - Mixed income + commitment on same date: render independently, above and below line

      **Trajectory curve.** In below-waterline zone (y=118 to y=195). Normalize:
      ```
      maxValue = max across trajectory points in viewport
      minValue = min across trajectory points in viewport
      range = max(maxValue - minValue, 1)
      yForValue(v) = 195 - ((v - minValue) / range) * 77
      ```

      Render:
      - Smoothed path (Catmull-Rom with tension 0.5) at `stroke="rgba(142, 196, 168, 0.4)"`, width 1.25, no fill
      - Same smoothed path with fill = `url(#moneyTraj)` gradient from `rgba(142, 196, 168, 0.25)` top to `rgba(142, 196, 168, 0)` bottom. Close path by appending `L W-10 195 L 10 195 Z`

      **Focal dot on trajectory.** At `(W/2, yForValue(availableMoneyAtFocal))`. Radius 4, fill `#8ec4a8`. Outer pulse ring: radius 7, no fill, `stroke="rgba(142, 196, 168, 0.4)"`, width 1, CSS keyframe animating opacity 0.4↔0.15 on 2s ease-in-out loop. Paused during active scrub.

      **Gesture handling.**
      - Pointer/touch drag horizontal: deltaDays = -deltaPixels / ((W-20)/viewportDays). New focal = focalDate + deltaDays. Call onFocalChange once per requestAnimationFrame.
      - Release with velocity: apply momentum decay, 0.92 per frame, ~400ms to rest.

      **Haptic feedback.**
      - Track previous-frame event positions relative to Now line
      - Each frame: detect events that crossed Now since last frame
      - `navigator.vibrate(10)` for income crossings, `navigator.vibrate(5)` for commitment crossings
      - Rate limit: one haptic per 80ms max
      - NEVER fire on today crossings (would spam constantly)
      - Feature detect: `if ('vibrate' in navigator)` — no-op on desktop

      **Horizon labels at bottom.**
      - Left (x=10, y=207): start date in `#5f645e`, 8px, uppercase
      - Center (x=W/2, y=207): "Today · 20 Apr" in `--keel-safe-soft`, 8px, uppercase
      - Right (x=W-10, y=207): end date, same styling as left
    status: pending

  - id: available-money-card
    content: |
      Create `src/components/keel/available-money-card.tsx`.

      Props:
      ```typescript
      {
        value: number;
        focalDate: Date;
        isTodayFocused: boolean;
      }
      ```

      Layout: `position: absolute; top: 0; left: 50%; transform: translateX(-50%); z-index: 10`. Parent chart container has `position: relative` and ~8px top padding.

      Styling:
      - Background `rgba(20, 26, 23, 0.85)` + `backdrop-filter: blur(30px) saturate(180%)`
      - Border `0.5px solid rgba(142, 196, 168, 0.25)`
      - Border-radius 14px (`--radius-sm`)
      - Padding 10px 18px
      - Shadow `inset 0 0.5px 0 rgba(255, 255, 255, 0.1), 0 8px 24px rgba(0, 0, 0, 0.5)`
      - Min-width 130px, centered text

      Content:
      - Label line: 9px uppercase, `--keel-safe-soft`, letter-spacing 0.18em, weight 500
        - isTodayFocused=true: "YOU HAVE"
        - isTodayFocused=false: "ON {formatDate(focalDate, 'short-caps')}" (e.g., "ON 25 APR")
      - Value line: 22px tabular-nums, `--keel-ink`, weight 500, letter-spacing -0.025em
        - formatAud(value)
        - Negative renders in `--keel-ink-3` (muted, never red)

      **Value change crossfade.**
      Keyed component — React re-mounts number span on value change. Two stacked absolutely-positioned spans:
      - Outgoing span fades 1→0 over 200ms with `cubic-bezier(0.32, 0.72, 0, 1)`
      - Incoming span fades 0→1 simultaneously, same easing
      - Crossfade, not sequential swap
      - NEVER count up digit-by-digit — the value changed because focal moved, not because money is accumulating

      **Label change.**
      isTodayFocused transition: label text crossfades same 200ms. Card width can flex via `transition: width 200ms ease` to accommodate longer "ON 25 APR" vs shorter "YOU HAVE".
    status: pending

  - id: timeline-legend-component
    content: |
      Create `src/components/keel/timeline-legend.tsx`. Scrollable event list paired with chart via shared focal-date state.

      Props:
      ```typescript
      {
        allEvents: ProjectionEvent[];
        focalDate: Date;
        onRowTap: (date: Date) => void;
        onScroll: (topDate: Date) => void;
      }
      ```

      Sections:

      **Today section** (shown if events fall on today):
      - Header: "Today · {formatDate(today, 'long')}", 10px uppercase `--keel-ink-5`, letter-spacing 0.16em
      - Rows: grid `56px 1fr auto`, gap 12px, padding 10px 8px
        - Date cell: "TODAY" in `--keel-safe-soft`, 10px, uppercase, weight 500
        - Name cell: event name in `--keel-ink` at 13px, optional sublabel in `--keel-ink-4` at 11px ("Held in full" / "Holding $X of $Y" / "Needs a look")
        - Amount cell: formatted value, tabular-nums. Inflows `--keel-safe-soft`. Outflows `--keel-ink-3`. Prefix `+` or `−`.
      - Row background: `rgba(142, 196, 168, 0.08)`, 1.5px left border in `--keel-safe-soft`, border-radius `0 6px 6px 0`
      - Multiple today rows: 4px margin between

      **Upcoming section:**
      - Header: "Upcoming" same style as today header
      - Rows: same grid, no tinted background
      - Date cell: formatDate(date, 'short-caps') in `--keel-ink-5`, 10px, tabular-nums
      - Name and amount: same rules as today, no sublabel
      - Row border-bottom: `0.5px solid rgba(255,255,255,0.04)`
      - Opacity fade: >14d from focal = 0.75 opacity, >28d = 0.5 opacity

      **Earlier section** (events before today, collapsed by default):
      - Expandable tap reveals past events at 0.6 opacity

      **Scroll sync.**
      - On legend scroll: identify top-visible row (IntersectionObserver). On scroll-end (250ms), dispatch `onScroll(topVisibleDate)`. Debounced via useTimelineSync's debounce.
      - On row tap: `onRowTap(row.date)` — chart scrubs to that date.
      - Currently-focal row gets momentary sea-green outline glow (1s fade-in/fade-out) when chart triggers sync to it.

      Container has fixed height (chart container + annual strip + remaining viewport), scrolls internally.
    status: pending

  - id: same-day-event-ordering
    content: |
      Verify the same-day event ordering fix landed correctly (income before commitment). This may have already shipped in the Pre-Launch Sprint PR — confirm it's present in `src/lib/engine/keel.ts` and that the Timeline's rendered legend reflects the correct order.

      If present: no action, just verify via test.
      If missing: apply the fix (secondary sort on type within same date, income < bill).

      Add visual regression: seed data with income + commitment on same date, render Timeline, verify legend shows income above commitment in the Today section.
    status: pending

  - id: polish-trajectory-visual
    content: |
      Dedicated polish pass on the trajectory curve. This is the single biggest difference between "chart with a curve" and "feels like the ocean."

      Tune:
      - Fill gradient: start 0.25 top / 0 bottom. If too strong, step DOWN to 0.18. Never UP past 0.30.
      - Line opacity: start 0.4. If chart ever feels busy, step down to 0.30.
      - Line stroke-width: 1.25 standard. Reduce to 1.0 if many short segments.
      - Curve smoothing: Catmull-Rom tension 0.5 default. If jagged (dense commitments), reduce to 0.3 for more smoothing. Never straight-line segments.
      - Focal dot pulse: opacity cycles 0.4↔0.15 on 2s ease-in-out. Pauses during active scrub.

      Visual test three data shapes:
      - Smooth uphill (all incomes): gentle confident climb
      - Smooth dip and recovery (single big commitment mid-viewport): valley that fills back in
      - Jagged (dense alternating incomes/commitments): busy but honest, not overwhelming

      If jagged case looks chaotic: smoothing too weak. Reduce tension from 0.5 to 0.3.
    status: pending

  - id: polish-motion-and-easing
    content: |
      Audit every animated transition. Document easing in comment at top of each animating component.

      - **Focal dot slide.** `cubic-bezier(0.34, 1.56, 0.64, 1)` (slight overshoot), 280ms. CSS transition on `cy` attribute.
      - **Available Money card crossfade.** `cubic-bezier(0.32, 0.72, 0, 1)`, 200ms, crossfade mode (not sequential).
      - **Swipe release momentum.** Exponential decay 0.92 per frame, ~400ms.
      - **Legend auto-scroll (chart-triggered).** Native `behavior: smooth`, ~300ms.
      - **Pulse ring.** CSS @keyframes, 2s ease-in-out loop, `animation-play-state: paused` controlled by className during active scrub.
      - **Waterline baseline.** No animation. Static.
      - **Now line.** No animation. Static.

      Respect `prefers-reduced-motion: reduce`: crossfades become instant swaps, momentum off, pulse locked at 0.3 opacity.
    status: pending

  - id: polish-haptics
    content: |
      Create `src/lib/haptics.ts`:
      ```typescript
      export function hapticPayCrossing() {
        if ('vibrate' in navigator) navigator.vibrate(10);
      }
      export function hapticCommitmentCrossing() {
        if ('vibrate' in navigator) navigator.vibrate(5);
      }
      ```

      In chart gesture handler, track previous-frame event IDs relative to Now line. Each frame, compute which IDs crossed. Fire haptic accordingly.

      Do NOT fire for today crossings. Rate limit 80ms. No audio, haptics only.
    status: pending

  - id: polish-opacity-hierarchy-audit
    content: |
      Audit rendered chart against hierarchy spec. At a known state, verify this order (most prominent to least):

      1. Available Money card value
      2. Focal dot on trajectory
      3. Focal-date markers
      4. Waterline baseline
      5. Near-future markers (within 2 weeks)
      6. Trajectory line
      7. Trajectory fill peak
      8. Past events and far-future markers (0.65 opacity)
      9. Now line (dashed)
      10. Now intersection band
      11. Date labels at bottom
      12. Very-far-future markers (>4 weeks)

      Eye should land on Available Money card first, then focal markers at Now, then drift to trajectory shape. If any element violates the hierarchy, tune it down — never up.
    status: pending

  - id: responsive-behavior
    content: |
      Audit at iPhone SE (375px), iPhone 15 Pro Max (430px), iPad portrait (768px).

      - 375px: viewport still 14 days, markers packed tighter. Bottom labels shrink to 7px. Card occupies ~35% screen width, acceptable.
      - 768px: constrain chart container to `max-width: 500px` centered. Don't expand viewport to 28 days on wider screens.
      - Pinch-to-zoom: disabled.
    status: pending

  - id: unit-tests
    content: |
      Add `src/components/keel/waterline-chart.test.tsx`.

      Pure logic cases:
      - `normalizeDepth(amount, max)`: 0 for amount=0, 1 for amount=max, linear interpolation
      - Same-day grouping: 3 events on same date same type → 1 group with 3 members, primary=largest
      - Same-day grouping mixed types: 2 incomes + 1 commitment → 2 groups (one per type)
      - `catmullRomPath`: valid SVG path for 3, 5, 20 point inputs; first/last exact
      - Viewport filter: events outside [focal-7d, focal+7d] excluded
      - Pay-crossing detection: prev x=W/2+5, current x=W/2-5 → crossed=true
    status: pending

  - id: integration-tests
    content: |
      Add integration tests to `src/lib/hooks/use-timeline-events.test.ts` and `use-timeline-sync.test.ts` (may already exist from Foundation PR — extend if so).

      Scrub scenarios:
      - Set focalDate via chart → legend scroll handler called with correct date
      - Scroll legend to row X → chart focal updates to row X's date
      - Rapid chart scrubs → legend smooth-scrolls to each position
      - Focal reaches window edge → useTimelineEvents fires pre-fetch
      - Focal at 24-week boundary → hasReachedMaxHorizon=true, no fetch
    status: pending

  - id: lint-build-manual-qa
    content: |
      `npm run lint`, `npm run build`, `npm test` pass.

      Manual QA (preview URL first):

      **Basic flow:**
      - Navigate to /timeline — chart renders, card shows today's Available Money
      - Trajectory curve visible and smooth below waterline
      - Focal sea-green dot on trajectory at Now line position
      - Swipe chart left — future dates slide in, card updates, focal dot slides, legend auto-scrolls
      - Swipe chart right — past dates slide in, card shows "On {past date}"

      **Same-day stacking:**
      - Seeded data with multiple events same date: primary anchor + companion dot on chart, both rows highlighted in legend

      **Legend sync:**
      - Scroll legend up — chart scrubs forward, card updates
      - Scroll legend down — chart scrubs backward
      - Tap a row — chart scrubs to that date

      **Polish:**
      - Card number crossfades rather than count-up
      - Focal dot animation has spring feel, not linear
      - Swipe release momentum decays smoothly
      - Light haptic on real device when focal crosses income
      - Softer haptic on commitment
      - Pulse ring cycles slowly when idle, pauses during scrub

      **Accessibility:**
      - `prefers-reduced-motion: reduce`: all animations instant
      - SVG has `role="img"` and `aria-label` describing focal state
      - Legend rows keyboard-tappable (Enter triggers onRowTap)
      - Focus indicators visible on keyboard nav

      **Edge cases:**
      - Brand new user, no events: empty state renders, no crash
      - One event: chart shows it, trajectory flat, no divide-by-zero
      - Scrub to 30 weeks forward: max-horizon message, chart still functional
      - Negative available money: card shows negative in `--keel-ink-3`, not red

      **Performance:**
      - Initial render <100ms after data loads
      - Swipe maintains 60fps on mid-tier iPhone
      - No layout thrash — animations via CSS transforms/opacity only

      **Cross-browser:**
      - Safari iOS (primary)
      - Chrome Android
      - Desktop Safari / Chrome / Firefox

      **No orange, no red:**
      Grep diff for `text-red`, `bg-red`, `amber-500`, `amber-600`, `orange-` — zero matches.
    status: pending

isProject: false
---

# Timeline Rebuild — the plan

## What this PR lands

The Timeline screen is the flagship surface for Keel's thesis. This PR rebuilds it to deliver the promise: a chart where users see the shape of their money over time and scrub forward to predict what they'll have on any future date.

Five simultaneous changes:

1. **14-day viewport** — scales to real user density (30-50 commitments/month) without collision
2. **Proportional marker depths** — every income rises, every commitment drops, height by per-event amount
3. **Now line + scrub** — center-pinned time axis, data flows past
4. **Available Money pinned card** — primary answer live at top, updating as user explores
5. **Trajectory curve underlay** — subtle visualization of money shape below waterline with sliding focal dot

Plus infrastructure: bidirectional chart-legend sync, chunked loading via Foundation hooks, polished motion.

## Dependencies

**Must ship after Timeline Foundation PR.** That PR establishes `useTimelineEvents`, `useTimelineSync`, and `availableMoneyAt`. This PR consumes them. Don't attempt this before Foundation lands.

## Why this scope

The five changes are a system. Each alone is partial:
- Scrub interaction only makes sense with the pinned card
- Pinned card only makes sense with real-time projection
- Real-time projection requires chunked loader
- Trajectory curve only works with focal dot tying it to the Now line

These pieces depend on each other. Piecewise shipping creates awkward intermediate states.

## What this PR does NOT include

- **Tap-to-inspect on anchors.** Later PR — "tap commitment anchor → open detail." For now anchors are visual only.
- **Scenario hypotheticals via Ask Keel.** "What if I skipped rent next month?" → scenario_whatif integration. Separate PR.
- **Income/commitment editing from Timeline.** Edits happen on their detail screens.
- **Customizable viewport.** Fixed at 14 days. User-controlled time window only if evidence supports it.
- **Exporting/sharing the chart.** Separate PR.

## Polish discipline

Four todos exist specifically to preserve the quality the design deserves: `polish-trajectory-visual`, `polish-motion-and-easing`, `polish-haptics`, `polish-opacity-hierarchy-audit`.

These are NOT optional. They are NOT optimization. They are the difference between "functionally correct Timeline" and "the Timeline that makes users say it feels like the ocean."

If timeline slips, cut scope from low-priority items (reduced-motion handling, earlier section of legend, max-horizon message) before cutting polish. Polish is the product.

## Verification

- `npm run lint` / `build` / `test` pass
- Manual checklist in final todo
- Grep diff for `amber-`, `orange-`, `red-`, `text-destructive` — zero leakage
- Deploy to preview, test on actual iPhone (haptics need real device)
- Partner test with real data — observe genuine use, not "does it work"
