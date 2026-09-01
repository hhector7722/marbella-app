"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  addDays,
  format,
  startOfWeek,
} from "date-fns";
import { cn } from "@/lib/utils";
import type { TimeFilterKind, TimeFilterValue } from "@/components/time/time-filter-types";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { MiniMonthCalendar } from "@/components/time/MiniMonthCalendar";
import { MonthPickerGrid, monthCellClassName, periodFilterTabClassName } from "@/components/time/MonthPickerGrid";
import { trackUsageModalApply } from "@/lib/usage/client";
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
}: {
  isOpen: boolean;
  onClose: () => void;
  onApply: (value: TimeFilterValue) => void;
  allowedKinds: TimeFilterKind[];
  initialValue?: TimeFilterValue;
  defaultKind?: TimeFilterKind;
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

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Filtro"
      variant="compact"
      usageId="time-filter"
      usageLabel="Filtro horario"
    >
        <div className="space-y-3">
          {showKindTabs ? (
            <div
              role="tablist"
              aria-label="Tipo de periodo"
              className="flex max-w-full overflow-hidden rounded-ds-control border border-ds-borde bg-ds-superficie shadow-ds-superficie"
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
                    className={periodFilterTabClassName(selected)}
                  >
                    {KIND_LABEL[kind]}
                  </button>
                );
              })}
            </div>
          ) : null}

          {activeKind === "hours" && allowedKinds.includes("hours") && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-zinc-50 rounded-lg border border-zinc-100 p-3">
                  <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Desde</div>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="mt-2 w-full bg-transparent text-zinc-900 font-black outline-none text-sm min-h-[48px]"
                  />
                </div>
                <div className="bg-zinc-50 rounded-lg border border-zinc-100 p-3">
                  <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Hasta</div>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="mt-2 w-full bg-transparent text-zinc-900 font-black outline-none text-sm min-h-[48px]"
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

          {(activeKind === "date" || activeKind === "range" || activeKind === "week") && (
            <div className="space-y-3">
              <MiniMonthCalendar
                month={calendarBaseDate}
                onMonthChange={setCalendarBaseDate}
                onSelectDay={selectCalendarDay}
                isSelected={calendarSelected}
                isInRange={calendarInRange}
              />

              {activeKind === "range" && (
                <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400 text-center">
                  {rangeStart && !rangeEnd ? "Elige fecha final" : " "}
                </div>
              )}
            </div>
          )}

          {activeKind === "month" && allowedKinds.includes("month") && (
            <MonthPickerGrid
              year={pickerYear}
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
              <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400 text-center">Selecciona año</div>
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 6 }).map((_, i) => {
                  const y = pickerYear - 2 + i;
                  const isSelected = initialValue?.kind === "year" && initialValue.year === y;
                  return (
                    <button
                      key={y}
                      type="button"
                      onClick={() => applyAndClose({ kind: "year", year: y })}
                      className={monthCellClassName(isSelected)}
                    >
                      {y}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setPickerYear((y) => y - 6)}
                  className="min-h-[48px] px-4 rounded-lg bg-zinc-50 text-zinc-500 font-black text-[10px] uppercase tracking-widest hover:bg-zinc-100 transition-colors"
                >
                  -6
                </button>
                <button
                  type="button"
                  onClick={() => setPickerYear((y) => y + 6)}
                  className="min-h-[48px] px-4 rounded-lg bg-zinc-50 text-zinc-500 font-black text-[10px] uppercase tracking-widest hover:bg-zinc-100 transition-colors"
                >
                  +6
                </button>
              </div>
            </div>
          )}
        </div>
    </Modal>
  );
}
