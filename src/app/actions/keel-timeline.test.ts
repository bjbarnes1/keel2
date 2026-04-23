/** Vitest: Zod + `buildProjectionChunkFromState` (server action glue, no live DB). */

import { describe, expect, it } from "vitest";

import { loadProjectionChunkInputSchema } from "@/lib/engine/projection-chunk-schema";
import { buildProjectionChunkFromState } from "@/lib/persistence/keel-store";
import type { ActiveSkipsBundle } from "@/lib/persistence/keel-store";
import type { StoredKeelState } from "@/lib/persistence/state";

/**
 * Most of the `loadProjectionChunk` server action is thin glue over `getProjectionEngineInput` +
 * `buildProjectionChunkFromState`. The engine-level chunking behavior is fully tested below
 * against an in-memory seeded state (no Prisma, no Supabase). The auth-enforced full e2e flow
 * is covered implicitly by the existing persistence layer tests and the hook layer that
 * exercises this action.
 */

function makeState(): StoredKeelState {
  return {
    user: {
      id: "u1",
      email: "u@example.com",
      name: "Tester",
      bankBalance: 10_000,
      balanceAsOf: "2026-04-20",
    },
    budget: { id: "b1", name: "Household" },
    primaryIncomeId: "i1",
    incomes: [
      {
        id: "i1",
        name: "Salary",
        amount: 4_200,
        frequency: "fortnightly",
        nextPayDate: "2026-04-24",
        isPrimary: true,
      },
    ],
    commitments: [
      {
        id: "c-rent",
        name: "Rent",
        amount: 1_800,
        frequency: "monthly",
        nextDueDate: "2026-05-01",
        categoryId: "cat-home",
        category: "Home",
        fundedByIncomeId: "i1",
      },
      {
        id: "c-power",
        name: "Power",
        amount: 250,
        frequency: "monthly",
        nextDueDate: "2026-05-10",
        categoryId: "cat-util",
        category: "Utilities",
        fundedByIncomeId: "i1",
      },
    ],
    goals: [],
  };
}

const emptySkips: ActiveSkipsBundle = { commitmentSkips: [], goalSkips: [], incomeSkips: [] };

describe("loadProjectionChunk validation", () => {
  // Valid payload — passes through untouched.
  it("accepts a well-formed payload", () => {
    expect(
      loadProjectionChunkInputSchema.parse({
        startDateIso: "2026-04-20",
        horizonDays: 28,
      }),
    ).toEqual({ startDateIso: "2026-04-20", horizonDays: 28 });
  });

  // Malformed date is rejected before reaching persistence.
  it("rejects non-ISO date formats", () => {
    expect(() =>
      loadProjectionChunkInputSchema.parse({
        startDateIso: "04/20/2026",
        horizonDays: 28,
      }),
    ).toThrow();
  });

  // Horizon above the 200-day safety valve is rejected.
  it("rejects horizonDays above 200", () => {
    expect(() =>
      loadProjectionChunkInputSchema.parse({
        startDateIso: "2026-04-20",
        horizonDays: 300,
      }),
    ).toThrow();
  });

  // Horizon of 0 is rejected (minimum is 1).
  it("rejects horizonDays of 0 or less", () => {
    expect(() =>
      loadProjectionChunkInputSchema.parse({
        startDateIso: "2026-04-20",
        horizonDays: 0,
      }),
    ).toThrow();
  });

  // Non-integer horizons are rejected (must be whole days).
  it("rejects non-integer horizonDays", () => {
    expect(() =>
      loadProjectionChunkInputSchema.parse({
        startDateIso: "2026-04-20",
        horizonDays: 14.5,
      }),
    ).toThrow();
  });
});

describe("buildProjectionChunkFromState", () => {
  const asOf = new Date("2026-04-20T00:00:00Z");

  // Baseline chunk — 28 days from today returns the expected mix of income + bill events.
  it("loads a 28-day chunk starting today with the right event mix", () => {
    const events = buildProjectionChunkFromState({
      state: makeState(),
      activeSkips: emptySkips,
      asOf,
      startDateIso: "2026-04-20",
      horizonDays: 28,
    });

    expect(events.length).toBeGreaterThan(0);
    expect(events.some((event) => event.type === "income" && event.label === "Salary")).toBe(true);
    expect(events.some((event) => event.type === "bill" && event.label === "Rent")).toBe(true);
    for (const event of events) {
      expect(event.date >= "2026-04-20").toBe(true);
      expect(event.date <= "2026-05-18").toBe(true);
    }
  });

  // Future chunk — load days 60-88 from today. Running balance must reflect events
  // from the skipped first 60 days; the first returned event is NOT the starting floor.
  it("loads a chunk starting 60 days out with a warmed-up running balance", () => {
    const state = makeState();
    const fullWindow = buildProjectionChunkFromState({
      state,
      activeSkips: emptySkips,
      asOf,
      startDateIso: "2026-04-20",
      horizonDays: 120,
    });

    const chunk = buildProjectionChunkFromState({
      state,
      activeSkips: emptySkips,
      asOf,
      startDateIso: "2026-06-19", // asOf + 60 days
      horizonDays: 28,
    });

    expect(chunk.length).toBeGreaterThan(0);

    const byId = new Map(fullWindow.map((event) => [event.id, event.projectedAvailableMoney]));
    for (const event of chunk) {
      expect(event.date >= "2026-06-19").toBe(true);
      expect(event.date <= "2026-07-17").toBe(true);
      expect(event.projectedAvailableMoney).toBe(byId.get(event.id));
    }
  });

  // Narrow window — 4 days returns only events within that slice (smoke test for filtering).
  it("respects a narrow 4-day window", () => {
    const events = buildProjectionChunkFromState({
      state: makeState(),
      activeSkips: emptySkips,
      asOf,
      startDateIso: "2026-04-22",
      horizonDays: 4,
    });

    for (const event of events) {
      expect(event.date >= "2026-04-22").toBe(true);
      expect(event.date <= "2026-04-26").toBe(true);
    }
  });

  // Commitment skip inside the window — cashflow reflects the skip (MAKE_UP_NEXT shifts the
  // skipped amount to the next occurrence, dropping this one's balance hit).
  it("applies active MAKE_UP_NEXT skips within the window", () => {
    const state = makeState();

    const baseline = buildProjectionChunkFromState({
      state,
      activeSkips: emptySkips,
      asOf,
      startDateIso: "2026-04-20",
      horizonDays: 120,
    });

    const withSkip = buildProjectionChunkFromState({
      state,
      activeSkips: {
        commitmentSkips: [
          {
            skipId: "s-1",
            kind: "commitment",
            commitmentId: "c-rent",
            originalDateIso: "2026-05-01",
            strategy: "MAKE_UP_NEXT",
          },
        ],
        goalSkips: [],
        incomeSkips: [],
      },
      asOf,
      startDateIso: "2026-04-20",
      horizonDays: 120,
    });

    const baselineRentMay = baseline.find(
      (event) => event.label === "Rent" && event.date === "2026-05-01",
    );
    const skippedRentMay = withSkip.find(
      (event) => event.label === "Rent" && event.date === "2026-05-01",
    );

    expect(baselineRentMay).toBeDefined();
    expect(skippedRentMay).toBeDefined();
    // Skipping makes available money strictly higher at the original due date (no outflow).
    expect(skippedRentMay!.projectedAvailableMoney).toBeGreaterThan(
      baselineRentMay!.projectedAvailableMoney,
    );
  });

  // Empty state — no incomes or commitments returns an empty window without crashing.
  it("returns an empty array for a state with no incomes or commitments", () => {
    const state: StoredKeelState = {
      ...makeState(),
      incomes: [],
      commitments: [],
    };
    const events = buildProjectionChunkFromState({
      state,
      activeSkips: emptySkips,
      asOf,
      startDateIso: "2026-04-20",
      horizonDays: 28,
    });
    expect(events).toEqual([]);
  });
});
