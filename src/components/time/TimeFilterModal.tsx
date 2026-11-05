"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, subMonths } from "date-fns";
import { es } from "date-fns/locale";
import {
  addDays,
  format,
  startOfWeek,
} from "date-fns";
import type { TimeFilterKind, TimeFilterValue } from "@/components/time/time-filter-types";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { MiniMonthCalendar } from "@/components/time/MiniMonthCalendar";
import { MonthPickerGrid, monthCellDarkClassName, periodFilterTabClassName } from "@/components/time/MonthPickerGrid";
import { trackUsageModalApply } from "@/lib/usage/client";
import { cn } from "@/lib/utils";
import { timeFilterApplySummary } from "@/lib/usage/modal-apply";

function parseYmdLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split("T")[0].split("-").map(Number);
  return new Date(y, m - 1, d);
}

function ymd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

const KIND_LABEL: Record<TimeFilterKind, string> = {
  hours: "Horas",
  date: "Fecha",
  range: "Periodo",
  week: "Semana",
  month: "Mes",
  year: "Año",
};

const KIND_ORDER: TimeFilterKind[] = ["hours", "date", "range", "week", "month", "year"];

export function TimeFilterModal({
  isOpen,
  onClose,
  onApply,
  allowedKinds,
  initialValue,
  defaultKind,
  quickRangePreset,
  calendarDayAmounts,
  onCalendarMonthChange,
  salesDesktop = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  onApply: (value: TimeFilterValue) => void;
  allowedKinds: TimeFilterKind[];
  initialValue?: TimeFilterValue;
  defaultKind?: TimeFilterKind;
  /** Acceso opcional a un periodo habitual; conserva el mismo modal visual P7. */
  quickRangePreset?: { label: string; value: Extract<TimeFilterValue, { kind: "range" }> };
  calendarDayAmounts?: Record<string, number>;
  onCalendarMonthChange?: (next: Date) => void;
  /** Diseño ampliado y leyenda de colores solo en Ventas escritorio. */
  salesDesktop?: boolean;
}) {
  const pathname = usePathname();
  const initialKind = useMemo<TimeFilterKind>(() => {
    const candidate = defaultKind ?? initialValue?.kind ?? allowedKinds[0] ?? "date";
    return allowedKinds.includes(candidate) ? candidate : (allowedKinds[0] ?? "date");
  }, [allowedKinds, defaultKind, initialValue?.kind]);

  const visibleKinds = useMemo(
    () => KIND_ORDER.filter((k) => allowedKinds.includes(k)),
    [allowedKinds]
  );

  const [activeKind, setActiveKind] = useState<TimeFilterKind>(initialKind);

  // Hours
  const [startTime, setStartTime] = useState("07:00");
  const [endTime, setEndTime] = useState("23:00");

  // Date/Range/Week selection
  const [calendarBaseDate, setCalendarBaseDate] = useState<Date>(() => new Date());
  const [singleDate, setSingleDate] = useState<string>(() => ymd(new Date()));
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);

  // Month/Year pickers
  const [pickerYear, setPickerYear] = useState<number>(() => new Date().getFullYear());

  useEffect(() => {
    if (!isOpen) return;
    setActiveKind(initialKind);

    if (initialValue?.kind === "hours") {
      setStartTime(initialValue.startTime);
      setEndTime(initialValue.endTime);
      return;
    }

    if (initialValue?.kind === "date") {
      setSingleDate(initialValue.date);
      setCalendarBaseDate(parseYmdLocal(initialValue.date));
      setRangeStart(null);
      setRangeEnd(null);
      return;
    }

    if (initialValue?.kind === "range" || initialValue?.kind === "week") {
      setRangeStart(initialValue.startDate);
      setRangeEnd(initialValue.endDate);
      setCalendarBaseDate(parseYmdLocal(initialValue.startDate));
      setSingleDate(initialValue.startDate);
      return;
    }

    if (initialValue?.kind === "month") {
      setPickerYear(initialValue.year);
      setCalendarBaseDate(new Date(initialValue.year, initialValue.month - 1, 1));
      return;
    }

    if (initialValue?.kind === "year") {
      setPickerYear(initialValue.year);
      setCalendarBaseDate(new Date(initialValue.year, 0, 1));
    }
  }, [initialKind, initialValue, isOpen]);

  const canApplyHours = useMemo(() => {
    if (!startTime || !endTime) return false;
    return startTime < endTime;
  }, [startTime, endTime]);

  if (!isOpen) return null;

  const applyAndClose = (v: TimeFilterValue) => {
    trackUsageModalApply(
      'time-filter',
      'Filtro horario',
      pathname,
      timeFilterApplySummary(v),
      { filterKind: v.kind }
    );
    onApply(v);
    onClose();
  };

  const selectCalendarDay = (day: Date) => {
    const dStr = ymd(day);
    if (activeKind === "date") {
      setSingleDate(dStr);
      applyAndClose({ kind: "date", date: dStr });
      return;
    }

    if (activeKind === "week") {
      const ws = startOfWeek(day, { weekStartsOn: 1 });
      const we = addDays(ws, 6);
      const s = ymd(ws);
      const e = ymd(we);
      setRangeStart(s);
      setRangeEnd(e);
      applyAndClose({ kind: "week", startDate: s, endDate: e });
      return;
    }

    if (activeKind === "range") {
      if (!rangeStart || (rangeStart && rangeEnd)) {
        setRangeStart(dStr);
        setRangeEnd(null);
        return;
      }
      if (dStr < rangeStart) {
        setRangeStart(dStr);
        return;
      }
      setRangeEnd(dStr);
      applyAndClose({ kind: "range", startDate: rangeStart, endDate: dStr });
    }
  };

  const calendarSelected = (day: Date) => {
    const dStr = ymd(day);
    if (activeKind === "date") return singleDate === dStr;
    if (activeKind === "range") return rangeStart === dStr || rangeEnd === dStr;
    if (activeKind === "week") {
      return Boolean(rangeStart && rangeEnd && dStr >= rangeStart && dStr <= rangeEnd);
    }
    return false;
  };

  const calendarInRange = (day: Date) => {
    const dStr = ymd(day);
    return Boolean(
      activeKind === "range" && rangeStart && rangeEnd && dStr > rangeStart && dStr < rangeEnd
    );
  };

  const showKindTabs = visibleKinds.length > 1;

  const jumpToToday = () => {
    const today = new Date();
    setCalendarBaseDate(today);
    setPickerYear(today.getFullYear());
    onCalendarMonthChange?.(today);
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={salesDesktop ? "Filtrar ventas" : "Filtro"}
      variant={salesDesktop ? "standard" : "compact"}
      instance={salesDesktop ? "ventas-desktop-time-filter" : undefined}
      scheme="dark"
      usageId="time-filter"
      usageLabel="Filtro horario"
    >
        <div className={cn("space-y-3", salesDesktop && "space-y-4")}>
          {showKindTabs ? (
            <div
              role="tablist"
              aria-label="Tipo de periodo"
              className={cn("flex max-w-full overflow-hidden rounded-ds-control border border-white/15 bg-white/5 shadow-sm", salesDesktop && "gap-1 rounded-xl border-white/10 bg-black/20 p-1")}
            >
              {visibleKinds.map((kind) => {
                const selected = activeKind === kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActiveKind(kind)}
                    className={cn(
                      periodFilterTabClassName(selected, true),
                      salesDesktop && "rounded-lg py-1 text-[11px] font-semibold",
                      salesDesktop && (selected
                        ? "!bg-white !text-[#23375a] shadow-sm"
                        : "!bg-transparent !text-white/65 hover:!bg-white/10 hover:!text-white")
                    )}
                  >
                    {KIND_LABEL[kind]}
                  </button>
                );
              })}
            </div>
          ) : null}

          {salesDesktop && (
            <p className="px-1 text-[11px] leading-relaxed text-white/70">
              {activeKind === "date" ? "Elige un día para consultar sus ventas."
                : activeKind === "range" ? "Selecciona el primer día y después el último del periodo."
                : activeKind === "week" ? "Selecciona un día para consultar su semana completa."
                : activeKind === "month" ? "Selecciona el mes cuyas ventas quieres consultar."
                : activeKind === "year" ? "Selecciona el año cuyas ventas quieres consultar."
                : "Selecciona el horario que quieres consultar."}
            </p>
          )}

          {quickRangePreset && allowedKinds.includes("range") ? (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="secondary"
                instance="time-filter-quick-range"
                onClick={() => applyAndClose(quickRangePreset.value)}
              >
                {quickRangePreset.label}
              </Button>
            </div>
          ) : null}

          {activeKind === "hours" && allowedKinds.includes("hours") && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-white/15 bg-white/5 p-3">
                  <div className="text-[9px] font-semibold uppercase tracking-widest text-white/60">Desde</div>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="mt-2 w-full min-h-[48px] bg-transparent text-white font-semibold outline-none text-sm [color-scheme:dark]"
                  />
                </div>
                <div className="rounded-lg border border-white/15 bg-white/5 p-3">
                  <div className="text-[9px] font-semibold uppercase tracking-widest text-white/60">Hasta</div>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="mt-2 w-full min-h-[48px] bg-transparent text-white font-semibold outline-none text-sm [color-scheme:dark]"
                  />
                </div>
              </div>
              <div className="flex justify-end">
              <Button
                type="button"
                variant="primary"
                instance="time-filter-apply-hours"
                disabled={!canApplyHours}
                onClick={() => applyAndClose({ kind: "hours", startTime, endTime })}
              >
                Aplicar horas
              </Button>
              </div>
            </div>
          )}

          {activeKind !== "hours" && (
            <div className="flex min-w-0 items-center justify-between gap-2">
              <div className="min-w-0 flex-1 flex justify-center">
                <div className="inline-flex max-w-full items-center gap-0.5 text-white">
                  <button type="button" aria-label="Anterior" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-white/10" onClick={() => {
                    if (activeKind === "month") setPickerYear(y => y - 1);
                    else if (activeKind === "year") setPickerYear(y => y - 6);
                    else { const next = subMonths(calendarBaseDate, 1); setCalendarBaseDate(next); onCalendarMonthChange?.(next); }
                  }}><ChevronLeft size={19}/></button>
                  <span className="whitespace-nowrap text-center text-xs font-semibold uppercase tracking-tight">
                    {activeKind === "month" ? pickerYear : activeKind === "year" ? `${pickerYear - 2}–${pickerYear + 3}` : format(calendarBaseDate, "MMMM yyyy", { locale: es })}
                  </span>
                  <button type="button" aria-label="Siguiente" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-white/10" onClick={() => {
                    if (activeKind === "month") setPickerYear(y => y + 1);
                    else if (activeKind === "year") setPickerYear(y => y + 6);
                    else { const next = addMonths(calendarBaseDate, 1); setCalendarBaseDate(next); onCalendarMonthChange?.(next); }
                  }}><ChevronRight size={19}/></button>
                </div>
              </div>
              <button type="button" onClick={jumpToToday} className={cn(
                "shrink-0 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-100",
                salesDesktop && "border border-white/20 !bg-white/10 !text-white hover:!bg-white/20"
              )}>Hoy</button>
            </div>
          )}

          {(activeKind === "date" || activeKind === "range" || activeKind === "week") && (
            <div className="space-y-3">
              <MiniMonthCalendar
                month={calendarBaseDate}
                monthInHeader
                dark
                salesDesktop={salesDesktop}
                onMonthChange={next => { setCalendarBaseDate(next); onCalendarMonthChange?.(next); }}
                dayAmounts={calendarDayAmounts}
                onSelectDay={selectCalendarDay}
                isSelected={calendarSelected}
                isInRange={calendarInRange}
              />

              {salesDesktop && (
                <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-white/85">Colores de venta neta</p>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-[10px] text-white/85">
                    <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-3 rounded border border-orange-300 bg-orange-200" />Más bajas</span>
                    <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-3 rounded border border-yellow-300 bg-yellow-200" />Intermedias</span>
                    <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-3 rounded border border-emerald-400 bg-emerald-200" />Más altas</span>
                  </div>
                  <p className="text-[10px] leading-snug text-white/55">Comparación relativa entre los días con ventas del mes. Un día sin importe no tiene datos.</p>
                </div>
              )}

              {activeKind === "range" && (
                <div className="text-[10px] font-medium uppercase tracking-widest text-white/60 text-center">
                  {rangeStart && !rangeEnd ? "Elige fecha final" : " "}
                </div>
              )}
            </div>
          )}

          {activeKind === "month" && allowedKinds.includes("month") && (
            <MonthPickerGrid
              year={pickerYear}
              hideNavigation
              dark
              onYearChange={setPickerYear}
              isSelected={(monthIndex) =>
                initialValue?.kind === "month" &&
                initialValue.year === pickerYear &&
                initialValue.month === monthIndex + 1
              }
              onSelectMonth={(monthIndex) =>
                applyAndClose({ kind: "month", year: pickerYear, month: monthIndex + 1 })
              }
            />
          )}

          {activeKind === "year" && allowedKinds.includes("year") && (
            <div className="space-y-3">
              <div className="text-[10px] font-medium uppercase tracking-widest text-white/60 text-center">Selecciona año</div>
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 6 }).map((_, i) => {
                  const y = pickerYear - 2 + i;
                  const isSelected = initialValue?.kind === "year" && initialValue.year === y;
                  return (
                    <button
                      key={y}
                      type="button"
                      onClick={() => applyAndClose({ kind: "year", year: y })}
                      className={`min-h-12 ${monthCellDarkClassName(isSelected)}`}
                    >
                      {y}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
    </Modal>
  );
}
