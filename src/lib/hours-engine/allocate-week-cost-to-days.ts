/**
 * Reparte el importe semanal de extras a días según los pesos de extrasByDay.
 * Último día absorbe el residuo de céntimos. Sin pesos, cae en el lunes.
 */

function listYmdInclusive(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  const [sy, sm, sd] = startYmd.split('-').map(Number);
  const [ey, em, ed] = endYmd.split('-').map(Number);
  const cur = new Date(sy!, sm! - 1, sd!);
  const end = new Date(ey!, em! - 1, ed!);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function allocateWeekCostToDays(
  extrasByDay: Readonly<Record<string, number>>,
  estimatedValue: number,
  weekStart: string,
  weekEnd: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (Math.abs(estimatedValue) < 0.005) return out;

  const days = listYmdInclusive(weekStart, weekEnd);
  const weights = days.map((day) => Math.max(0, extrasByDay[day] ?? 0));
  const sumW = weights.reduce((a, b) => a + b, 0);

  if (sumW <= 0) {
    out[weekStart] = estimatedValue;
    return out;
  }

  let allocated = 0;
  for (let i = 0; i < days.length; i++) {
    const share =
      i === days.length - 1
        ? round2(estimatedValue - allocated)
        : round2((estimatedValue * weights[i]!) / sumW);
    if (Math.abs(share) >= 0.005) {
      out[days[i]!] = (out[days[i]!] ?? 0) + share;
      allocated = round2(allocated + share);
    }
  }
  return out;
}
