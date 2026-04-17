import { ForecastCarousel } from "@/components/keel/forecast-carousel";
import { AppShell, ProjectionRow, SurfaceCard } from "@/components/keel/primitives";
import { getDashboardSnapshot } from "@/lib/persistence/keel-store";

export const dynamic = "force-dynamic";

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

      <ForecastCarousel
        horizons={[
          { label: "1M", horizon: snapshot.forecast.oneMonth },
          { label: "3M", horizon: snapshot.forecast.threeMonths },
          { label: "12M", horizon: snapshot.forecast.twelveMonths },
        ]}
      />

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
