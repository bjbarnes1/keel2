/**
 * Budget dashboard presentation layer inspired by the new card-based design.
 *
 * This module is intentionally view-only: route handlers compose/prepare data and
 * pass serializable view models into these components.
 *
 * @module components/keel/budget/budget-dashboard
 */

import Link from "next/link";
import { CircleDollarSign, GraduationCap, HeartPulse, Home, Sparkles } from "lucide-react";

import {
  InsightTile,
  MetricStatCard,
  ProgressMeter,
  SectionTitle,
  SurfaceCard,
} from "@/components/keel/primitives";
import { formatAud, sentenceCaseFrequency } from "@/lib/utils";

export type BudgetCommitmentItemModel = {
  id: string;
  name: string;
  amount: number;
  monthlyEquivalent: number;
  frequency: string;
  progressValue: number;
  progressMax: number;
};

export type BudgetSubcategoryModel = {
  id: string;
  name: string;
  monthlyTotal: number;
  commitments: BudgetCommitmentItemModel[];
};

export type BudgetCategoryCardModel = {
  id: string;
  name: string;
  monthlyTotal: number;
  planned: number;
  actual: number;
  progressValue: number;
  progressMax: number;
  subcategories: BudgetSubcategoryModel[];
  uncategorisedCommitments: BudgetCommitmentItemModel[];
  commitmentCount: number;
};

export type BudgetInsightModel = {
  title: string;
  body: string;
  tone?: "safe" | "attend" | "accent";
};

export type BudgetVsActualCardModel = {
  id: string;
  name: string;
  planned: number;
  actual: number;
  variance: number;
};

export type BudgetDashboardModel = {
  monthLabel: string;
  statCards: Array<{
    label: string;
    value: string;
    hint?: string;
    tone?: "safe" | "attend" | "accent";
    progress?: { value: number; max: number };
  }>;
  categories: BudgetCategoryCardModel[];
  insights: BudgetInsightModel[];
  budgetVsActual: BudgetVsActualCardModel[];
};

function categoryVisual(name: string): {
  tone: "safe" | "attend" | "accent";
  Icon: typeof Home;
} {
  const lower = name.toLowerCase();
  if (lower.includes("home") || lower.includes("house")) return { tone: "accent", Icon: Home };
  if (lower.includes("health") || lower.includes("medical")) return { tone: "safe", Icon: HeartPulse };
  if (lower.includes("school") || lower.includes("education")) {
    return { tone: "attend", Icon: GraduationCap };
  }
  return { tone: "accent", Icon: CircleDollarSign };
}

function toneClasses(tone: "safe" | "attend" | "accent") {
  if (tone === "attend") {
    return {
      chip: "bg-[color:color-mix(in_oklab,var(--keel-attend),transparent_80%)] text-[color:var(--keel-attend)]",
      icon: "bg-[color:color-mix(in_oklab,var(--keel-attend),transparent_82%)] text-[color:var(--keel-attend)]",
    };
  }
  if (tone === "accent") {
    return {
      chip: "bg-[color:color-mix(in_oklab,var(--color-accent),transparent_84%)] text-primary",
      icon: "bg-[color:color-mix(in_oklab,var(--color-accent),transparent_84%)] text-primary",
    };
  }
  return {
    chip: "bg-[color:color-mix(in_oklab,var(--keel-safe),transparent_82%)] text-[color:var(--keel-safe)]",
    icon: "bg-[color:color-mix(in_oklab,var(--keel-safe),transparent_82%)] text-[color:var(--keel-safe)]",
  };
}

function CommitmentRow({
  item,
  tone,
}: {
  item: BudgetCommitmentItemModel;
  tone: "safe" | "attend" | "accent";
}) {
  return (
    <Link
      href={`/commitments/${item.id}`}
      className="block rounded-[var(--radius-xxs)] px-3 py-2 transition-colors hover:bg-[color:color-mix(in_oklab,var(--keel-ink),transparent_95%)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[color:var(--keel-ink)]">{item.name}</p>
          <p className="text-[11px] text-[color:var(--keel-ink-4)]">
            {sentenceCaseFrequency(item.frequency)} · {formatAud(item.amount)}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-xs tabular-nums text-[color:var(--keel-ink)]">
            {formatAud(item.monthlyEquivalent)}/mo
          </p>
        </div>
      </div>
      <ProgressMeter value={item.progressValue} max={item.progressMax} tone={tone} className="mt-2" />
    </Link>
  );
}

function CategoryCard({ category }: { category: BudgetCategoryCardModel }) {
  const visual = categoryVisual(category.name);
  const styles = toneClasses(visual.tone);
  const spentPct =
    category.planned > 0
      ? Math.min(Math.max((category.actual / category.planned) * 100, 0), 999)
      : 0;

  return (
    <SurfaceCard className="p-0 overflow-hidden">
      <div className="flex items-start justify-between gap-4 px-4 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${styles.icon}`}>
            <visual.Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-[color:var(--keel-ink)]">{category.name}</p>
            <p className="mt-1 text-xs text-[color:var(--keel-ink-4)]">
              {category.commitmentCount} commitments
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-sm font-semibold tabular-nums text-[color:var(--keel-ink)]">
            {formatAud(category.actual)} of {formatAud(category.planned)}
          </p>
          <p className="mt-1 text-[11px] text-[color:var(--keel-ink-4)]">{Math.round(spentPct)}% spent</p>
        </div>
      </div>

      <div className="px-4 pb-3">
        <ProgressMeter value={category.progressValue} max={category.progressMax} tone={visual.tone} />
      </div>

      {category.subcategories.length > 0 ? (
        <div className="border-t border-[color:color-mix(in_oklab,var(--keel-ink),transparent_92%)] px-4 py-3">
          <div className="space-y-3">
            {category.subcategories.map((sub) => (
              <div key={sub.id}>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--keel-ink-5)]">
                    {sub.name}
                  </p>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold tabular-nums ${styles.chip}`}>
                    {formatAud(sub.monthlyTotal)}/mo
                  </span>
                </div>
                <div className="space-y-1">
                  {sub.commitments.map((item) => (
                    <CommitmentRow key={item.id} item={item} tone={visual.tone} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {category.uncategorisedCommitments.length > 0 ? (
        <div className="border-t border-[color:color-mix(in_oklab,var(--keel-ink),transparent_92%)] px-4 py-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[color:var(--keel-ink-5)]">
            Uncategorised
          </p>
          <div className="space-y-1">
            {category.uncategorisedCommitments.map((item) => (
              <CommitmentRow key={item.id} item={item} tone={visual.tone} />
            ))}
          </div>
        </div>
      ) : null}
    </SurfaceCard>
  );
}

function BudgetVsActualCard({ item }: { item: BudgetVsActualCardModel }) {
  const tone: "safe" | "attend" = item.variance >= 0 ? "safe" : "attend";
  const styles = toneClasses(tone);
  return (
    <SurfaceCard>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[color:var(--keel-ink)]">{item.name}</p>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${styles.chip}`}>
          {item.variance >= 0 ? "Under plan" : "Over plan"}
        </span>
      </div>
      <div className="mt-3 space-y-1.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[color:var(--keel-ink-4)]">Planned</span>
          <span className="font-mono tabular-nums text-[color:var(--keel-ink)]">{formatAud(item.planned)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[color:var(--keel-ink-4)]">Actual</span>
          <span className="font-mono tabular-nums text-[color:var(--keel-ink)]">{formatAud(item.actual)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[color:var(--keel-ink-4)]">Variance</span>
          <span
            className={
              tone === "safe"
                ? "font-mono tabular-nums text-[color:var(--keel-safe)]"
                : "font-mono tabular-nums text-[color:var(--keel-attend)]"
            }
          >
            {formatAud(item.variance)}
          </span>
        </div>
      </div>
    </SurfaceCard>
  );
}

export function BudgetDashboard({ model }: { model: BudgetDashboardModel }) {
  return (
    <div className="space-y-6">
      <SurfaceCard className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-[color:var(--keel-ink)]">Monthly Plan</p>
            <p className="mt-1 text-xs text-[color:var(--keel-ink-4)]">{model.monthLabel}</p>
          </div>
          <span className="keel-chip px-3 py-1 text-xs text-[color:var(--keel-ink-3)]">
            Inspired budget cockpit
          </span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {model.statCards.map((card) => (
            <MetricStatCard
              key={card.label}
              label={card.label}
              value={card.value}
              hint={card.hint}
              tone={card.tone}
              progress={card.progress}
            />
          ))}
        </div>
      </SurfaceCard>

      <section>
        <SectionTitle title="Budget Categories" />
        <p className="-mt-2 mb-3 text-xs text-[color:var(--keel-ink-4)]">
          Track your planned commitments and monthly progress by category.
        </p>
        {model.categories.length > 0 ? (
          <div className="space-y-3">
            {model.categories.map((category) => (
              <CategoryCard key={category.id} category={category} />
            ))}
          </div>
        ) : (
          <SurfaceCard>
            <p className="text-sm font-semibold text-[color:var(--keel-ink)]">No categories yet</p>
            <p className="mt-1 text-xs text-[color:var(--keel-ink-4)]">
              Add commitments from Home or Commitments to generate your monthly budget structure.
            </p>
          </SurfaceCard>
        )}
      </section>

      <section>
        <SectionTitle title="Financial Insights" />
        <div className="grid gap-3 md:grid-cols-3">
          {model.insights.map((insight) => (
            <InsightTile
              key={insight.title}
              title={insight.title}
              body={insight.body}
              tone={insight.tone}
            />
          ))}
        </div>
      </section>

      <section>
        <SectionTitle title="Budget vs Actual" />
        <div className="grid gap-3 md:grid-cols-3">
          {model.budgetVsActual.length > 0 ? (
            model.budgetVsActual.map((item) => <BudgetVsActualCard key={item.id} item={item} />)
          ) : (
            <SurfaceCard className="md:col-span-3">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[color:color-mix(in_oklab,var(--color-accent),transparent_85%)] text-primary">
                  <Sparkles className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[color:var(--keel-ink)]">
                    Budget vs Actual appears when spend data is connected
                  </p>
                  <p className="mt-1 text-xs text-[color:var(--keel-ink-4)]">
                    Link spend accounts or import transactions to compare real spending against this monthly plan.
                  </p>
                </div>
              </div>
            </SurfaceCard>
          )}
        </div>
      </section>
    </div>
  );
}
