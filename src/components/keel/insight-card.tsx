"use client";

import { useState, useTransition } from "react";

import { generateInsightAction, type GenerateInsightResult } from "@/app/actions/insight";
import { SurfaceCard } from "@/components/keel/primitives";

function relativeAge(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 1) return "just now";
  if (diffH === 1) return "1 hour ago";
  if (diffH < 24) return `${diffH} hours ago`;
  return "over a day ago";
}

interface InsightCardProps {
  insight: { headline: string; body: string | null; generatedAt: Date } | null;
  aiEnabled: boolean;
}

export function InsightCard({ insight, aiEnabled }: InsightCardProps) {
  const [isPending, startTransition] = useTransition();
  const [live, setLive] = useState<GenerateInsightResult | null>(null);

  const headline = live?.headline ?? insight?.headline;
  const body = live?.body ?? insight?.body;
  const hasInsight = Boolean(headline);
  const errorMsg = live?.ok === false ? live.error : null;

  function handleRefresh() {
    startTransition(async () => {
      const result = await generateInsightAction();
      setLive(result);
    });
  }

  if (!aiEnabled && !hasInsight) return null;

  return (
    <SurfaceCard className="mt-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-sm leading-none text-[color:var(--keel-ink-3)]">
          ✦
        </span>
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--keel-ink-4)]">
            Keel Insight
          </p>
          {isPending ? (
            <p className="text-sm text-[color:var(--keel-ink-3)]">Analysing your finances…</p>
          ) : errorMsg ? (
            <p className="text-sm text-red-500">{errorMsg}</p>
          ) : hasInsight ? (
            <>
              <p className="text-sm font-medium">{headline}</p>
              {body ? (
                <p className="mt-1 text-xs text-[color:var(--keel-ink-3)]">{body}</p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-[color:var(--keel-ink-3)]">
              Tap Generate to get a personalised financial insight.
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        {insight?.generatedAt && !live ? (
          <p className="text-xs text-[color:var(--keel-ink-4)]">
            {relativeAge(insight.generatedAt)}
          </p>
        ) : (
          <span />
        )}
        {aiEnabled ? (
          <button
            onClick={handleRefresh}
            disabled={isPending}
            className="text-xs font-medium text-primary disabled:opacity-40"
          >
            {isPending ? "Generating…" : hasInsight ? "Refresh" : "Generate"}
          </button>
        ) : null}
      </div>
    </SurfaceCard>
  );
}
