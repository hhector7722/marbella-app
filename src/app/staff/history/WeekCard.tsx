'use client';

import React, { useState } from 'react';
import { X, Coins, Landmark, Save } from 'lucide-react';
import { parseISO, startOfWeek } from 'date-fns';
import { cn, calculateRoundedHours } from '@/lib/utils';
import { toast } from 'sonner';
import { SpecialDayLabel } from '@/components/staff/SpecialDayLabel';

const DAY_HEADERS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];

const EVENT_TYPES = [
    { value: 'regular', label: 'Regular' },
    { value: 'holiday', label: 'Festivo', initial: 'F', color: 'bg-red-500 text-white', text: 'text-red-500', border: 'border-red-200 bg-red-50' },
    { value: 'weekend', label: 'Enfermedad', initial: 'E', color: 'bg-yellow-400 text-white', text: 'text-yellow-500', border: 'border-yellow-200 bg-yellow-50' },
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

interface DayData {
    date: string;
    dayName: string;
    dayNumber: number;
    hasLog: boolean;
    clockIn: string | null;
    clockOut: string | null;
    clock_out_show_no_registrada?: boolean;
    totalHours: number;
    extraHours: number;
    eventType: string;
    isToday: boolean;
    /** Horas personales acreditadas (examen/permiso) en el mismo fichaje. */
    justifiedHours?: number;
}

interface WeekSummary {
    totalHours: number;
    startBalance: number;
    weeklyBalance: number;
    finalBalance: number;
    estimatedValue: number;
    isPaid: boolean;
    preferStock?: boolean;
    limitHours?: number;
    hourlyRate?: number;
}

interface WeekCardProps {
    week: { weekNumber: number; startDate: string; days: DayData[]; summary: WeekSummary };
    idx: number;
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
}

export function WeekCard({ week, idx, filterMonth, filterYear, onDayClick, showWeekOverrides, userId, onApplyWeekOverrides }: WeekCardProps) {
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

    React.useEffect(() => {
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
    }, [weekStartKey, week.weekNumber, showWeekOverrides, userId]);


    const handleApplyOverrides = async () => {
        if (!userId || !onApplyWeekOverrides) return;
        setSavingOverrides(true);
        try {
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
            const result = await onApplyWeekOverrides(contractedValue, localPreferStock, hourlyRateValue);
            if (!result.success && result.error) setSavingOverrides(false);
        } finally {
            setSavingOverrides(false);
        }
    };
    return (
        <div className="rounded-xl border border-zinc-200 shadow-[0_2px_10px_rgba(0,0,0,0.08)] overflow-hidden bg-white">
            {idx === 0 && (
                <div className="rounded-t-2xl overflow-hidden">
                    <div className="grid grid-cols-7 border-b border-gray-100">
                        {DAY_HEADERS.map((d) => (
                            <div
                                key={d}
                                className="h-5 bg-gradient-to-b from-red-500 to-red-600 flex items-center justify-center shadow-sm border-r border-white/30 last:border-r-0"
                            >
                                <span className="text-[9px] font-bold text-white uppercase tracking-wider block truncate px-0.5 drop-shadow-sm">
                                    {d}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-7 border-b border-gray-100">
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
                    const isOtherMonth = day.date ? (() => {
                        const y = parseInt(day.date.slice(0, 4), 10);
                        const m = parseInt(day.date.slice(5, 7), 10) - 1;
                        return m !== filterMonth || y !== filterYear;
                    })() : false;
                    const hWorkedFmt = fmtHours(workedHours);
                    const hJustFmt = fmtHours(justifiedHours);
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
                            onClick={() => onDayClick(day.date)}
                            className={cn(
                                "relative border-r border-gray-100 last:border-r-0 min-h-[85px] flex flex-col items-center p-1 pb-1 cursor-pointer transition-colors",
                                "bg-white hover:bg-zinc-50",
                                day.isToday && !isOtherMonth && "bg-blue-50/10"
                            )}
                        >
                            <span className={cn("absolute top-1 right-1 text-[9px] font-bold", day.isToday && !isOtherMonth ? "text-blue-600" : (isOtherMonth ? "text-gray-400 opacity-50" : "text-gray-400"))}>
                                {day.dayNumber}
                            </span>
                            <div className={cn("flex-1 flex flex-col items-stretch justify-center mt-3 w-full min-h-[52px]", isOtherMonth && "opacity-45")}>
                                {isSpecialOnly ? (
                                    <div className="flex min-h-[52px] w-full min-w-0 flex-1 items-center justify-center">
                                        {eventConfig!.showCross ? (
                                            <X size={22} strokeWidth={2.5} className={cn(eventConfig!.text, isOtherMonth && 'opacity-60')} />
                                        ) : (
                                            <SpecialDayLabel
                                                label={eventConfig!.label}
                                                className={cn(eventConfig!.text, isOtherMonth && 'opacity-60')}
                                            />
                                        )}
                                    </div>
                                ) : (
                                    <>
                                        <div className="h-5 flex items-center justify-center gap-1 shrink-0">
                                            {day.hasLog && day.clockIn ? (
                                                <>
                                                    <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", isOtherMonth ? "bg-gray-400" : "bg-green-500")} />
                                                    <span className={cn("text-[9px] font-mono leading-none", isOtherMonth ? "text-gray-400" : "text-gray-700")}>{day.clockIn}</span>
                                                </>
                                            ) : <span className="text-[9px] text-transparent select-none">0</span>}
                                        </div>
                                        <div className="h-5 flex items-center justify-center gap-1 shrink-0">
                                            {day.hasLog && day.clockOut ? (
                                                day.eventType === 'no_registered' ? (
                                                    <>
                                                        <span className="inline-flex h-1.5 w-1.5 shrink-0 items-center justify-center overflow-visible" aria-hidden>
                                                            <X size={8} strokeWidth={2.5} className={cn("shrink-0", isOtherMonth ? "text-gray-400" : "text-red-500")} />
                                                        </span>
                                                        <span className={cn("text-[9px] font-mono leading-none", isOtherMonth ? "text-gray-400" : "text-gray-700")}>{day.clockOut}</span>
                                                    </>
                                                ) : day.clock_out_show_no_registrada ? (
                                                    <span
                                                        title="Salida no registrada (olvidó fichar)"
                                                        className="inline-flex items-center justify-center gap-1 shrink-0"
                                                    >
                                                        <span className="inline-flex h-1.5 w-1.5 shrink-0 items-center justify-center overflow-visible" aria-hidden>
                                                            <X size={8} strokeWidth={2.5} className={cn("shrink-0", isOtherMonth ? "text-gray-400" : "text-red-500")} />
                                                        </span>
                                                        <span className={cn("text-[9px] font-mono leading-none", isOtherMonth ? "text-gray-400" : "text-gray-700")}>
                                                            {day.clockOut}
                                                        </span>
                                                    </span>
                                                ) : (
                                                    <>
                                                        <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", isOtherMonth ? "bg-gray-400" : "bg-red-500")} />
                                                        <span className={cn("text-[9px] font-mono leading-none", isOtherMonth ? "text-gray-400" : "text-gray-700")}>{day.clockOut}</span>
                                                    </>
                                                )
                                            ) : (day.hasLog && !day.clockOut && day.isToday) ? (
                                                <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse shrink-0" />
                                            ) : (
                                                <span className="text-[9px] text-transparent select-none">0</span>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                            {!isSpecialOnly && (
                                <div className={cn("w-full space-y-0 mt-0.5 shrink-0 min-h-[36px]", isOtherMonth && "opacity-45")}>
                                    {/* Slot fijo P → H → Ex: vacío reserva h-3 para no desplazar filas */}
                                    <div className="flex justify-between items-center text-[8px] text-gray-400 h-3">
                                        {hasPersonalAdd && hJustFmt ? (
                                            <>
                                                <span className="ml-0.5">P</span>
                                                <span className={cn("font-bold pr-1", isOtherMonth ? "text-gray-400" : "text-blue-500")}>
                                                    {hJustFmt}
                                                </span>
                                            </>
                                        ) : null}
                                    </div>
                                    <div className="flex justify-between items-center text-[8px] text-gray-400 h-3">
                                        {day.hasLog && day.clockIn && hWorkedFmt ? (
                                            <>
                                                <span className="ml-0.5">H</span>
                                                <span className={cn("font-bold pr-1", isOtherMonth ? "text-gray-400" : "text-gray-800")}>
                                                    {hWorkedFmt}
                                                </span>
                                            </>
                                        ) : null}
                                    </div>
                                    <div className="flex justify-between items-center text-[8px] text-gray-400 h-3">
                                        {exFormatted ? (
                                            <>
                                                <span className="ml-0.5">Ex</span>
                                                <span className={cn("font-bold pr-1", isOtherMonth ? "text-gray-400" : "text-gray-800")}>{exFormatted}</span>
                                            </>
                                        ) : null}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div
                className={cn(
                    'bg-white border-t border-gray-100 relative z-10 flex w-full items-stretch pr-14 md:pr-16',
                    showWeekOverrides ? 'min-h-[48px]' : 'min-h-8 py-0.5'
                )}
            >
                {week.summary.isPaid && (
                    <img
                        src="/sello/pagado.png"
                        alt="PAGADO"
                        className="absolute right-0.5 top-1/2 -translate-y-1/2 w-[48px] h-auto z-30 pointer-events-none md:w-[56px]"
                    />
                )}
                {/* «SEMANA N»: solo esta etiqueta, centrada en vertical en toda la altura de la fila */}
                <div className="flex min-h-0 shrink-0 items-center self-stretch pl-3 min-w-[6.5rem]">
                    {showWeekOverrides ? (
                        <button
                            type="button"
                            onClick={() => setManagerOverridesOpen((o) => !o)}
                            aria-expanded={managerOverridesOpen}
                            className="flex h-full min-h-0 w-full items-center justify-start text-left rounded-none border-0 bg-transparent hover:bg-zinc-50 active:bg-zinc-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36606F] focus-visible:ring-inset"
                        >
                            <span className="font-black text-[11px] md:text-[12px] uppercase leading-none text-zinc-600 whitespace-nowrap">
                                SEMANA {week.weekNumber}
                            </span>
                        </button>
                    ) : (
                        <div className="flex h-full min-h-0 w-full items-center justify-start">
                            <span className="font-black text-[11px] md:text-[12px] uppercase leading-none text-zinc-600 whitespace-nowrap">
                                SEMANA {week.weekNumber}
                            </span>
                        </div>
                    )}
                </div>
                {/* Métricas: bloque aparte, centrado en vertical en la fila */}
                <div className="flex min-h-0 min-w-0 flex-1 items-center self-stretch">
                    <div className="grid w-full grid-cols-4 grid-rows-[auto_auto] gap-y-0.5">
                        <div className="row-start-1 col-start-1 flex items-end justify-center self-stretch">
                            <span className="pb-0.5 text-[11px] md:text-[12px] font-black leading-none text-black tabular-nums">
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
                                    <span className={cn('pb-0.5 text-[11px] md:text-[12px] font-black leading-none tabular-nums', colorClass)}>
                                        {text}
                                    </span>
                                );
                            })()}
                        </div>
                        <div className="row-start-1 col-start-3 flex items-end justify-center self-stretch">
                            <span className="pb-0.5 text-[11px] md:text-[12px] font-black leading-none text-black tabular-nums">
                                {(week.summary.weeklyBalance ?? 0) > 0.05 ? fmtDecimal(Math.abs(week.summary.weeklyBalance)) : '\u00a0'}
                            </span>
                        </div>
                        <div className="row-start-1 col-start-4 flex items-end justify-center self-stretch">
                            <span className="pb-0.5 text-[11px] md:text-[12px] font-black leading-none text-emerald-600 tabular-nums">
                                {(week.summary.estimatedValue ?? 0) > 0.05 && week.summary.preferStock !== true
                                    ? fmtMoney(week.summary.estimatedValue)
                                    : '\u00a0'}
                            </span>
                        </div>
                        <div className="row-start-2 col-start-1 flex justify-center">
                            <span className="text-[7px] text-zinc-400 font-black leading-none uppercase tracking-tighter">HORAS</span>
                        </div>
                        <div className="row-start-2 col-start-2 flex justify-center">
                            <span className="text-[7px] text-zinc-400 font-black leading-none uppercase tracking-tighter text-center">PENDIENTES</span>
                        </div>
                        <div className="row-start-2 col-start-3 flex justify-center">
                            <span className="text-[7px] text-zinc-400 font-black leading-none uppercase tracking-tighter">EXTRAS</span>
                        </div>
                        <div className="row-start-2 col-start-4 flex justify-center">
                            <span className="text-[7px] text-zinc-400 font-black leading-none uppercase tracking-tighter">IMPORTE</span>
                        </div>
                    </div>
                </div>
            </div>

            {showWeekOverrides && managerOverridesOpen && userId && onApplyWeekOverrides && (
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
                            min={0}
                            step={0.5}
                            value={localContracted}
                            onChange={(e) => setLocalContracted(e.target.value)}
                            className="w-10 h-6 text-center text-[10px] font-black bg-white border border-zinc-200 rounded focus:outline-none focus:ring-1 focus:ring-[#36606F]"
                        />
                        <span className="text-[8px] text-zinc-400 font-bold">H</span>
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
                    <button
                        type="button"
                        onClick={handleApplyOverrides}
                        disabled={savingOverrides}
                        className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[8px] font-black uppercase tracking-widest disabled:opacity-50"
                    >
                        {savingOverrides ? (
                            <span className="animate-pulse">...</span>
                        ) : (
                            <>
                                <Save size={10} />
                                Aplicar
                            </>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
}
