import { formatNumber } from '@/lib/web-analytics/labels';

type BreakdownSectionProps = {
  title: string;
  items: Array<{ label: string; count: number }>;
};

function BreakdownSection({ title, items }: BreakdownSectionProps) {
  return (
    <section className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-[#36606F]">
        {title}
      </h2>
      {items.length === 0 ? (
        <p className="text-xs text-zinc-500">Sin datos todavía.</p>
      ) : (
        <div className="divide-y divide-zinc-100">
          {items.map((item) => (
            <div key={`${title}-${item.label}`} className="flex min-h-10 items-center gap-2 py-2 text-xs">
              <p className="min-w-0 flex-1 truncate font-medium text-zinc-800">{item.label}</p>
              <p className="shrink-0 tabular-nums text-zinc-500">{formatNumber(item.count)}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

type WebAnalyticsBreakdownProps = {
  topPages: Array<{ label: string; count: number }>;
  topReferrers: Array<{ label: string; count: number }>;
  topDevices: Array<{ label: string; count: number }>;
  topSources: Array<{ label: string; count: number }>;
  topLocales: Array<{ label: string; count: number }>;
};

export function WebAnalyticsBreakdown({
  topPages,
  topReferrers,
  topDevices,
  topSources,
  topLocales,
}: WebAnalyticsBreakdownProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <BreakdownSection title="Páginas más vistas" items={topPages} />
      <BreakdownSection title="Origen del tráfico" items={topReferrers} />
      <BreakdownSection title="Dispositivos" items={topDevices} />
      <BreakdownSection title="UTM source" items={topSources} />
      <BreakdownSection title="Idioma" items={topLocales} />
    </div>
  );
}
