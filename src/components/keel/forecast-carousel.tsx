"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { ForecastHorizon } from "@/lib/persistence/keel-store";
import { cn, formatAud } from "@/lib/utils";
import { Sparkline } from "@/components/keel/sparkline";

function tone(value: number) {
  return value > 500 ? "healthy" : value > 0 ? "tight" : "danger";
}

function toneClass(value: number) {
  const state = tone(value);
  if (state === "healthy") return "text-primary";
  if (state === "tight") return "text-[color:var(--color-attention)]";
  return "text-muted-foreground";
}

export function ForecastCarousel({
  horizons,
}: {
  horizons: Array<{ label: string; horizon: ForecastHorizon }>;
}) {
  const cards = useMemo(() => horizons, [horizons]);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    function updateActive(scrollerEl: HTMLDivElement) {
      const children = Array.from(scrollerEl.children) as HTMLElement[];
      if (children.length === 0) {
        setActiveIndex(0);
        return;
      }

      const scrollerRect = scrollerEl.getBoundingClientRect();
      const center = scrollerRect.left + scrollerRect.width / 2;

      let bestIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      children.forEach((child, index) => {
        const rect = child.getBoundingClientRect();
        const childCenter = rect.left + rect.width / 2;
        const distance = Math.abs(childCenter - center);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });

      setActiveIndex(bestIndex);
    }

    const onScroll = () => updateActive(el);
    const onResize = () => updateActive(el);

    updateActive(el);
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [cards.length]);

  function scrollToIndex(index: number) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const children = Array.from(scroller.children) as HTMLElement[];
    const target = children[index];
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  }

  return (
    <div className="mt-6">
      <div
        ref={scrollerRef}
        className="hide-scrollbar flex gap-3 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch] [scroll-snap-type:x_mandatory]"
      >
        {cards.map(({ label, horizon }) => (
          <div
            key={label}
            className="w-[85%] shrink-0 scroll-mx-5 [scroll-snap-align:start]"
          >
            <div className="glass-clear space-y-3 rounded-[var(--radius-lg)] p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="label-upper">{label}</p>
                <Sparkline
                  values={horizon.sparkline}
                  className="h-7 w-32"
                  strokeClassName={cn(toneClass(horizon.minProjectedAvailableMoney), "opacity-80")}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] text-muted-foreground">Min</p>
                  <p
                    className={cn(
                      "tabular-nums font-mono text-sm font-medium",
                      toneClass(horizon.minProjectedAvailableMoney),
                    )}
                  >
                    {formatAud(horizon.minProjectedAvailableMoney)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">End</p>
                  <p
                    className={cn(
                      "tabular-nums font-mono text-sm font-medium",
                      toneClass(horizon.endProjectedAvailableMoney),
                    )}
                  >
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

      <div className="mt-2 flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          Swipe to switch periods.
        </p>
        <div className="flex items-center gap-2">
          {cards.map((card, index) => (
            <button
              key={`dot-${card.label}`}
              type="button"
              onClick={() => scrollToIndex(index)}
              className={cn(
                "h-1.5 w-1.5 rounded-full transition-opacity",
                index === activeIndex ? "bg-primary opacity-100" : "bg-muted-foreground opacity-40",
              )}
              aria-label={`Show ${card.label} forecast`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

