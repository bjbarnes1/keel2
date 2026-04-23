/**
 * Tests for {@link validateCitations} — the anti-hallucination gate.
 *
 * Covers path parsing (including array indices), currency-tolerant comparison, and the
 * end-to-end validation result shape.
 *
 * @module lib/ai/context/validate-citations.test
 */

import { describe, expect, it } from "vitest";

import type { ComposedContext } from "./schemas/composed-context";

import {
  approximatelyEqualCurrency,
  CURRENCY_ABSOLUTE_TOLERANCE,
  parseCitationPath,
  resolveByPath,
  validateCitations,
} from "./validate-citations";

function fixtureContext(): ComposedContext {
  return {
    version: "2026.04.v1",
    generatedAt: "2026-04-23T00:00:00.000Z",
    userContext: {
      asOf: "2026-04-23T00:00:00.000Z",
      horizon: { start: "2026-04-23", end: "2027-04-24", days: 366 },
      availableMoney: {
        now: 1842.5,
        projectedMinOverHorizon: -120,
        projectedMinDate: "2026-05-05",
        projectedMaxOverHorizon: 3500,
        projectedMaxDate: "2026-12-15",
        projectedAnnualEndBalance: 2100,
      },
      annualTotals: { income: 120000, commitments: 78000 },
      incomes: [
        {
          id: "inc_1",
          name: "Salary",
          amount: 4600,
          frequency: "fortnightly",
          nextPayDate: "2026-04-25",
          isPrimary: true,
        },
      ],
      commitments: [
        {
          id: "com_1",
          name: "Rent",
          amount: 3042,
          frequency: "fortnightly",
          nextDueDate: "2026-04-28",
          category: "Housing",
          heldTowardNextDue: 2100,
        },
      ],
      goals: [],
      wealth: { totalValue: 15000, accountCount: 0, holdingCount: 2 },
      upcomingEvents: [],
      activeSkips: [],
    },
    learnedPatterns: {
      lastAnalyzedAt: null,
      analysisCoveringFrom: null,
      analysisCoveringTo: null,
      patterns: {
        categoryDrift: [],
        seasonalVariance: [],
        cashflowTendencies: {
          typicalEndOfCycleRemaining: 0,
          variancePctOverLast6Cycles: 0,
          skipCommitmentsPerQuarter: 0,
          confidence: "low",
        },
        meta: { totalTransactionsAnalyzed: 0, analysisVersion: "empty" },
      },
      isEmpty: true,
    },
    structuralAssumptions: {
      version: "2026.04.v1",
      lastComposed: "2026-04-23T00:00:00.000Z",
      economic: {
        version: "2026.04",
        lastReviewed: "2026-04-22",
        reviewIntervalDays: 90,
        nextReviewDue: "2026-07-22",
        cpi: {
          currentAnnualRate: 0.032,
          rbaTarget: [0.02, 0.03],
          fiveYearAssumption: 0.029,
          tenYearAssumption: 0.028,
          source: "RBA",
          confidence: "medium",
        },
        wageGrowth: {
          currentAnnualRate: 0.037,
          fiveYearAssumption: 0.035,
          source: "ABS",
          confidence: "medium",
        },
        interestRates: {
          cashRateCurrent: 0.041,
          mortgageRateCurrent: 0.063,
          mortgageRateFiveYearAssumption: 0.058,
          source: "RBA",
          confidence: "low",
        },
        assetReturns: {
          asx200LongRunAnnualNominal: 0.089,
          asx200LongRunAnnualReal: 0.061,
          cashSavingsAnnual: 0.042,
          bitcoinVolatilityNote: "flag uncertainty",
          source: "ASX",
          confidence: "low",
        },
        propertyAssumptions: {
          nationalFiveYearGrowthAssumption: 0.045,
          propertyGrowthNote: "no projection past 2 years",
          source: "CoreLogic",
          confidence: "very-low",
        },
      },
      tax: {
        version: "FY2026-27",
        effectiveFrom: "2026-07-01",
        effectiveUntil: "2027-06-30",
        individualIncomeTaxBrackets: [{ from: 0, to: 18200, rate: 0, offset: 0 }],
        medicareLevyRate: 0.02,
        medicareLevySurchargeThresholds: { singleBase: 97000, familyBase: 194000, note: "x" },
        superGuaranteeRate: 0.12,
        superContributionCaps: { concessionalAnnual: 30000, nonConcessionalAnnual: 120000 },
        hecsRepaymentThresholds: [{ from: 54435, rate: 0.01 }],
        source: "ATO",
        lastReviewed: "2026-04-22",
        confidence: "high",
      },
      lifeStage: {
        version: "2026.04",
        lastReviewed: "2026-04-22",
        childCosts: {
          childcarePerChildAnnualAverage: 18000,
          childcareEndsAtAge: 5,
          schoolAgeAdditionalAnnual: 3500,
          teenAgeAdditionalAnnual: 4500,
          note: "x",
          confidence: "low",
        },
        retirement: {
          comfortableRetirementCoupleAnnual: 73337,
          modestRetirementCoupleAnnual: 47731,
          comfortableRetirementSingleAnnual: 52085,
          modestRetirementSingleAnnual: 33134,
          source: "ASFA",
          confidence: "medium",
        },
        generalLifeCostShifts: ["placeholder shift"],
      },
    },
  };
}

describe("parseCitationPath", () => {
  it("parses a simple dotted path", () => {
    expect(parseCitationPath("userContext.availableMoney.now")).toEqual([
      "userContext",
      "availableMoney",
      "now",
    ]);
  });

  it("parses paths with array indices", () => {
    expect(parseCitationPath("userContext.commitments[0].amount")).toEqual([
      "userContext",
      "commitments",
      0,
      "amount",
    ]);
  });

  it("rejects empty strings", () => {
    expect(parseCitationPath("")).toBeNull();
  });

  it("rejects paths with gaps", () => {
    expect(parseCitationPath("userContext..now")).toBeNull();
  });

  it("rejects malformed array indices", () => {
    expect(parseCitationPath("commitments[a]")).toBeNull();
  });
});

describe("resolveByPath", () => {
  it("walks nested objects", () => {
    const ctx = fixtureContext();
    expect(resolveByPath(ctx, ["userContext", "availableMoney", "now"])).toBe(1842.5);
  });

  it("walks into arrays by index", () => {
    const ctx = fixtureContext();
    expect(resolveByPath(ctx, ["userContext", "commitments", 0, "name"])).toBe("Rent");
  });

  it("returns undefined for out-of-range indices", () => {
    const ctx = fixtureContext();
    expect(resolveByPath(ctx, ["userContext", "commitments", 99, "name"])).toBeUndefined();
  });

  it("returns undefined for broken paths", () => {
    const ctx = fixtureContext();
    expect(resolveByPath(ctx, ["missing", "field"])).toBeUndefined();
  });
});

describe("approximatelyEqualCurrency", () => {
  it("accepts exact matches", () => {
    expect(approximatelyEqualCurrency(100, 100)).toBe(true);
  });

  it("accepts sub-absolute-tolerance drift", () => {
    expect(approximatelyEqualCurrency(100, 100 + CURRENCY_ABSOLUTE_TOLERANCE - 0.01)).toBe(true);
  });

  it("accepts 1% rounding", () => {
    expect(approximatelyEqualCurrency(3000, 3025)).toBe(true);
  });

  it("rejects >1% drift at scale", () => {
    expect(approximatelyEqualCurrency(3000, 3100)).toBe(false);
  });
});

describe("validateCitations", () => {
  it("passes when citations omit value and point at real fields", () => {
    const ctx = fixtureContext();
    const result = validateCitations(
      [{ fact: "available money", path: "userContext.availableMoney.now" }],
      ctx,
    );
    expect(result.valid).toBe(true);
  });

  it("accepts close-enough currency claims", () => {
    const ctx = fixtureContext();
    const result = validateCitations(
      [{ fact: "rent", path: "userContext.commitments[0].amount", value: 3040 }],
      ctx,
    );
    expect(result.valid).toBe(true);
  });

  it("rejects invented paths", () => {
    const ctx = fixtureContext();
    const result = validateCitations(
      [{ fact: "phantom", path: "userContext.nonsense", value: 0 }],
      ctx,
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors[0]).toContain("does not exist");
  });

  it("rejects value mismatches outside tolerance", () => {
    const ctx = fixtureContext();
    const result = validateCitations(
      [{ fact: "rent lie", path: "userContext.commitments[0].amount", value: 500 }],
      ctx,
    );
    expect(result.valid).toBe(false);
  });

  it("accepts layer C confidence citations", () => {
    const ctx = fixtureContext();
    const result = validateCitations(
      [
        {
          fact: "cpi confidence",
          path: "structuralAssumptions.economic.cpi.confidence",
          value: "medium",
        },
      ],
      ctx,
    );
    expect(result.valid).toBe(true);
  });

  it("short-circuits when no citations provided", () => {
    const ctx = fixtureContext();
    expect(validateCitations(undefined, ctx)).toEqual({ valid: true });
    expect(validateCitations([], ctx)).toEqual({ valid: true });
  });
});
