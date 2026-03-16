export type TimeFilterKind = "hours" | "date" | "range" | "week" | "month" | "year";

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

