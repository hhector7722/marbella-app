'use client';

import React, { useState } from 'react';
import { X, Coins, Landmark } from 'lucide-react';
import { parseISO, startOfWeek } from 'date-fns';
import { cn, calculateRoundedHours } from '@/lib/utils';
import { toast } from 'sonner';
import { SpecialDayLabel } from '@/components/staff/SpecialDayLabel';
import LaborConditionsView from '@/components/profile/LaborConditionsView';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import type { HistoryWeekDto } from '@/lib/read-models/week-display-from-engine';

const EVENT_TYPES = [
    { value: 'regular', label: 'Regular' },
    { value: 'holiday', label: 'Festivo', initial: 'F', color: 'bg-red-500 text-white', text: 'text-red-500', border: 'border-red-200 bg-red-50' },
    { value: 'weekend', label: 'Enfermo', initial: 'E', color: 'bg-yellow-400 text-white', text: 'text-yellow-500', border: 'border-yellow-200 bg-yellow-50' },
    { value: 'adjustment', label: 'Baja', initial: 'B', color: 'bg-orange-500 text-white', text: 'text-orange-500', border: 'border-orange-200 bg-orange-50' },
    { value: 'personal', label: 'Personal', initial: 'P', color: 'bg-blue-500 text-white', text: 'text-blue-500', border: 'border-blue-200 bg-blue-50' },
    { value: 'no_registered', label: 'No registrado', initial: 'NR', showCross: true, color: 'bg-red-600 text-white', text: 'text-red-600', border: 'border-red-200 bg-red-50' },
];

/** Horas Marbella: solo enteros o .5 */
const fmtHours = (val: number): string => {
    if (!val || Math.abs(val) < 0.05) return '';
    const rounded = calculateRoundedHours(Math.abs(val));
    const str = rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
    return val < 0 ? `-${str}` : str;
};

const fmtMoney = (val: number): string => {
    if (!val || Math.abs(val) < 0.05) return '';
    const str = Math.abs(val).toFixed(0);
    return val < 0 ? `-${str}€` : `${str}€`;
};

const fmtDecimal = (val: number): string => fmtHours(val);

export interface WeekCardProps {
    week: HistoryWeekDto;
    filterMonth: number;
    filterYear: number;
    onDayClick: (date: string) => void;
    /** Solo manager con empleado seleccionado: muestra controles Bolsa/Pago y Contrato en el pie */
    showWeekOverrides?: boolean;
    userId?: string;
    onApplyWeekOverrides?: (
        contractedHours: number,
        preferStock: boolean,
        overtimeCostPerHour: number | null
    ) => Promise<{ success: boolean; error?: string }>;
    /**
     * Solo lectura: misma pintura que history; sin clics de día ni overrides.
     * Usado por Dashboard → Horas Extras → empleado.
     */
    readOnly?: boolean;
    /** Varias semanas en el mismo marco: el radio inferior solo en la última. */
    stacked?: boolean;
    isLast?: boolean;
    /** Historial por mes: atenúa días fuera del mes filtrado. En mosaico / semana suelta, false. */
    dimOtherMonth?: boolean;
}

export function WeekCard({
    week,
    filterMonth,
    filterYear,
    onDayClick,
    showWeekOverrides,
    userId,
    onApplyWeekOverrides,
    readOnly = false,
    stacked = false,
    isLast = true,
    dimOtherMonth = true,
}: WeekCardProps) {
    const interactive = !readOnly;
    const overridesEnabled = interactive && !!showWeekOverrides;
    const [managerOverridesOpen, setManagerOverridesOpen] = useState(false);
    const [localContracted, setLocalContracted] = useState<string>(
        week.summary.limitHours !== undefined && week.summary.limitHours !== null 
            ? String(week.summary.limitHours) 
            : ""
    );
    const [localPreferStock, setLocalPreferStock] = useState<boolean>(week.summary.preferStock ?? false);
    const [localHourlyRate, setLocalHourlyRate] = useState<string>(
        week.summary.hourlyRate !== undefined && week.summary.hourlyRate !== null
            ? String(week.summary.hourlyRate)
            : ''
    );
    const [savingOverrides, setSavingOverrides] = useState(false);
    const [contractModalOpen, setContractModalOpen] = useState(false);

    React.useEffect(() => {
        console.log('[TRACE 6] Valor recibido por el componente tras el refresh:', {
            limitHours: week.summary.limitHours,
            preferStock: week.summary.preferStock,
            hourlyRate: week.summary.hourlyRate,
        });
        setLocalPreferStock(week.summary.preferStock ?? false);
        setLocalContracted(
            week.summary.limitHours !== undefined && week.summary.limitHours !== null 
                ? String(week.summary.limitHours) 
                : ""
        );
        setLocalHourlyRate(
            week.summary.hourlyRate !== undefined && week.summary.hourlyRate !== null
                ? String(week.summary.hourlyRate)
                : ''
        );
    }, [week.summary.preferStock, week.summary.limitHours, week.summary.hourlyRate]);

    const weekStartKey = typeof week.startDate === 'string' ? week.startDate.split('T')[0] : String(week.startDate);
    React.useEffect(() => {
        setManagerOverridesOpen(false);
    }, [weekStartKey, week.weekNumber, overridesEnabled, userId]);


    const handleApplyOverrides = async () => {
        if (!interactive || !userId || !onApplyWeekOverrides) return;
        setSavingOverrides(true);
        try {
            console.log('[TRACE 1] Valor del input React justo antes de pulsar Aplicar:', {
                localContracted,
                typeofLocalContracted: typeof localContracted,
            });
            const contractedValue = localContracted === "" ? 0 : Number(localContracted);
            // Vacío = quitar override (NULL). "0" explícito = override a 0 €/h.
            const hourlyRateValue =
                localHourlyRate.trim() === ''
                    ? null
                    : Number(localHourlyRate);
            if (
                hourlyRateValue !== null &&
                (!Number.isFinite(hourlyRateValue) || hourlyRateValue < 0)
            ) {
                toast.error('Indica un coste por hora válido (≥ 0) o vacío para quitar el override');
                setSavingOverrides(false);
                return;
            }
            console.log('[TRACE 2] Payload que sale hacia updateWeeklyWorkerConfig:', {
                contractedValue,
                localPreferStock,
                hourlyRateValue,
            });
            const result = await onApplyWeekOverrides(contractedValue, localPreferStock, hourlyRateValue);
            if (!result.success && result.error) setSavingOverrides(false);
        } finally {
            setSavingOverrides(false);
        }
    };
    return (
        <>
            <div className="grid grid-cols-7 border-b border-gray-100 month-cal-week">
                {week.days.map((day, di) => {
                    const eventConfig = EVENT_TYPES.find(t => t.value === day.eventType);
                    const isSpecial = day.eventType && day.eventType !== 'regular' && day.eventType !== 'no_registered' && eventConfig;
                    // Día completo F/E/B/P (sin reloj real): nombre completo centrado.
                    const isSpecialOnly = Boolean(isSpecial && !day.clockIn);
                    const justifiedHours = Number(day.justifiedHours) || 0;
                    const hasPersonalAdd = justifiedHours > 0.05 && Boolean(day.clockIn);
                    const workedHours = hasPersonalAdd
                        ? Math.max(0, day.totalHours - justifiedHours)
                        : day.totalHours;
                    const isOtherMonth = dimOtherMonth && day.date ? (() => {
                        const y = parseInt(day.date.slice(0, 4), 10);
                        const m = parseInt(day.date.slice(5, 7), 10) - 1;
                        return m !== filterMonth || y !== filterYear;
                    })() : false;
                    const hWorkedFmt = fmtHours(workedHours);
                    const exFormatted = fmtHours(day.extraHours);

                    // TEMP DEBUG Ex. — no cambia lógica; solo traza lo que se pinta
                    if (week.startDate?.startsWith('2026-07-13') || day.extraHours > 0.05) {
                        console.log('[Ex.debug] WeekCard RENDER', {
                            ruta: '/staff/history → WeekCard',
                            weekStart: week.startDate,
                            date: day.date,
                            'day.extraHours (prop recibida)': day.extraHours,
                            'exFormatted (texto UI)': exFormatted || '(no se pinta — vacío)',
                            'summary.weeklyBalance (footer EXTRAS)': week.summary.weeklyBalance,
                            'summary.totalHours': week.summary.totalHours,
                        });
                    }

                    return (
                        <div
                            key={di}
                            onClick={interactive ? () => onDayClick(day.date) : undefined}
                            className={cn(
                                'relative flex flex-col items-center border-r border-gray-100 last:border-r-0 p-0.5 sm:p-1 month-cal-cell transition-colors',
                                'bg-white',
                                interactive ? 'cursor-pointer hover:bg-zinc-50' : 'cursor-default',
                                day.isToday && !isOtherMonth && 'bg-blue-50/10'
                            )}
                        >
                            <span className={cn("absolute top-0.5 right-0.5 z-10 text-[7px] font-normal leading-none", day.isToday && !isOtherMonth ? "text-blue-600" : (isOtherMonth ? "text-gray-400 opacity-50" : "text-gray-400"))}>
                                {day.dayNumber}
                            </span>
                            {isSpecialOnly ? (
                                <div className={cn("flex min-h-0 flex-1 items-center justify-center", isOtherMonth && "opacity-45")}>
                                    {eventConfig!.showCross ? (
                                        <X size={18} strokeWidth={2.5} className={cn(eventConfig!.text, isOtherMonth && 'opacity-60')} />
                                    ) : (
                                        <SpecialDayLabel
                                            label={eventConfig!.label}
                                            className={cn(eventConfig!.text, isOtherMonth && 'opacity-60')}
                                        />
                                    )}
                                </div>
                            ) : day.eventType === 'no_registered' ? (
                                <div className={cn("flex min-h-0 flex-1 items-center justify-center", isOtherMonth && "opacity-45")}>
                                    <X size={18} strokeWidth={2.5} className={cn("text-red-600", isOtherMonth && 'opacity-60')} />
                                </div>
                            ) : (
                                <div className={cn("month-cal-day-logs flex min-h-0 flex-1 flex-col justify-start gap-0.5 pt-2.5", isOtherMonth && "opacity-45")}>
                                    <div className="month-cal-day-clocks flex w-full flex-col items-center">
                                        <div className="flex h-[13px] items-center justify-center gap-[3px]">
                                            {day.hasLog && day.clockIn ? (
                                                <>
                                                    <div className={cn("h-[4.5px] w-[4.5px] shrink-0 rounded-full", isOtherMonth ? "bg-gray-400" : "bg-green-500")} />
                                                    <span className={cn("text-[9px] leading-none", isOtherMonth ? "text-gray-400" : "text-gray-700")}>{day.clockIn}</span>
                                                </>
                                            ) : <span className="select-none text-[9px] text-transparent">0</span>}
                                        </div>
                                        <div className="mt-px flex h-[13px] items-center justify-center gap-[3px]">
                                            {day.hasLog && day.clockOut ? (
                                                day.eventType === 'no_registered' ? (
                                                    <>
                                                        <span className="inline-flex h-[4.5px] w-[4.5px] shrink-0 items-center justify-center overflow-visible" aria-hidden>
                                                            <X size={6} strokeWidth={2.5} className={cn("shrink-0", isOtherMonth ? "text-gray-400" : "text-red-500")} />
                                                        </span>
                                                        <span className={cn("text-[9px] leading-none", isOtherMonth ? "text-gray-400" : "text-gray-700")}>{day.clockOut}</span>
                                                    </>
                                                ) : day.clock_out_show_no_registrada ? (
                                                    <span
                                                        title="Salida no registrada (olvidó fichar)"
                                                        className="inline-flex shrink-0 items-center justify-center gap-1"
                                                    >
                                                        <span className="inline-flex h-[4.5px] w-[4.5px] shrink-0 items-center justify-center overflow-visible" aria-hidden>
                                                            <X size={6} strokeWidth={2.5} className={cn("shrink-0", isOtherMonth ? "text-gray-400" : "text-red-500")} />
                                                        </span>
                                                        <span className={cn("text-[9px] leading-none", isOtherMonth ? "text-gray-400" : "text-gray-700")}>
                                                            {day.clockOut}
                                                        </span>
                                                    </span>
                                                ) : (
                                                    <>
                                                        <div className={cn("h-[4.5px] w-[4.5px] shrink-0 rounded-full", isOtherMonth ? "bg-gray-400" : "bg-red-500")} />
                                                        <span className={cn("text-[9px] leading-none", isOtherMonth ? "text-gray-400" : "text-gray-700")}>{day.clockOut}</span>
                                                    </>
                                                )
                                            ) : (
                                                <span className="select-none text-[9px] text-transparent">0</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="month-cal-day-totals mt-auto w-full shrink-0">
                                        <div className="flex h-[10px] items-center justify-between text-[7px] font-normal text-gray-400">
                                            {day.hasLog && day.clockIn && hWorkedFmt ? (
                                                <>
                                                    <span className="ml-0.5">H</span>
                                                    <span className={cn("pr-1 font-normal", isOtherMonth ? "text-gray-400" : "text-gray-800")}>
                                                        {hWorkedFmt}
                                                    </span>
                                                </>
                                            ) : null}
                                        </div>
                                        <div className="flex h-[10px] items-center justify-between text-[7px] font-normal text-gray-400">
                                            {exFormatted ? (
                                                <>
                                                    <span className="ml-0.5">Ex</span>
                                                    <span className={cn("pr-1 font-normal", isOtherMonth ? "text-gray-400" : "text-gray-800")}>{exFormatted}</span>
                                                </>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div
                data-week-footer="true"
                data-overrides={overridesEnabled ? 'true' : undefined}
                className={cn(
                    'relative z-10 flex w-full items-stretch overflow-hidden border-t border-gray-100 bg-white',
                    overridesEnabled ? 'min-h-[48px]' : 'h-[25px] min-h-[25px] max-h-[25px] py-px',
                    stacked && !isLast && 'rounded-none',
                )}
            >
                {/* «SEMANA N»: solo esta etiqueta, centrada en vertical en toda la altura de la fila */}
                <div className="flex min-h-0 min-w-0 max-w-none shrink-0 items-center self-stretch px-2">
                    {overridesEnabled ? (
                        <button
                            type="button"
                            onClick={() => setManagerOverridesOpen((o) => !o)}
                            aria-expanded={managerOverridesOpen}
                            className="flex h-full min-h-0 w-full items-center justify-start text-left rounded-none border-0 bg-transparent hover:bg-zinc-50 active:bg-zinc-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36606F] focus-visible:ring-inset"
                        >
                            <span className="whitespace-nowrap text-[9px] font-medium leading-none text-zinc-600">
                                Semana {week.weekNumber}
                            </span>
                        </button>
                    ) : (
                        <div className="flex h-full min-h-0 w-full items-center justify-start">
                            <span className="whitespace-nowrap text-[9px] font-medium leading-none text-zinc-600">
                                Semana {week.weekNumber}
                            </span>
                        </div>
                    )}
                </div>
                {/* Métricas: ocupan el hueco que deja Semana y, si hay, Pagado */}
                <div className="flex min-h-0 min-w-0 flex-1 items-center self-stretch">
                    <div className="grid w-full min-w-0 grid-cols-4 grid-rows-[auto_auto] gap-y-0">
                        <div className="row-start-1 col-start-1 flex items-end justify-center self-stretch">
                            <span className="text-[10px] font-semibold leading-none text-black tabular-nums">
                                {week.summary.totalHours > 0.05 ? fmtDecimal(week.summary.totalHours) : '\u00a0'}
                            </span>
                        </div>
                        <div className="row-start-1 col-start-2 flex items-end justify-center self-stretch">
                            {(() => {
                                const startBalance = week.summary.startBalance ?? 0;
                                const hasPending = Math.abs(startBalance) > 0.05;
                                const weekStartStr = typeof week.startDate === 'string' ? week.startDate.split('T')[0] : String(week.startDate);
                                const weekStartDate = parseISO(weekStartStr);
                                const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
                                const isFutureWeek = weekStartDate > currentWeekStart;
                                const showPending = hasPending && !isFutureWeek;
                                const colorClass = !showPending ? 'text-transparent' : startBalance >= 0 ? 'text-emerald-600' : 'text-red-600';
                                const text = showPending ? fmtDecimal(Math.abs(startBalance)) : '\u00a0';
                                return (
                                    <span className={cn('text-[10px] font-semibold leading-none tabular-nums', colorClass)}>
                                        {text}
                                    </span>
                                );
                            })()}
                        </div>
                        <div className="row-start-1 col-start-3 flex items-end justify-center self-stretch">
                            <span className="text-[10px] font-semibold leading-none text-black tabular-nums">
                                {(week.summary.weeklyBalance ?? 0) > 0.05 ? fmtDecimal(Math.abs(week.summary.weeklyBalance)) : '\u00a0'}
                            </span>
                        </div>
                        <div className="row-start-1 col-start-4 flex items-end justify-center self-stretch">
                            <span className={cn(
                                "text-[10px] font-semibold leading-none tabular-nums",
                                week.summary.estimatedValue === null || (week.summary as any).hasMissingRate
                                    ? "text-amber-600 font-bold text-[9px]"
                                    : "text-emerald-600"
                            )}>
                                {week.summary.estimatedValue === null || (week.summary as any).hasMissingRate
                                    ? 'Sin tarifa'
                                    : (week.summary.estimatedValue ?? 0) > 0.05
                                    ? fmtMoney(week.summary.estimatedValue)
                                    : '\u00a0'}
                            </span>
                        </div>
                        <div className="row-start-2 col-start-1 flex justify-center">
                            <span className="text-[8px] font-medium leading-none text-zinc-400">Horas</span>
                        </div>
                        <div className="row-start-2 col-start-2 flex justify-center">
                            <span className="text-center text-[8px] font-medium leading-none text-zinc-400">Pendientes</span>
                        </div>
                        <div className="row-start-2 col-start-3 flex justify-center">
                            <span className="text-[8px] font-medium leading-none text-zinc-400">Extras</span>
                        </div>
                        <div className="row-start-2 col-start-4 flex justify-center">
                            <span className="text-[8px] font-medium leading-none text-zinc-400">Importe</span>
                        </div>
                    </div>
                </div>
                {week.summary.isPaid ? (
                    <div
                        data-week-paid="true"
                        className="flex h-full shrink-0 items-center justify-center self-stretch"
                    >
                        <img
                            src="/sello/pagado.png"
                            alt="PAGADO"
                            className="pointer-events-none h-auto w-[48px] md:w-[56px]"
                        />
                    </div>
                ) : null}
            </div>

            {overridesEnabled && managerOverridesOpen && userId && onApplyWeekOverrides && (
                <div className="bg-zinc-50 border-t border-gray-100 flex flex-wrap items-center gap-2 px-3 py-2 shrink-0">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[7px] font-black text-zinc-500 uppercase tracking-widest">Overtime</span>
                        <div className="flex bg-zinc-200 p-0.5 rounded-lg">
                            <button
                                type="button"
                                onClick={() => setLocalPreferStock(false)}
                                className={cn(
                                    "flex items-center gap-1 px-2 py-1 rounded text-[8px] font-black transition-all",
                                    !localPreferStock ? "bg-white text-emerald-600 shadow" : "text-zinc-500"
                                )}
                            >
                                <Coins size={10} />
                                PAGO
                            </button>
                            <button
                                type="button"
                                onClick={() => setLocalPreferStock(true)}
                                className={cn(
                                    "flex items-center gap-1 px-2 py-1 rounded text-[8px] font-black transition-all",
                                    localPreferStock ? "bg-white text-blue-600 shadow" : "text-zinc-500"
                                )}
                            >
                                <Landmark size={10} />
                                BOLSA
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-[7px] font-black text-zinc-500 uppercase tracking-widest">Contrato</span>
                        <input
                            type="number"
                            readOnly
                            value={localContracted}
                            className="w-10 h-6 text-center text-[10px] font-black bg-zinc-100 border border-zinc-200 rounded text-zinc-500 cursor-not-allowed"
                            title="Ver/Editar contrato en Condiciones Laborales"
                        />
                        <span className="text-[8px] text-zinc-400 font-bold">H</span>
                        <button
                            type="button"
                            onClick={() => setContractModalOpen(true)}
                            className="px-1.5 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-[8px] font-black uppercase tracking-wider transition-colors shrink-0"
                        >
                            Contrato
                        </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-[7px] font-black text-zinc-500 uppercase tracking-widest">€/H</span>
                        <input
                            type="number"
                            min={0}
                            step={0.01}
                            inputMode="decimal"
                            value={localHourlyRate}
                            onChange={(e) => setLocalHourlyRate(e.target.value)}
                            className="w-12 h-6 text-center text-[10px] font-black bg-white border border-zinc-200 rounded focus:outline-none focus:ring-1 focus:ring-[#36606F]"
                            aria-label="Coste por hora de extras"
                        />
                    </div>
                    <Button
                        type="button"
                        variant="primary"
                        instance="staff-week-apply-overrides"
                        onClick={handleApplyOverrides}
                        disabled={savingOverrides}
                        loading={savingOverrides}
                        loadingLabel="…"
                        className="ml-auto"
                    >
                        Aplicar
                    </Button>
                </div>
            )}

            {userId && (
                <Modal
                    open={contractModalOpen}
                    onClose={() => setContractModalOpen(false)}
                    variant="amplify"
                    layer="base"
                    instance="staff-condiciones-laborales"
                    title="Condiciones Laborales y Contrato"
                    wrapperClassName="max-w-3xl"
                >
                    <div>
                        <LaborConditionsView
                            employeeId={userId}
                            onSaveSuccess={async () => {
                                setContractModalOpen(false);
                                if (onApplyWeekOverrides) {
                                    const contractedValue = localContracted === "" ? 0 : Number(localContracted);
                                    const hourlyRateValue = localHourlyRate.trim() === '' ? null : Number(localHourlyRate);
                                    await onApplyWeekOverrides(contractedValue, localPreferStock, hourlyRateValue);
                                }
                            }}
                            onClose={() => setContractModalOpen(false)}
                        />
                    </div>
                </Modal>
            )}
        </>
    );
}
