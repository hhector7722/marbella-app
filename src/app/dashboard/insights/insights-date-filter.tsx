'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  MONTH_NAMES_ES,
  buildMonthDays,
  buildWeekRows,
  formatDayLabel,
  formatInsightsMonthLabel,
  formatPeriodLabel,
  isoWeekNumber,
  monthFromYmd,
  parseYmdLocal,
  shiftInsightsMonth,
  type InsightsFilterMode,
  type InsightsMonth,
} from './insights-date-utils'

export type { InsightsFilterMode, InsightsMonth }

function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  handler: () => void,
  enabled: boolean
) {
  useEffect(() => {
    if (!enabled) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) handler()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [ref, handler, enabled])
}

function PickerShell({
  open,
  onClose,
  children,
  className,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
}) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[10060] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className={cn(
          'z-[10061] w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl',
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

function MonthNav({
  label,
  onPrev,
  onNext,
}: {
  label: string
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <button
        type="button"
        onClick={onPrev}
        aria-label="Anterior"
        className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-xl border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="text-xs font-black uppercase tracking-wide text-zinc-700">{label}</span>
      <button
        type="button"
        onClick={onNext}
        aria-label="Siguiente"
        className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-xl border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}

const WEEKDAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const

function useViewMonthFromYmd(ymd: string): [InsightsMonth, React.Dispatch<React.SetStateAction<InsightsMonth>>] {
  const [state, setState] = useState(() => monthFromYmd(ymd))
  useEffect(() => {
    setState(monthFromYmd(ymd))
  }, [ymd])
  return [state, setState]
}

export function InsightsMainDateFilter({
  mode,
  openPicker,
  onOpenPicker,
  onClosePicker,
  selectedWeekMonday,
  selectedMonth,
  selectedDay,
  periodFrom,
  periodTo,
  onSelectWeek,
  onSelectMonth,
  onSelectDay,
  onApplyPeriod,
}: {
  mode: InsightsFilterMode
  openPicker: InsightsFilterMode | null
  onOpenPicker: (m: InsightsFilterMode) => void
  onClosePicker: () => void
  selectedWeekMonday: string
  selectedMonth: InsightsMonth
  selectedDay: string
  periodFrom: string
  periodTo: string
  onSelectWeek: (monday: string) => void
  onSelectMonth: (fm: InsightsMonth) => void
  onSelectDay: (ymd: string) => void
  onApplyPeriod: (from: string, to: string) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  useClickOutside(rootRef, onClosePicker, openPicker !== null)

  const [weekView, setWeekView] = useViewMonthFromYmd(selectedWeekMonday)
  const [dayView, setDayView] = useViewMonthFromYmd(selectedDay)
  const [monthViewYear, setMonthViewYear] = useState(selectedMonth.year)
  const [periodDraftFrom, setPeriodDraftFrom] = useState(periodFrom)
  const [periodDraftTo, setPeriodDraftTo] = useState(periodTo)

  useEffect(() => {
    if (openPicker === 'periodo') {
      setPeriodDraftFrom(periodFrom)
      setPeriodDraftTo(periodTo)
    }
  }, [openPicker, periodFrom, periodTo])

  useEffect(() => {
    setMonthViewYear(selectedMonth.year)
  }, [selectedMonth.year])

  const weekRows = useMemo(
    () => buildWeekRows(weekView.year, weekView.month),
    [weekView.year, weekView.month]
  )

  const dayGrid = useMemo(() => {
    const days = buildMonthDays(dayView.year, dayView.month)
    const first = parseYmdLocal(days[0]!)
    const firstDow = new Date(first.y, first.m - 1, first.d).getDay()
    const offset = firstDow === 0 ? 6 : firstDow - 1
    return { days, offset }
  }, [dayView.year, dayView.month])

  const modes: InsightsFilterMode[] = ['sem', 'mes', 'dia', 'periodo']

  const modeLabel = (m: InsightsFilterMode): string => {
    if (m !== mode) {
      return m === 'sem' ? 'Sem' : m === 'mes' ? 'Mes' : m === 'dia' ? 'Día' : 'Periodo'
    }
    if (mode === 'sem') return `Sem ${isoWeekNumber(selectedWeekMonday)}`
    if (mode === 'mes') return MONTH_NAMES_ES[selectedMonth.month - 1]!
    if (mode === 'dia') return formatDayLabel(selectedDay)
    return formatPeriodLabel(periodFrom, periodTo)
  }

  return (
    <div ref={rootRef} className="relative flex items-center gap-1 shrink-0 w-full sm:w-auto">
      {modes.map((m) => (
        <div key={m} className="relative flex-1 sm:flex-none min-w-0">
          <button
            type="button"
            onClick={() => onOpenPicker(m)}
            className={cn(
              'w-full min-h-9 shrink-0 rounded-lg px-2 md:px-2.5 py-1.5 text-[10px] md:text-[11px] font-black uppercase tracking-wide border active:scale-95 transition-all whitespace-nowrap',
              mode === m
                ? 'bg-[#36606F] text-white border-[#36606F]'
                : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
            )}
          >
            {modeLabel(m)}
          </button>

          <PickerShell
            open={openPicker === m}
            onClose={onClosePicker}
            className={m === 'periodo' ? 'sm:min-w-[20rem]' : undefined}
          >
            {m === 'sem' && (
              <>
                <MonthNav
                  label={formatInsightsMonthLabel(weekView)}
                  onPrev={() => setWeekView((v) => shiftInsightsMonth(v, -1))}
                  onNext={() => setWeekView((v) => shiftInsightsMonth(v, 1))}
                />
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {WEEKDAY_LABELS.map((w) => (
                    <span key={w} className="text-[9px] font-bold text-zinc-400 text-center">
                      {w}
                    </span>
                  ))}
                </div>
                <div className="space-y-1">
                  {weekRows.map((row) => {
                    const inViewMonth = row.days.some((d) => {
                      const p = parseYmdLocal(d)
                      return p.m === weekView.month && p.y === weekView.year
                    })
                    if (!inViewMonth) return null
                    return (
                      <button
                        key={row.monday}
                        type="button"
                        onClick={() => onSelectWeek(row.monday)}
                        className={cn(
                          'w-full grid grid-cols-7 gap-1 rounded-xl px-1 py-1.5 transition-colors',
                          'hover:bg-[#36606F]/10',
                          selectedWeekMonday === row.monday && 'bg-[#36606F]/15 ring-1 ring-[#36606F]/40'
                        )}
                      >
                        {row.days.map((d) => {
                          const p = parseYmdLocal(d)
                          const muted = p.m !== weekView.month
                          return (
                            <span
                              key={d}
                              className={cn(
                                'text-[11px] font-bold tabular-nums text-center py-1 rounded-lg',
                                muted ? 'text-zinc-300' : 'text-zinc-700',
                                selectedWeekMonday === row.monday && !muted && 'text-[#36606F]'
                              )}
                            >
                              {p.d}
                            </span>
                          )
                        })}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {m === 'mes' && (
              <>
                <MonthNav
                  label={String(monthViewYear)}
                  onPrev={() => setMonthViewYear((y) => y - 1)}
                  onNext={() => setMonthViewYear((y) => y + 1)}
                />
                <div className="grid grid-cols-3 gap-2">
                  {MONTH_NAMES_ES.map((name, idx) => {
                    const fm = { year: monthViewYear, month: idx + 1 }
                    const active =
                      selectedMonth.year === fm.year && selectedMonth.month === fm.month
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => onSelectMonth(fm)}
                        className={cn(
                          'min-h-11 rounded-xl text-xs font-black border transition-colors',
                          active
                            ? 'bg-[#36606F] text-white border-[#36606F]'
                            : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                        )}
                      >
                        {name.slice(0, 3)}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {m === 'dia' && (
              <>
                <MonthNav
                  label={formatInsightsMonthLabel(dayView)}
                  onPrev={() => setDayView((v) => shiftInsightsMonth(v, -1))}
                  onNext={() => setDayView((v) => shiftInsightsMonth(v, 1))}
                />
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {WEEKDAY_LABELS.map((w) => (
                    <span key={w} className="text-[9px] font-bold text-zinc-400 text-center">
                      {w}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: dayGrid.offset }).map((_, i) => (
                    <span key={`pad-${i}`} />
                  ))}
                  {dayGrid.days.map((d) => {
                    const p = parseYmdLocal(d)
                    const active = d === selectedDay
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => onSelectDay(d)}
                        className={cn(
                          'min-h-10 rounded-xl text-xs font-black tabular-nums transition-colors',
                          active
                            ? 'bg-[#36606F] text-white'
                            : 'text-zinc-700 hover:bg-zinc-100'
                        )}
                      >
                        {p.d}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {m === 'periodo' && (
              <div className="space-y-3">
                <label className="block">
                  <span className="text-[10px] font-bold uppercase text-zinc-500">Desde</span>
                  <input
                    type="date"
                    value={periodDraftFrom}
                    onChange={(e) => setPeriodDraftFrom(e.target.value)}
                    className="mt-1 w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-sm font-bold tabular-nums"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase text-zinc-500">Hasta</span>
                  <input
                    type="date"
                    value={periodDraftTo}
                    onChange={(e) => setPeriodDraftTo(e.target.value)}
                    className="mt-1 w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-sm font-bold tabular-nums"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => onApplyPeriod(periodDraftFrom, periodDraftTo)}
                  className="w-full min-h-12 rounded-xl bg-[#36606F] text-white text-xs font-black uppercase tracking-wide"
                >
                  Aplicar
                </button>
              </div>
            )}
          </PickerShell>
        </div>
      ))}
    </div>
  )
}

export function FinancialMonthSelector({
  month,
  onChange,
  tone = 'default',
}: {
  month: InsightsMonth
  onChange: (fm: InsightsMonth) => void
  tone?: 'default' | 'onDark'
}) {
  const onDark = tone === 'onDark'
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={() => onChange(shiftInsightsMonth(month, -1))}
        aria-label="Mes anterior"
        className={cn(
          'min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg active:scale-95',
          onDark
            ? 'text-white hover:bg-white/15'
            : 'text-zinc-600 hover:bg-zinc-100'
        )}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span
        className={cn(
          'text-[10px] lg:text-xs font-black uppercase tracking-wide whitespace-nowrap px-1',
          onDark ? 'text-white' : 'text-[#36606F]'
        )}
      >
        {formatInsightsMonthLabel(month)}
      </span>
      <button
        type="button"
        onClick={() => onChange(shiftInsightsMonth(month, 1))}
        aria-label="Mes siguiente"
        className={cn(
          'min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg active:scale-95',
          onDark
            ? 'text-white hover:bg-white/15'
            : 'text-zinc-600 hover:bg-zinc-100'
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}
