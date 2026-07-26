'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, DateField } from '@/components/mds'
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
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking'
import { useTrackModalApply } from '@/hooks/useTrackModalApply'
import { formatMonthYearParts, formatYmdShort, periodRangeSummary } from '@/lib/usage/modal-apply'

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
  usageId = 'insights-date-picker',
  usageLabel = 'Selector fecha insights',
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
  usageId?: string
  usageLabel?: string
}) {
  useModalUsageTracking({ open, usageId, usageLabel })

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[10060] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className={cn(
          'z-[10061] w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl border border-mds-border bg-mds-surface p-4 shadow-xl',
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
        className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-xl border border-mds-border text-mds-muted hover:bg-mds-muted-surface"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="text-xs font-black uppercase tracking-wide text-mds-foreground">{label}</span>
      <button
        type="button"
        onClick={onNext}
        aria-label="Siguiente"
        className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-xl border border-mds-border text-mds-muted hover:bg-mds-muted-surface"
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
  selectedMonths,
  selectedDay,
  periodFrom,
  periodTo,
  onSelectWeek,
  onSelectMonths,
  onSelectDay,
  onApplyPeriod,
}: {
  mode: InsightsFilterMode
  openPicker: InsightsFilterMode | null
  onOpenPicker: (m: InsightsFilterMode) => void
  onClosePicker: () => void
  selectedWeekMonday: string
  selectedMonths: InsightsMonth[]
  selectedDay: string
  periodFrom: string
  periodTo: string
  onSelectWeek: (monday: string) => void
  onSelectMonths: (months: InsightsMonth[]) => void
  onSelectDay: (ymd: string) => void
  onApplyPeriod: (from: string, to: string) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const trackWeekApply = useTrackModalApply('insights-date-week', 'Selector semana insights')
  const trackDayApply = useTrackModalApply('insights-date-day', 'Selector día insights')
  const trackPeriodApply = useTrackModalApply('insights-date-period', 'Selector periodo insights')
  useClickOutside(rootRef, onClosePicker, openPicker !== null)

  const [weekView, setWeekView] = useViewMonthFromYmd(selectedWeekMonday)
  const [dayView, setDayView] = useViewMonthFromYmd(selectedDay)
  const [monthViewYear, setMonthViewYear] = useState(
    selectedMonths[0]?.year ?? new Date().getFullYear()
  )
  const [draftMonths, setDraftMonths] = useState<InsightsMonth[]>(selectedMonths)
  const [periodDraftFrom, setPeriodDraftFrom] = useState(periodFrom)
  const [periodDraftTo, setPeriodDraftTo] = useState(periodTo)

  useEffect(() => {
    if (openPicker === 'periodo') {
      setPeriodDraftFrom(periodFrom)
      setPeriodDraftTo(periodTo)
    }
  }, [openPicker, periodFrom, periodTo])

  useEffect(() => {
    if (openPicker === 'mes') setDraftMonths(selectedMonths)
  }, [openPicker])

  useEffect(() => {
    if (selectedMonths.length > 0) {
      setMonthViewYear(selectedMonths[0].year)
    }
  }, [selectedMonths])

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
    if (mode === 'mes') {
      if (selectedMonths.length === 0) return 'Mes'
      if (selectedMonths.length === 1) return MONTH_NAMES_ES[selectedMonths[0].month - 1]!
      return `${selectedMonths.length} meses`
    }
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
                ? 'bg-mds-primary text-mds-primary-foreground border-mds-primary'
                : 'bg-mds-surface text-mds-muted border-mds-border hover:bg-mds-muted-surface'
            )}
          >
            {modeLabel(m)}
          </button>

          <PickerShell
            open={openPicker === m}
            onClose={onClosePicker}
            className={m === 'periodo' ? 'sm:min-w-[20rem]' : undefined}
            usageId={
              m === 'sem'
                ? 'insights-date-week'
                : m === 'mes'
                  ? 'insights-date-month'
                  : m === 'dia'
                    ? 'insights-date-day'
                    : 'insights-date-period'
            }
            usageLabel={
              m === 'sem'
                ? 'Selector semana insights'
                : m === 'mes'
                  ? 'Selector mes insights'
                  : m === 'dia'
                    ? 'Selector día insights'
                    : 'Selector periodo insights'
            }
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
                    <span key={w} className="text-[9px] font-bold text-mds-muted text-center">
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
                        onClick={() => {
                          trackWeekApply(`Semana ${isoWeekNumber(row.monday)} (${row.monday})`, {
                            weekMonday: row.monday,
                          })
                          onSelectWeek(row.monday)
                        }}
                        className={cn(
                          'w-full grid grid-cols-7 gap-1 rounded-xl px-1 py-1.5 transition-colors',
                          'hover:bg-mds-primary/10',
                          selectedWeekMonday === row.monday && 'bg-mds-primary/15 ring-1 ring-mds-primary/40'
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
                                muted ? 'text-mds-muted' : 'text-mds-foreground',
                                selectedWeekMonday === row.monday && !muted && 'text-mds-primary'
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
                    const active = draftMonths.some(
                      (pm) => pm.year === fm.year && pm.month === fm.month
                    )
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => {
                          setDraftMonths((prev) => {
                            const exists = prev.some(
                              (pm) => pm.year === fm.year && pm.month === fm.month
                            )
                            if (exists) return prev.filter(
                              (pm) => pm.year !== fm.year || pm.month !== fm.month
                            )
                            return [...prev, fm]
                          })
                        }}
                        className={cn(
                          'min-h-11 rounded-xl text-xs font-black border transition-colors',
                          active
                            ? 'bg-mds-primary text-mds-primary-foreground border-mds-primary'
                            : 'bg-mds-surface text-mds-foreground border-mds-border hover:bg-mds-muted-surface'
                        )}
                      >
                        {name.slice(0, 3)}
                      </button>
                    )
                  })}
                </div>
                <div className="flex items-center justify-end gap-2 mt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-9 px-3 text-[10px] uppercase tracking-wider"
                    onClick={() => setDraftMonths([])}
                  >
                    Limpiar
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    className="min-h-9 px-4 text-[10px] uppercase tracking-wide"
                    onClick={() => {
                      if (draftMonths.length === 0) return
                      onSelectMonths(draftMonths)
                    }}
                  >
                    Aplicar
                  </Button>
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
                    <span key={w} className="text-[9px] font-bold text-mds-muted text-center">
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
                        onClick={() => {
                          trackDayApply(formatYmdShort(d), { selectedDate: d })
                          onSelectDay(d)
                        }}
                        className={cn(
                          'min-h-10 rounded-xl text-xs font-black tabular-nums transition-colors',
                          active
                            ? 'bg-mds-primary text-mds-primary-foreground'
                            : 'text-mds-foreground hover:bg-mds-muted-surface'
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
                <DateField
                  label="Desde"
                  value={periodDraftFrom}
                  onChange={(e) => setPeriodDraftFrom(e.target.value)}
                />
                <DateField
                  label="Hasta"
                  value={periodDraftTo}
                  onChange={(e) => setPeriodDraftTo(e.target.value)}
                />
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => {
                    trackPeriodApply(periodRangeSummary(periodDraftFrom, periodDraftTo), {
                      periodFrom: periodDraftFrom,
                      periodTo: periodDraftTo,
                    })
                    onApplyPeriod(periodDraftFrom, periodDraftTo)
                  }}
                >
                  Aplicar
                </Button>
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
  const trackFinancialMonth = useTrackModalApply('insights-financial-month', 'Mes financiero insights')
  const handleChange = (fm: InsightsMonth) => {
    trackFinancialMonth(formatInsightsMonthLabel(fm), {
      filterYear: String(fm.year),
      filterMonth: String(fm.month),
    })
    onChange(fm)
  }
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={() => handleChange(shiftInsightsMonth(month, -1))}
        aria-label="Mes anterior"
        className={cn(
          'inline-flex items-center justify-center rounded-lg active:scale-95',
          onDark ? 'min-h-7 min-w-7' : 'min-h-9 min-w-9',
          onDark
            ? 'text-mds-primary-foreground hover:bg-mds-surface/15'
            : 'text-mds-muted hover:bg-mds-muted-surface'
        )}
      >
        <ChevronLeft className={onDark ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      </button>
      <span
        className={cn(
          'text-[10px] lg:text-xs font-black uppercase tracking-wide whitespace-nowrap px-1',
          onDark ? 'text-mds-primary-foreground' : 'text-mds-primary'
        )}
      >
        {formatInsightsMonthLabel(month)}
      </span>
      <button
        type="button"
        onClick={() => handleChange(shiftInsightsMonth(month, 1))}
        aria-label="Mes siguiente"
        className={cn(
          'inline-flex items-center justify-center rounded-lg active:scale-95',
          onDark ? 'min-h-7 min-w-7' : 'min-h-9 min-w-9',
          onDark
            ? 'text-mds-primary-foreground hover:bg-mds-surface/15'
            : 'text-mds-muted hover:bg-mds-muted-surface'
        )}
      >
        <ChevronRight className={onDark ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      </button>
    </div>
  )
}
