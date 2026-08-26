import { addDays, addMonths, endOfMonth, format, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";

export type TimeFilterKind = "hours" | "date" | "range" | "week" | "month" | "year";

function parseYmdLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split("T")[0]!.split("-").map(Number);
  return new Date(y!, m! - 1, d);
}

function ymd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export type TimeFilterValue =
  | { kind: "hours"; startTime: string; endTime: string } // HH:mm
  | { kind: "date"; date: string } // yyyy-MM-dd
  | { kind: "range"; startDate: string; endDate: string } // yyyy-MM-dd
  | { kind: "week"; startDate: string; endDate: string } // yyyy-MM-dd (lunes-domingo)
  | { kind: "month"; year: number; month: number } // 1-12
  | { kind: "year"; year: number };

export function timeFilterLabel(v: TimeFilterValue): string {
  switch (v.kind) {
    case "hours":
      return `Horas ${v.startTime}–${v.endTime}`;
    case "date":
      return `Fecha ${v.date}`;
    case "range":
      return `Periodo ${v.startDate}–${v.endDate}`;
    case "week":
      return `Semana ${v.startDate}–${v.endDate}`;
    case "month":
      return `Mes ${String(v.month).padStart(2, "0")}/${v.year}`;
    case "year":
      return `Año ${v.year}`;
  }
}

export function timeFilterBounds(
  v: TimeFilterValue
): { startDate: string; endDate: string } | null {
  switch (v.kind) {
    case "hours":
      return null;
    case "date":
      return { startDate: v.date, endDate: v.date };
    case "week":
    case "range":
      return { startDate: v.startDate, endDate: v.endDate };
    case "month": {
      const s = new Date(v.year, v.month - 1, 1);
      return { startDate: ymd(startOfMonth(s)), endDate: ymd(endOfMonth(s)) };
    }
    case "year":
      return { startDate: `${v.year}-01-01`, endDate: `${v.year}-12-31` };
  }
}

export function shiftTimeFilterValue(v: TimeFilterValue, delta: number): TimeFilterValue {
  switch (v.kind) {
    case "hours":
      return v;
    case "date":
      return { kind: "date", date: ymd(addDays(parseYmdLocal(v.date), delta)) };
    case "week":
      return {
        kind: "week",
        startDate: ymd(addDays(parseYmdLocal(v.startDate), delta * 7)),
        endDate: ymd(addDays(parseYmdLocal(v.endDate), delta * 7)),
      };
    case "range": {
      const s = parseYmdLocal(v.startDate);
      const e = parseYmdLocal(v.endDate);
      const len = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
      return {
        kind: "range",
        startDate: ymd(addDays(s, delta * len)),
        endDate: ymd(addDays(e, delta * len)),
      };
    }
    case "month": {
      const d = addMonths(new Date(v.year, v.month - 1, 1), delta);
      return { kind: "month", year: d.getFullYear(), month: d.getMonth() + 1 };
    }
    case "year":
      return { kind: "year", year: v.year + delta };
  }
}

/** Etiqueta visible en PeriodNav (P7). */
export function formatTimeFilterPeriodLabel(v: TimeFilterValue): string {
  switch (v.kind) {
    case "hours":
      return `${v.startTime}–${v.endTime}`;
    case "date":
      return format(parseYmdLocal(v.date), "EEEE d 'de' MMMM", { locale: es });
    case "week":
    case "range": {
      const s = parseYmdLocal(v.startDate);
      const e = parseYmdLocal(v.endDate);
      if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
        return `${format(s, "d", { locale: es })} – ${format(e, "d MMM yyyy", { locale: es })}`;
      }
      return `${format(s, "d MMM", { locale: es })} – ${format(e, "d MMM yyyy", { locale: es })}`;
    }
    case "month":
      return format(new Date(v.year, v.month - 1, 1), "MMMM yyyy", { locale: es });
    case "year":
      return String(v.year);
  }
}

