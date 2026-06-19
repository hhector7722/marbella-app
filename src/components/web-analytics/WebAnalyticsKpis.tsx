import { formatDurationMs, formatNumber } from '@/lib/web-analytics/labels';
import type { WebAnalyticsDashboardData } from '@/lib/web-analytics/types';

type WebAnalyticsKpisProps = {
  totals: WebAnalyticsDashboardData['totals'];
};

function KpiCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 text-center">
      <p className="truncate text-lg font-black tabular-nums text-zinc-900">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{label}</p>
    </div>
  );
}

export function WebAnalyticsKpis({ totals }: WebAnalyticsKpisProps) {
  return (
    <section className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-[#36606F]">
        Resumen
      </h2>
      <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
        <KpiCell label="Visitantes" value={formatNumber(totals.visitors)} />
        <KpiCell label="Sesiones" value={formatNumber(totals.sessions)} />
        <KpiCell label="Páginas" value={formatNumber(totals.pageViews)} />
        <KpiCell label="Clics" value={formatNumber(totals.clicks)} />
        <KpiCell label="Acciones" value={formatNumber(totals.actions)} />
        <KpiCell label="Tiempo medio" value={formatDurationMs(totals.avgSessionMs)} />
      </div>
    </section>
  );
}
