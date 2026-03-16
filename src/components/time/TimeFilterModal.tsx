"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { TimeFilterKind, TimeFilterValue } from "@/components/time/time-filter-types";

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
  const initialKind = useMemo<TimeFilterKind>(() => {
    const candidate = defaultKind ?? initialValue?.kind ?? allowedKinds[0] ?? "date";
    return allowedKinds.includes(candidate) ? candidate : (allowedKinds[0] ?? "date");
  }, [allowedKinds, defaultKind, initialValue?.kind]);

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

  const calendarDays = useMemo(() => {
    const base = calendarBaseDate;
    const startVisible = startOfWeek(startOfMonth(base), { weekStartsOn: 1 });
    const endVisible = endOfWeek(endOfMonth(base), { weekStartsOn: 1 });
    return eachDayOfInterval({ start: startVisible, end: endVisible });
  }, [calendarBaseDate]);

  const canApplyHours = useMemo(() => {
    if (!startTime || !endTime) return false;
    return startTime < endTime;
  }, [startTime, endTime]);

  if (!isOpen) return null;

  const applyAndClose = (v: TimeFilterValue) => {
    onApply(v);
    onClose();
  };

  const TabButton = ({ kind }: { kind: TimeFilterKind }) => (
    <button
      type="button"
      onClick={() => setActiveKind(kind)}
      className={cn(
        "flex-1 min-h-[36px] px-1",
        "text-[9px] font-black uppercase tracking-widest transition-all",
        activeKind === kind ? "text-white bg-[#36606F]" : "text-[#36606F]"
      )}
    >
      {KIND_LABEL[kind]}
    </button>
  );

  const CalendarCell = ({ day }: { day: Date }) => {
    const dStr = ymd(day);
    const selected =
      activeKind === "date"
        ? singleDate === dStr
        : activeKind === "range"
          ? (rangeStart === dStr || rangeEnd === dStr)
          : activeKind === "week"
            ? (() => {
                if (!rangeStart || !rangeEnd) return false;
                return dStr >= rangeStart && dStr <= rangeEnd;
              })()
            : false;

    const inRange =
      (activeKind === "range" || activeKind === "week") &&
      rangeStart &&
      rangeEnd &&
      dStr > rangeStart &&
      dStr < rangeEnd;

    const isMuted = !isSameMonth(day, calendarBaseDate);

    return (
      <button
        type="button"
        onClick={() => {
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
        }}
        className={cn(
          "aspect-square flex items-center justify-center text-[11px] font-black transition-all",
          isMuted ? "opacity-20" : "opacity-100",
          selected
            ? "bg-[#36606F] text-white"
            : inRange
              ? "text-[#36606F]"
              : "text-zinc-600"
        )}
        aria-label={format(day, "yyyy-MM-dd")}
      >
        {format(day, "d")}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#36606F] p-5 text-white relative">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-lg font-black uppercase tracking-tight italic">Filtro</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-xl transition-all min-h-[48px] min-w-[48px] flex items-center justify-center shrink-0"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {allowedKinds.includes("hours") && <TabButton kind="hours" />}
            {allowedKinds.includes("date") && <TabButton kind="date" />}
            {allowedKinds.includes("range") && <TabButton kind="range" />}
            {allowedKinds.includes("week") && <TabButton kind="week" />}
            {allowedKinds.includes("month") && <TabButton kind="month" />}
            {allowedKinds.includes("year") && <TabButton kind="year" />}
          </div>

          {activeKind === "hours" && allowedKinds.includes("hours") && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-zinc-50 rounded-2xl border border-zinc-100 p-3">
                  <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Desde</div>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="mt-2 w-full bg-transparent text-zinc-900 font-black outline-none text-sm min-h-[48px]"
                  />
                </div>
                <div className="bg-zinc-50 rounded-2xl border border-zinc-100 p-3">
                  <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Hasta</div>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="mt-2 w-full bg-transparent text-zinc-900 font-black outline-none text-sm min-h-[48px]"
                  />
                </div>
              </div>
              <button
                type="button"
                disabled={!canApplyHours}
                onClick={() => applyAndClose({ kind: "hours", startTime, endTime })}
                className={cn(
                  "w-full min-h-[48px] rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all",
                  canApplyHours ? "bg-zinc-900 text-white hover:scale-[1.01] active:scale-[0.99]" : "bg-zinc-100 text-zinc-300"
                )}
              >
                Aplicar horas
              </button>
            </div>
          )}

          {(activeKind === "date" || activeKind === "range" || activeKind === "week") && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <button
                  type="button"
                  onClick={() => setCalendarBaseDate(subMonths(calendarBaseDate, 1))}
                  className="p-2 hover:bg-zinc-50 rounded-2xl transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center"
                  aria-label="Mes anterior"
                >
                  <ChevronLeft size={20} className="text-zinc-400" />
                </button>
                <div className="text-xs font-black uppercase tracking-tight text-zinc-900">
                  {format(calendarBaseDate, "MMMM yyyy", { locale: es })}
                </div>
                <button
                  type="button"
                  onClick={() => setCalendarBaseDate(addMonths(calendarBaseDate, 1))}
                  className="p-2 hover:bg-zinc-50 rounded-2xl transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center"
                  aria-label="Mes siguiente"
                >
                  <ChevronRight size={20} className="text-zinc-400" />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1">
                {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
                  <div key={d} className="text-center text-[9px] font-black text-zinc-300 py-2">
                    {d}
                  </div>
                ))}
                {calendarDays.map((day) => (
                  <CalendarCell key={day.toISOString()} day={day} />
                ))}
              </div>

              {activeKind === "range" && (
                <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400 text-center">
                  {rangeStart && !rangeEnd ? "Elige fecha final" : " "}
                </div>
              )}
            </div>
          )}

          {activeKind === "month" && allowedKinds.includes("month") && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <button
                  type="button"
                  onClick={() => setPickerYear((y) => y - 1)}
                  className="p-2 hover:bg-zinc-50 rounded-2xl transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center"
                  aria-label="Año anterior"
                >
                  <ChevronLeft size={20} className="text-zinc-400" />
                </button>
                <div className="text-xl font-black tracking-tighter text-zinc-900">{pickerYear}</div>
                <button
                  type="button"
                  onClick={() => setPickerYear((y) => y + 1)}
                  className="p-2 hover:bg-zinc-50 rounded-2xl transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center"
                  aria-label="Año siguiente"
                >
                  <ChevronRight size={20} className="text-zinc-400" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 12 }).map((_, i) => {
                  const date = new Date(pickerYear, i, 1);
                  const label = format(date, "MMM", { locale: es });
                  const isSelected =
                    initialValue?.kind === "month" && initialValue.year === pickerYear && initialValue.month === i + 1;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => applyAndClose({ kind: "month", year: pickerYear, month: i + 1 })}
                      className={cn(
                        "py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-2 min-h-[48px]",
                        isSelected ? "bg-zinc-900 border-zinc-900 text-white shadow-lg" : "bg-zinc-50 border-transparent text-zinc-400 hover:border-zinc-200 hover:text-zinc-900"
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
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
                      className={cn(
                        "min-h-[48px] rounded-2xl text-[11px] font-black tracking-tight border-2 transition-all",
                        isSelected ? "bg-zinc-900 border-zinc-900 text-white shadow-lg" : "bg-zinc-50 border-transparent text-zinc-500 hover:border-zinc-200 hover:text-zinc-900"
                      )}
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
                  className="min-h-[48px] px-4 rounded-2xl bg-zinc-50 text-zinc-500 font-black text-[10px] uppercase tracking-widest hover:bg-zinc-100 transition-colors"
                >
                  -6
                </button>
                <button
                  type="button"
                  onClick={() => setPickerYear((y) => y + 6)}
                  className="min-h-[48px] px-4 rounded-2xl bg-zinc-50 text-zinc-500 font-black text-[10px] uppercase tracking-widest hover:bg-zinc-100 transition-colors"
                >
                  +6
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

