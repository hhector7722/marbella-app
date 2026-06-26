'use client';

import { useMemo } from 'react';

interface ActivityItem {
  activityName: string;
  activityIcon: string | null;
  startTime: string;
  endTime: string;
  venueCodes: string[];
}

interface Props {
  activities: ActivityItem[];
}

const VENUE_ORDER = ['P1', 'P2', 'P3', 'P4'];

function hourNum(s: string) {
  const parts = s.split(':');
  return parseInt(parts[0] ?? '0', 10) + parseInt(parts[1] ?? '0', 10) / 60;
}

export function ActivitiesTab({ activities }: Props) {
  const venues = useMemo(() => {
    const codes = new Set<string>();
    for (const a of activities) {
      for (const v of a.venueCodes) codes.add(v);
    }
    return VENUE_ORDER.filter((v) => codes.has(v));
  }, [activities]);

  const grid = useMemo(() => {
    const minH = Math.floor(Math.min(...activities.map((a) => hourNum(a.startTime))));
    const maxH = Math.ceil(Math.max(...activities.map((a) => hourNum(a.endTime))));
    const hours: number[] = [];
    for (let h = minH; h < maxH; h++) hours.push(h);

    const rows: { hour: number; cells: Record<string, ActivityItem[]> }[] = hours.map((h) => ({
      hour: h,
      cells: Object.fromEntries(venues.map((v) => [v, [] as ActivityItem[]])),
    }));

    for (const act of activities) {
      const startH = Math.floor(hourNum(act.startTime));
      const endH = Math.ceil(hourNum(act.endTime));
      for (let h = startH; h < endH; h++) {
        const row = rows.find((r) => r.hour === h);
        if (!row) continue;
        for (const v of act.venueCodes) {
          if (venues.includes(v)) {
            row.cells[v]?.push(act);
          }
        }
      }
    }

    return { hours, rows };
  }, [activities, venues]);

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <span className="text-2xl mb-2">{'\uD83C\uDF1E'}</span>
        <p className="text-sm font-black text-zinc-500">
          No hi ha activitats que afectin el bar avui
        </p>
        <p className="mt-1 text-xs font-bold text-zinc-400">
          Totes les activitats s\u00F3n en espais sense impacte al bar
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto px-3 py-4">
      <table className="w-full min-w-[420px] border-collapse">
        <thead>
          <tr>
            <th className="w-14 min-w-[56px] border-b-2 border-[#36606F] pb-2 pr-2 text-left text-[9px] font-black uppercase tracking-wider text-zinc-400">
              Hora
            </th>
            {venues.map((v) => (
              <th
                key={v}
                className="border-b-2 border-[#36606F] pb-2 px-1 text-center text-[9px] font-black uppercase tracking-wider text-[#36606F]"
              >
                {v}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((row) => {
            const startLabel = `${String(row.hour).padStart(2, '0')}:00`;
            const hasAny = Object.values(row.cells).some((c) => c.length > 0);
            return (
              <tr key={row.hour} className="group">
                <td
                  className={cn(
                    'py-2 pr-2 align-top text-[10px] font-black leading-tight tabular-nums',
                    hasAny ? 'text-zinc-700' : 'text-zinc-200',
                  )}
                >
                  {startLabel}
                </td>
                {venues.map((v) => {
                  const acts = row.cells[v] ?? [];
                  if (acts.length === 0) {
                    return (
                      <td key={v} className="px-1 py-2 align-top border-b border-zinc-100">
                        <span className="block h-5" />
                      </td>
                    );
                  }
                  return (
                    <td key={v} className="px-1 py-2 align-top border-b border-zinc-100">
                      {acts.map((act, i) => (
                        <div key={i} className="flex flex-col leading-tight mb-1 last:mb-0">
                          <div className="flex items-center gap-0.5">
                            <span className="shrink-0 text-[11px]">{act.activityIcon || '\u25CB'}</span>
                            <span className="text-[9px] font-bold text-zinc-800">{act.activityName}</span>
                          </div>
                          <span className="pl-[18px] text-[8px] font-semibold text-zinc-400 tracking-tight">
                            {act.startTime.slice(0, 5)}\u2013{act.endTime.slice(0, 5)}
                          </span>
                        </div>
                      ))}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}
