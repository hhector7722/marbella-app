'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';

interface ActivityItem {
  activityName: string;
  activityIcon: string | null;
  activityColor?: string | null;
  startTime: string;
  endTime: string;
  formStartTime?: string | null;
  formEndTime?: string | null;
  totalParticipants?: number | null;
  categories?: string[];
  venueCodes: string[];
}

interface Props {
  activities: ActivityItem[];
  date?: string | null;
  isHector?: boolean;
}

const VENUE_ORDER = ['P1', 'P2', 'P3', 'P4'];



function hourNum(s: string) {
  const parts = s.split(':');
  return parseInt(parts[0] ?? '0', 10) + parseInt(parts[1] ?? '0', 10) / 60;
}

function fmtHour(time: string): string {
  const parts = time.split(':');
  if (parts.length < 2) return time;
  return `${parseInt(parts[0], 10)}:${parts[1]}`;
}

function isSameActivityBlock(a: ActivityItem | null, b: ActivityItem | null) {
  if (!a || !b) return false;
  return a.activityName.trim().toLowerCase() === b.activityName.trim().toLowerCase() &&
         a.startTime === b.startTime &&
         a.endTime === b.endTime;
}

function stringToHslColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  // Use a fixed saturation and lightness that is pleasant and colorful
  return `hsl(${h}, 70%, 55%)`;
}

function getContrastForHsl(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  
  const l = 0.55;
  const s = 0.70;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  
  const r255 = Math.round((r + m) * 255);
  const g255 = Math.round((g + m) * 255);
  const b255 = Math.round((b + m) * 255);
  
  const yiq = ((r255 * 299) + (g255 * 587) + (b255 * 114)) / 1000;
  return (yiq >= 135) ? '#000000' : '#ffffff';
}

const ROW_H = 28;

export function ActivitiesTab({ activities, date, isHector }: Props) {
  const router = useRouter();

  const venues = useMemo(() => {
    const codes = new Set<string>();
    for (const a of activities) {
      for (const v of a.venueCodes) codes.add(v);
    }
    return VENUE_ORDER.filter((v) => codes.has(v));
  }, [activities]);

  const { hours, grid, hasAnyActivity } = useMemo(() => {
    const hrs: number[] = [];
    for (let h = 7; h <= 23; h++) hrs.push(h);

    const g: (ActivityItem | null)[][] = hrs.map(() =>
      venues.map(() => null as ActivityItem | null),
    );

    for (const act of activities) {
      const startH = Math.floor(hourNum(act.startTime));
      const endH = Math.ceil(hourNum(act.endTime));
      for (let ri = 0; ri < hrs.length; ri++) {
        if (hrs[ri] >= startH && hrs[ri] < endH) {
          for (let ci = 0; ci < venues.length; ci++) {
            if (act.venueCodes.includes(venues[ci])) {
              g[ri][ci] = act;
            }
          }
        }
      }
    }

    const anyAct = g.some((row) => row.some((c) => c !== null));

    return { hours: hrs, grid: g, hasAnyActivity: anyAct };
  }, [activities, venues]);

  const renderedCells = useMemo(() => {
    if (!hasAnyActivity) return { rows: [] as React.ReactNode[], skip: new Set<string>() };

    const skip = new Set<string>();
    const rows: React.ReactNode[] = [];

    for (let ri = 0; ri < hours.length; ri++) {
      const cols: React.ReactNode[] = [];

      for (let ci = 0; ci < venues.length; ci++) {
        const key = `${ri}:${ci}`;
        if (skip.has(key)) continue;

        const act = grid[ri][ci];
        if (!act) {
          cols.push(
            <td key={`${ci}`} className="border-b border-zinc-100 p-0 relative"></td>,
          );
          continue;
        }

        // rowSpan
        let rowSpan = 1;
        while (
          ri + rowSpan < hours.length &&
          isSameActivityBlock(grid[ri + rowSpan][ci], act)
        ) {
          rowSpan++;
        }

        // colSpan
        let colSpan = 1;
        while (ci + colSpan < venues.length) {
          let allMatch = true;
          for (let r = 0; r < rowSpan; r++) {
            if (!isSameActivityBlock(grid[ri + r][ci + colSpan], act)) {
              allMatch = false;
              break;
            }
          }
          if (!allMatch) break;
          colSpan++;
        }

        for (let r = 0; r < rowSpan; r++) {
          for (let c = 0; c < colSpan; c++) {
            if (r !== 0 || c !== 0) skip.add(`${ri + r}:${ci + c}`);
          }
        }

        const startLabel = fmtHour(act.startTime);
        const endLabel = fmtHour(act.endTime);

        const bgColor = act.activityColor || stringToHslColor(act.activityName);
        const textColor = act.activityColor ? '#ffffff' : getContrastForHsl(act.activityName);

        const hasFormTime = act.formStartTime || act.formEndTime;
        const hasParticipants = act.totalParticipants != null || (act.categories && act.categories.length > 0);

        cols.push(
          <td
            key={`${ci}`}
            rowSpan={rowSpan}
            colSpan={colSpan}
            className="p-0 border border-gray-200 relative"
            style={{ backgroundColor: bgColor, color: textColor }}
          >
            <div className="absolute inset-0 flex flex-col items-center justify-center p-0.5 overflow-hidden" style={{ containerType: 'size' }}>
              <span className="font-bold leading-[1.1] text-center break-words w-full" style={{ fontSize: 'clamp(5px, min(18cqi, 18cqh), 13px)', textWrap: 'balance', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                {act.activityName}
              </span>
              <div className="flex flex-col items-center mt-px opacity-90">
                <span className="tracking-tighter whitespace-nowrap" style={{ fontSize: 'clamp(4px, min(11cqi, 12cqh), 9px)' }}>
                  {startLabel} - {endLabel}
                </span>
                {hasFormTime && (
                   <span className="tracking-tighter whitespace-nowrap font-semibold mt-[1px]" style={{ fontSize: 'clamp(4px, min(10cqi, 11cqh), 8px)' }}>
                     (Real: {act.formStartTime ? fmtHour(act.formStartTime) : '?'} - {act.formEndTime ? fmtHour(act.formEndTime) : '?'})
                   </span>
                )}
                {hasParticipants && (
                   <span className="tracking-tighter whitespace-nowrap opacity-80 mt-[1px]" style={{ fontSize: 'clamp(4px, min(9cqi, 10cqh), 7px)' }}>
                     {act.totalParticipants ? `${act.totalParticipants} pax` : ''}
                     {act.totalParticipants && act.categories?.length ? ' • ' : ''}
                     {act.categories?.join(', ')}
                   </span>
                )}
              </div>
            </div>
          </td>,
        );
      }

      rows.push(
        <tr
          key={hours[ri]}
          style={{ height: ROW_H }}
        >
          <td className="w-8 sm:w-10 p-0 border-r border-b border-zinc-100 relative">
            <div className="absolute inset-0 flex items-center justify-center pr-0.5">
              <span className="text-[8px] sm:text-[9px] font-bold leading-none tabular-nums text-zinc-400">{`${hours[ri]}:00`}</span>
            </div>
          </td>
          {cols}
        </tr>,
      );
    }

    return { rows, skip };
  }, [hours, grid, venues, hasAnyActivity]);

  if (!hasAnyActivity) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4 h-full">
        <span className="text-2xl mb-2">{'🌞'}</span>
        <p className="text-sm font-black text-zinc-500">
          No hi ha activitats que afectin el bar avui
        </p>
        <p className={cn("mt-1 text-xs font-bold text-zinc-400", isHector && date ? "mb-6" : "")}>
          Totes les activitats són en espais sense impacte al bar
        </p>
        {isHector && date && (
          <button
            type="button"
            onClick={() => router.push(`/staff/actividades/revision?date=${date}`)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#36606F] px-4 py-2.5 text-sm font-black uppercase tracking-wider text-white transition-all hover:bg-[#36606F]/90 active:scale-95"
          >
            Crear horari des de 0
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="px-1 sm:px-2 py-1 w-full">
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr style={{ height: ROW_H }}>
            <th className="w-8 sm:w-10 border-b-2 border-[#36606F] pr-1 text-center text-[8px] font-black uppercase tracking-wider text-zinc-400">
              Hora
            </th>
            {venues.map((v) => (
              <th
                key={v}
                className="border-b-2 border-[#36606F] px-1 text-center text-[8px] font-black uppercase tracking-wider text-[#36606F]"
              >
                {v.replace(/^P(\d)$/, 'PISTA $1')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {renderedCells.rows}
        </tbody>
      </table>
    </div>
  );
}

function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}
