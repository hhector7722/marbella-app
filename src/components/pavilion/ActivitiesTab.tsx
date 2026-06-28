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

const TEAL_COLORS = [
  'bg-teal-50',
  'bg-cyan-50',
  'bg-emerald-50',
  'bg-teal-100',
  'bg-cyan-100',
  'bg-emerald-100'
];

function getColorForActivity(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TEAL_COLORS[Math.abs(hash) % TEAL_COLORS.length];
}

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

export function ActivitiesTab({ activities }: Props) {
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
            <td key={`${ci}`} className="border-b border-zinc-100 p-0" />,
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

        cols.push(
          <td
            key={`${ci}`}
            rowSpan={rowSpan}
            colSpan={colSpan}
            className={cn(
              "p-0.5 text-center align-middle border border-gray-200",
              getColorForActivity(act.activityName)
            )}
          >
            <div className="flex flex-col items-center justify-center min-h-[1.25rem]">
              <span className="text-sm font-semibold text-zinc-900 leading-tight">
                {act.activityName}
              </span>
              <span className="text-[10px] font-normal text-black">
                {startLabel} - {endLabel}
              </span>
            </div>
          </td>,
        );
      }

      rows.push(
        <tr key={hours[ri]} className="h-5">
          <td className="w-12 p-0 border-b border-zinc-100 md:w-14">
            <div className="flex h-full w-full items-center pr-2">
              <span className="text-[10px] font-bold leading-none tabular-nums text-[#407080]">{`${hours[ri]}:00`}</span>
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
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <span className="text-2xl mb-2">{'🌞'}</span>
        <p className="text-sm font-black text-zinc-500">
          No hi ha activitats que afectin el bar avui
        </p>
        <p className="mt-1 text-xs font-bold text-zinc-400">
          Totes les activitats són en espais sense impacte al bar
        </p>
      </div>
    );
  }

  return (
    <div className="px-2 py-4 md:px-4">
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr>
            <th className="w-12 border-b-2 border-[#36606F] pb-2 pr-2 text-left text-[9px] font-black uppercase tracking-wider text-zinc-400 md:w-14">
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
        <tbody>{renderedCells.rows}</tbody>
      </table>
    </div>
  );
}

function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}
