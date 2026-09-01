'use client';

import { Fragment } from 'react';
import { MonthCalendarFrame } from '@/components/time/MonthCalendarFrame';
import { WeekCard, type WeekCardProps } from '@/app/staff/history/WeekCard';

export type WeekSummaryWeek = WeekCardProps['week'];

type WeekSummaryProps = {
    weeks: WeekSummaryWeek[];
    filterMonth: number;
    filterYear: number;
    onDayClick: (date: string) => void;
    /** Mosaico Staff: sin franja ni tarjeta interior; el hueco ya es el canto. */
    flush?: boolean;
    /** Aténúa días fuera del mes del filtro (historial mensual). Desactivar en semana suelta. */
    dimOtherMonth?: boolean;
    readOnly?: boolean;
    showWeekOverrides?: boolean;
    userId?: string;
    onApplyWeekOverrides?: (
        week: WeekSummaryWeek,
        contractedHours: number,
        preferStock: boolean,
        overtimeCostPerHour: number | null,
    ) => Promise<{ success: boolean; error?: string }>;
};

/**
 * Un solo resumen semanal: historial, mosaico Staff y modal de horas extras.
 * Los datos son HistoryWeekDto (Hours Engine). Varias semanas se apilan
 * con una sola franja L–D; el radio inferior lo recorta el marco en la última.
 */
export function WeekSummary({
    weeks,
    filterMonth,
    filterYear,
    onDayClick,
    flush = false,
    dimOtherMonth = true,
    readOnly = false,
    showWeekOverrides = false,
    userId,
    onApplyWeekOverrides,
}: WeekSummaryProps) {
    const stacked = weeks.length > 1;

    return (
        <MonthCalendarFrame
            flush={flush}
            data-week-summary="true"
            data-stacked={stacked ? 'true' : undefined}
        >
            <div className="month-cal-weeks">
                {weeks.map((week, index) => (
                    <Fragment key={week.startDate || week.weekNumber}>
                        {stacked && index > 0 ? (
                            <div data-week-divider="true" role="separator" />
                        ) : null}
                        <WeekCard
                            week={week}
                            filterMonth={filterMonth}
                            filterYear={filterYear}
                            onDayClick={onDayClick}
                            readOnly={readOnly}
                            showWeekOverrides={showWeekOverrides}
                            userId={userId}
                            isLast={index === weeks.length - 1}
                            stacked={stacked}
                            dimOtherMonth={dimOtherMonth}
                            onApplyWeekOverrides={
                                onApplyWeekOverrides
                                    ? (contractedHours, preferStock, overtimeCostPerHour) =>
                                          onApplyWeekOverrides(
                                              week,
                                              contractedHours,
                                              preferStock,
                                              overtimeCostPerHour,
                                          )
                                    : undefined
                            }
                        />
                    </Fragment>
                ))}
            </div>
        </MonthCalendarFrame>
    );
}
