"use client";

import { useMemo } from "react";

import type { ForecastHorizon } from "@/lib/persistence/keel-store";
import { cn, formatAud } from "@/lib/utils";
import { Sparkline } from "@/components/keel/sparkline";

function tone(value: number) {
  return value > 500 ? "healthy" : value > 0 ? "tight" : "danger";
}

function toneClass(value: number) {
  const state = tone(value);
  if (state === "healthy") return "text-emerald-500";
  if (state === "tight") return "text-amber-500";
  return "text-red-500";
}

export function ForecastCarousel({
  horizons,
}: {
  horizons: Array<{ label: string; horizon: ForecastHorizon }>;
}) {
  const cards = useMemo(() => horizons, [horizons]);

  return (
    <div className="mt-6">
      <div className="flex gap-3 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch] [scroll-snap-type:x_mandatory]">
        {cards.map(({ label, horizon }) => (
          <div
            key={label}
            className="w-[85%] shrink-0 scroll-mx-5 [scroll-snap-align:start]"
          >
            <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-semibold text-muted-foreground">{label}</p>
                <Sparkline
                  values={horizon.sparkline}
                  className="h-7 w-32"
                  strokeClassName={cn(toneClass(horizon.minProjectedAvailableMoney), "opacity-80")}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] text-muted-foreground">Min</p>
                  <p className={cn("font-mono text-sm font-semibold", toneClass(horizon.minProjectedAvailableMoney))}>
                    {formatAud(horizon.minProjectedAvailableMoney)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">End</p>
                  <p className={cn("font-mono text-sm font-semibold", toneClass(horizon.endProjectedAvailableMoney))}>
                    {formatAud(horizon.endProjectedAvailableMoney)}
                  </p>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground">
                {horizon.incomeEvents} income events · {horizon.billEvents} bill events
              </p>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-1 text-[11px] text-muted-foreground">
        Swipe to switch periods.
      </p>
    </div>
  );
}

