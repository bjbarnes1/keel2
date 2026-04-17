import { AppShell, ProjectionRow, SurfaceCard } from "@/components/keel/primitives";
import { getDashboardSnapshot } from "@/lib/persistence/keel-store";
import { formatAud } from "@/lib/utils";

export const dynamic = "force-dynamic";

function tone(value: number) {
  return value > 500 ? "healthy" : value > 0 ? "tight" : "danger";
}

function toneClass(value: number) {
  const state = tone(value);
  if (state === "healthy") return "text-emerald-500";
  if (state === "tight") return "text-amber-500";
  return "text-red-500";
}

export default async function TimelinePage() {
  const snapshot = await getDashboardSnapshot();

  const minProjected = Math.min(
    ...snapshot.timeline.map((event) => event.projectedAvailableMoney ?? 0),
  );

  return (
    <AppShell title="Timeline" currentPath="/timeline">
      {minProjected < 500 ? (
        <SurfaceCard className="border-amber-500/30 bg-amber-500/10">
          <p className="text-sm font-semibold text-amber-500">Heads up</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {snapshot.alert}
          </p>
        </SurfaceCard>
      ) : null}

      <div className="mt-6 grid grid-cols-3 gap-2">
        {[
          { label: "1M", horizon: snapshot.forecast.oneMonth },
          { label: "3M", horizon: snapshot.forecast.threeMonths },
          { label: "12M", horizon: snapshot.forecast.twelveMonths },
        ].map(({ label, horizon }) => (
          <SurfaceCard key={label} className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">{label}</p>
            <div>
              <p className="text-[11px] text-muted-foreground">Min</p>
              <p className={`font-mono text-sm font-semibold ${toneClass(horizon.minProjectedAvailableMoney)}`}>
                {formatAud(horizon.minProjectedAvailableMoney)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">End</p>
              <p className={`font-mono text-sm font-semibold ${toneClass(horizon.endProjectedAvailableMoney)}`}>
                {formatAud(horizon.endProjectedAvailableMoney)}
              </p>
            </div>
          </SurfaceCard>
        ))}
      </div>

      <p className="mb-4 mt-6 text-sm text-muted-foreground">
        Next 60 days · based on your current commitments
      </p>

      <div>
        {snapshot.timeline.map((event) => (
          <ProjectionRow key={event.id} event={event} />
        ))}
      </div>
    </AppShell>
  );
}
