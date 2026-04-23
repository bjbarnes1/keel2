---
name: Timeline Foundation — engine parameterization, useTimelineEvents, useTimelineSync
overview: Pure logic PR that establishes the data and state foundation for the Timeline visual rebuild. Zero UI changes. Parameterizes `buildProjectionTimeline` to accept optional `startDate` for chunked loading. Adds `availableMoneyAt(date, events, starting)` as the scrub-frame lookup helper. Creates `loadProjectionChunk` server action for on-demand window fetching. Builds `useTimelineEvents(focalDate)` hook managing the loaded event window with pre-fetch, debouncing, unmount safety, and a 24-week max horizon. Builds `useTimelineSync()` hook with bidirectional focal-date updates and source-tracking lockout to prevent feedback loops. Comprehensive unit and integration tests on every piece. Existing Timeline screen continues to render identically — no visual regression.
todos:
  - id: engine-parameterize-buildProjectionTimeline
    content: |
      Extend `buildProjectionTimeline` in `src/lib/engine/keel.ts` to accept `startDate` and `horizonDays` parameters.

      New signature:
      ```typescript
      buildProjectionTimeline({
        asOf,
        startDate,      // NEW, optional, defaults to asOf
        horizonDays,    // existing, defaults to 42
        incomes,
        commitments,
        goals?,
        skips?,
      })
      ```

      Behavior:
      - When `startDate` is omitted, function behaves exactly as before (compatibility guarantee)
      - When `startDate` is provided, generate events from `startDate` through `startDate + horizonDays`
      - `asOf` always means "the current real-world date" (anchor for past/future)
      - `startDate` is the lower bound for returned events (can be past, present, or future)

      Critical: the running `projectedAvailableMoney` must start from the correct floor. If `startDate > asOf`, compute available-money value AT `startDate` first by running through all events that fall between `asOf` and `startDate` (warmup events, not returned in the result, used only to establish starting balance). Then generate and return events for the requested window with correct running balances.

      Without this, a chunk loaded for "week 8-10" would start its balance computation at 0 instead of at the real value after weeks 1-7.

      Implementation sketch:
      ```typescript
      function buildProjectionTimeline(params) {
        const { asOf, startDate = asOf, horizonDays, ... } = params;
        
        let startingBalance = initialAvailableMoney;
        if (startDate > asOf) {
          const warmupEvents = generateRawEvents(asOf, startDate);
          startingBalance = applyEventsToBalance(startingBalance, warmupEvents);
        }
        
        const rangeEnd = addDays(startDate, horizonDays);
        const events = generateRawEvents(startDate, rangeEnd);
        const withSkips = applySkipsToEvents(events, skips ?? []);
        return attachRunningBalance(withSkips, startingBalance);
      }
      ```

      Adjust helper names to match the codebase. The shape is what matters.
    status: pending

  - id: engine-availableMoneyAt-helper
    content: |
      Add a pure function `availableMoneyAt` to `src/lib/engine/keel.ts`:

      ```typescript
      export function availableMoneyAt(
        date: Date,
        events: ProjectionEvent[],
        startingAvailableMoney: number,
      ): number {
        const priorOrToday = events
          .filter(e => e.date <= date)
          .sort((a, b) => +a.date - +b.date)
          .pop();
        return priorOrToday?.projectedAvailableMoney ?? startingAvailableMoney;
      }
      ```

      If `events` is already sorted (which it will be coming out of `buildProjectionTimeline`), skip the sort — filter and take the last. This function is called per gesture frame during scrub, so optimization matters.

      Step function behavior: money is either disbursed or not as of a given event. No interpolation between events. Date exactly on an event returns that event's projected balance (inclusive). Date before any events returns the starting balance. Date after all events returns the last event's balance.

      If the codebase convention uses ISO strings internally, adapt to accept strings and convert at the boundary.
    status: pending

  - id: engine-unit-tests
    content: |
      Extend `src/lib/engine/keel.test.ts` with cases for the new behavior.

      For `buildProjectionTimeline` with `startDate`:
      - `startDate === asOf` returns same events as before refactor (regression guard)
      - `startDate = asOf + 28d`, horizonDays = 28: returns only events in days 28-56
      - First event's `projectedAvailableMoney` reflects warmup events having been applied
      - `startDate` before `asOf`: returns events for the past window with correct running balances
      - Empty income/commitment arrays: returns empty events, no crash
      - `horizonDays = 0`: returns empty array

      For `availableMoneyAt`:
      - Date before any event: returns `startingAvailableMoney`
      - Date exactly on an event: returns that event's projected balance (inclusive)
      - Date after all events: returns the last event's balance
      - Date between two events: returns the earlier event's balance (step function)
      - Empty events array: returns starting balance
      - Performance: 1000 calls against 100-event sorted array completes under 100ms

      Each test has a short comment above explaining its purpose. Tests read as documentation.
    status: pending

  - id: loadProjectionChunk-server-action
    content: |
      Add server action `loadProjectionChunk` in `src/app/actions/keel.ts` (create the file if needed).

      ```typescript
      'use server';
      
      import { z } from 'zod';
      
      const inputSchema = z.object({
        startDateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        horizonDays: z.number().int().min(1).max(200),
      });

      export async function loadProjectionChunk(input: unknown): Promise<ProjectionEvent[]> {
        const payload = inputSchema.parse(input);
        const { budget } = await getBudgetContext();
        
        const snapshot = await loadProjectionInputs(budget.id);
        
        const events = buildProjectionTimeline({
          asOf: new Date(),
          startDate: new Date(`${payload.startDateIso}T00:00:00Z`),
          horizonDays: payload.horizonDays,
          incomes: snapshot.incomes,
          commitments: snapshot.commitments,
          goals: snapshot.goals,
          skips: snapshot.activeSkips,
        });
        
        return events.map(serializeEvent);
      }
      ```

      Serialize events to wire-safe shape (Dates → ISO strings). Hook re-hydrates on receipt.

      Authentication: use existing pattern from skip actions (`assertSkipsPersistence`-style). Fail if no authed user or no budget.

      Error handling: throw typed errors the client can catch. Don't silently return empty arrays on failure.

      Do NOT revalidatePath — this is a read, not a mutation.
    status: pending

  - id: loadProjectionChunk-integration-test
    content: |
      Add integration test for `loadProjectionChunk` in `src/app/actions/keel.test.ts`.

      Cases:
      - Loads 28 days starting today: returns events with expected counts from seeded data
      - Loads 28 days starting today + 60d: returns events from days 60-88 with correct running balances
      - Loads 4-day window: returns only events in that window
      - Invalid date format throws validation error
      - `horizonDays = 300` rejected by zod
      - No authed user: appropriate error
      - Active skips within the window: events reflect the skip (e.g., MAKE_UP_NEXT skip causes post-skip bill to show increased amount)
      - STANDALONE skip in the window: event removed, no downstream changes

      Use existing test infrastructure for Prisma + server actions.
    status: pending

  - id: useTimelineEvents-hook
    content: |
      Create `src/lib/hooks/use-timeline-events.ts`.

      Internal state (useReducer):
      ```typescript
      type LoadedWindow = {
        startDate: Date;
        endDate: Date;
        events: ProjectionEvent[];
      };

      type State = {
        window: LoadedWindow | null;
        isInitialLoading: boolean;
        isFetchingMore: boolean;
        recentFetches: Array<{ rangeKey: string; timestamp: number }>;
        error: Error | null;
      };
      ```

      Return shape:
      ```typescript
      {
        events: ProjectionEvent[];
        eventsInViewport: ProjectionEvent[];
        isLoading: boolean;
        isFetchingMore: boolean;
        hasReachedMaxHorizon: boolean;
        error: Error | null;
      }
      ```

      Behavior:

      **1. Initial mount.**
      Fetch 6 weeks centered on today (3 before, 3 after). Set `isInitialLoading=true` during fetch.

      **2. focalDate changes.**
      - If `focalDate` within 5 days of `window.endDate` AND not already fetching: fetch next 28-day chunk, merge into window
      - Mirror for backward edge
      - If `focalDate` exceeds 24 weeks from today: `hasReachedMaxHorizon=true`, skip fetch

      **3. Debounce via recentFetches.**
      - rangeKey format: `${startDateIso}:${horizonDays}`
      - If same key fetched within last 2 seconds, skip the call
      - Prune entries older than 10 seconds periodically

      **4. Unmount safety.**
      Standard `isMountedRef` pattern. All async state updates check the ref first.

      **5. Viewport filtering.**
      ```typescript
      eventsInViewport = useMemo(() =>
        events.filter(e => 
          e.date >= addDays(focalDate, -7) && 
          e.date <= addDays(focalDate, 7)
        ),
        [events, focalDate]
      );
      ```

      Export the reducer for direct unit testing.
    status: pending

  - id: useTimelineEvents-tests
    content: |
      Create `src/lib/hooks/use-timeline-events.test.ts`.

      Reducer unit tests (pure, no React mocking):
      - `INIT_LOAD_START`: isInitialLoading=true
      - `INIT_LOAD_SUCCESS`: sets window, isInitialLoading=false
      - `INIT_LOAD_ERROR`: sets error, isInitialLoading=false
      - `FETCH_MORE_START`: isFetchingMore=true
      - `FETCH_MORE_SUCCESS_FORWARD`: merges events, updates window.endDate
      - `FETCH_MORE_SUCCESS_BACKWARD`: merges events, updates window.startDate
      - Overlapping events: deduplicates by event id
      - `PRUNE_RECENT_FETCHES`: removes entries older than 10s

      Integration tests (React Testing Library):
      - `renderHook(() => useTimelineEvents(today))`: fires loadProjectionChunk once
      - Updated focalDate far inside loaded window: no fetch
      - focalDate near edge: triggers forward fetch
      - Rapid focalDate changes (5 in 500ms): debounces to one fetch
      - Unmount during in-flight fetch: no "state update on unmounted" warnings
      - Mocked server action returns error: error state populated

      Use `vi.mock` or `jest.mock` for the server action. Never hit real DB in tests.
    status: pending

  - id: useTimelineSync-hook
    content: |
      Create `src/lib/hooks/use-timeline-sync.ts`.

      State:
      ```typescript
      type SyncState = {
        focalDate: Date;
        source: 'chart' | 'legend' | null;
      };
      ```

      Return:
      ```typescript
      {
        focalDate: Date;
        source: 'chart' | 'legend' | null;
        setFocalDateFromChart: (date: Date) => void;
        setFocalDateFromLegend: (date: Date) => void;
      }
      ```

      Behavior:

      **Initial state.** focalDate = initialDate arg (default today), source = null.

      **setFocalDateFromChart(date).** Set state with source='chart'. Schedule 300ms timeout to reset source to null. Clear any existing source-reset timeout. NOT debounced — chart swipes need immediacy.

      **setFocalDateFromLegend(date).** Debounced at 200ms via ref-stored timer. On debounced fire: set state with source='legend', schedule 300ms source-reset.

      **Consumer pattern** (document at top of file):
      - Chart reads focalDate every render
      - When focalDate changes AND source !== 'chart', update chart visual
      - When source === 'chart', ignore (chart was origin, already updated)
      - Legend symmetric
      - Both components always READ focalDate; only REACT to changes from the other source

      This is what prevents feedback loops. The hook's job is source attribution; consumers implement the loop prevention.

      **Cleanup.** On unmount, clear all pending timeouts.

      Implementation sketch:
      ```typescript
      export function useTimelineSync(initialDate = new Date()) {
        const [state, setState] = useState({ focalDate: initialDate, source: null });
        const sourceTimeoutRef = useRef();
        const legendDebounceRef = useRef();

        const resetSource = () => {
          clearTimeout(sourceTimeoutRef.current);
          sourceTimeoutRef.current = setTimeout(() => {
            setState(s => ({ ...s, source: null }));
          }, 300);
        };

        const setFocalDateFromChart = (date) => {
          setState({ focalDate: date, source: 'chart' });
          resetSource();
        };

        const setFocalDateFromLegend = (date) => {
          clearTimeout(legendDebounceRef.current);
          legendDebounceRef.current = setTimeout(() => {
            setState({ focalDate: date, source: 'legend' });
            resetSource();
          }, 200);
        };

        useEffect(() => () => {
          clearTimeout(sourceTimeoutRef.current);
          clearTimeout(legendDebounceRef.current);
        }, []);

        return { ...state, setFocalDateFromChart, setFocalDateFromLegend };
      }
      ```
    status: pending

  - id: useTimelineSync-tests
    content: |
      Create `src/lib/hooks/use-timeline-sync.test.ts`. Use React Testing Library `renderHook` and `act`.

      Cases:
      - Initial state: focalDate matches initial arg, source=null
      - setFromChart: focalDate updates immediately, source='chart'
      - After 300ms from chart set: source=null
      - Two chart calls in succession: both update focalDate, source stays 'chart', 300ms countdown restarts from latest call
      - setFromLegend: focalDate doesn't update immediately (debounced)
      - After 200ms: focalDate updates, source='legend'
      - Three legend calls within 150ms: only latest date applied after 200ms from last call
      - 300ms after legend update: source=null
      - Chart + legend in mixed interaction: both updates flow through, source accurately tracks latest
      - Unmount with pending timers: no errors, no warnings

      Each case: comment above explaining scenario. Tests document the behavior.
    status: pending

  - id: types-export
    content: |
      Ensure `ProjectionEvent` and related types are exported from a single canonical location (probably `src/lib/engine/keel.ts`). Hook files import types, don't re-define them.

      If `ProjectionEvent` uses Dates internally but ISO strings on the wire, establish the hook contract:
      - Hooks expose Dates (easier for consumers, standard JS pattern)
      - Wire serialization happens at server action boundary, invisible to hook consumers

      Add any missing type exports. No parallel definitions.
    status: pending

  - id: no-visual-regression-check
    content: |
      CRITICAL: this PR must produce zero visual difference in the running app. The existing Timeline screen continues to call `buildProjectionTimeline` with its current arguments (no `startDate`), falling through to preserved default behavior.

      Verification:
      1. Before merging: screenshot the Timeline page
      2. After merging: screenshot the same page
      3. Compare — should be pixel-identical

      If any difference:
      - A default was changed (e.g., startDate default = something other than asOf)
      - Engine behavior changed during refactor (rounding, sorting, skip application)
      
      Either is a regression. Fix before merging.

      The hooks are NOT yet consumed by any component. They sit in the codebase unused, validated by tests. That's expected and correct.
    status: pending

  - id: lint-build-test
    content: |
      Run `npm run lint`, `npm run build`, `npm test`. All pass.

      Manual verification:
      - `/timeline` loads and renders exactly as before
      - Existing tests pass (including any exercising `buildProjectionTimeline`)
      - New tests pass
      - No new TypeScript errors; hooks are fully typed
      - Bundle size impact under 5KB (hooks small, no new deps)

      No new npm packages needed. Pure logic only.
    status: pending

isProject: false
---

# Timeline Foundation — the plan

## What this PR establishes

Three pieces of pure logic, fully tested, with zero visual impact:

1. **Engine parameterization** — `buildProjectionTimeline` accepts optional `startDate`, adds `availableMoneyAt` helper for scrub-frame lookups
2. **useTimelineEvents hook** — manages loaded event window, pre-fetches chunks on focal-date movement, enforces 24-week max, handles debouncing and unmount safety
3. **useTimelineSync hook** — shared `focalDate` state with source tracking to let chart and legend update each other without loops

All consumed by nothing in this PR. The existing Timeline screen works unchanged. This is deliberate — verifies data foundation in isolation before building visual rebuild on top.

## Why this PR exists separately

The full Timeline rebuild has multiple independent risks:
- Data layer: does engine produce correct running balances for arbitrary windows?
- State layer: do hooks handle edge cases, unmounts, debouncing correctly?
- UI layer: does SVG geometry produce right visual at every data density? Does scrub feel right?

Landing together means debugging multiple classes of bugs at once. Splitting data and state off lets you verify each in isolation via tests, then approach visual rebuild knowing foundation is solid.

## Expected code impact

- ~40 lines added to `keel.ts` (new param + `availableMoneyAt`)
- ~60 lines for `loadProjectionChunk` server action
- ~180 lines for `useTimelineEvents` (reducer + hook + types)
- ~50 lines for `useTimelineSync`
- ~350 lines of tests across four test files

Total ~700 lines, heavily test-weighted. Easy to review.

## What lands next

After this merges and production is stable, Timeline Rebuild PR proceeds. That PR consumes these hooks and builds the visual experience.
