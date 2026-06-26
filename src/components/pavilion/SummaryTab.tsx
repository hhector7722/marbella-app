interface Props {
  totalActivities: number;
  barActivities: number;
  uniqueVenues: number;
  peakHour: string;
  peakCount: number;
  venueUsage: { code: string; hours: number }[];
  hourlyBreakdown: { hour: string; count: number }[];
}

export function SummaryTab({
  totalActivities,
  barActivities,
  uniqueVenues,
  peakHour,
  peakCount,
  venueUsage,
  hourlyBreakdown,
}: Props) {
  return (
    <div className="space-y-4 px-4 py-4">
      <div className="grid grid-cols-2 gap-3">
        <MetricCard label="Activitats (total)" value={totalActivities} />
        <MetricCard label="Activitats (bar)" value={barActivities} highlight />
        <MetricCard label="Espais diferents" value={uniqueVenues} />
        <MetricCard
          label="Hora punta"
          value={`${peakHour}`}
          subtitle={`${peakCount} act.`}
        />
      </div>

      {hourlyBreakdown.length > 0 && (
        <Section title="Activitat per franges">
          <div className="space-y-1.5">
            {hourlyBreakdown.map((h) => {
              const isMax = h.count === peakCount;
              return (
                <div
                  key={h.hour}
                  className="flex items-center gap-3 text-xs"
                >
                  <span className="w-20 shrink-0 font-black text-zinc-500">
                    {h.hour}
                  </span>
                  <div className="flex h-5 flex-1 overflow-hidden rounded-md bg-zinc-100">
                    <div
                      className={`rounded-md transition-all ${
                        isMax ? 'bg-[#36606F]' : 'bg-zinc-300'
                      }`}
                      style={{
                        width: `${peakCount > 0 ? (h.count / peakCount) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <span
                    className={`w-6 shrink-0 text-right font-black ${
                      isMax ? 'text-[#36606F]' : 'text-zinc-400'
                    }`}
                  >
                    {h.count}
                  </span>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {venueUsage.length > 0 && (
        <Section title="Espais més usats (bar)">
          <div className="space-y-1.5">
            {venueUsage.map((v) => (
              <div key={v.code} className="flex items-center gap-3 text-xs">
                <span className="w-16 shrink-0 font-black text-zinc-500 uppercase">
                  {v.code}
                </span>
                <div className="flex h-5 flex-1 overflow-hidden rounded-md bg-zinc-100">
                  <div
                    className="rounded-md bg-amber-500"
                    style={{
                      width: `${Math.min(100, (v.hours / 8) * 100)}%`,
                    }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right font-black text-zinc-400">
                  {v.hours}h
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  highlight,
  subtitle,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
  subtitle?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-100 bg-white px-3 py-3 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
        {label}
      </p>
      <p
        className={`mt-0.5 text-lg font-black ${
          highlight ? 'text-[#36606F]' : 'text-zinc-900'
        }`}
      >
        {value}
      </p>
      {subtitle && (
        <p className="text-[10px] font-bold text-zinc-400">{subtitle}</p>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 text-[11px] font-black uppercase tracking-wider text-zinc-400">
        {title}
      </h4>
      {children}
    </div>
  );
}
