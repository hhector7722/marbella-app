'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { format, isSameDay, addDays, parseISO, getISOWeek } from 'date-fns';
import { cn, calculateRoundedHours } from '@/lib/utils';
import { QuickCalculatorModal, FloatingCalculatorFab } from '@/components/ui/QuickCalculatorModal';
import { es } from 'date-fns/locale';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { toast } from 'sonner';
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking';
import { overtimeWorkerHistoryUsageLabel } from '@/lib/usage/modal-apply';
import { getWeekDetailDto } from '@/app/actions/history-read';

// --- TYPES ---
interface DailyLog {
    date: Date;
    dayName: string;
    dayNumber: number;
    hasLog: boolean;
    clockIn: string;
    clockOut: string;
    totalHours: number;
    extraHours: number;
    isToday: boolean;
}

interface WeeklyData {
    weekNumber: number;
    startDate: Date;
    endDate: Date;
    days: DailyLog[];
    summary: {
        totalHours: number;
        weeklyBalance: number;
        estimatedValue: number;
        startBalance: number;
        finalBalance: number;
        isPaid: boolean;
        contractedHours: number;
        preferStock?: boolean;
    };
}

interface WorkerWeeklyHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    workerId: string;
    weekStart: string; // ISO Date string (yyyy-MM-dd) of the Monday
}

// --- VISUAL HELPERS (idénticos a WeekCard / StaffDashboardView) ---
/** Horas Marbella: solo enteros o .5 */
const fmtDecimal = (val: number): string => {
    if (!val || Math.abs(val) < 0.05) return ' ';
    const rounded = calculateRoundedHours(Math.abs(val));
    const str = rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
    return val < 0 ? `-${str}` : str;
};

const fmtMoney = (val: number): string => {
    if (!val || Math.abs(val) < 0.05) return ' ';
    const str = Math.abs(val).toFixed(0);
    return val < 0 ? `-${str}€` : `${str}€`;
};

const formatWorked = (val: number) => fmtDecimal(Math.abs(val));

export default function WorkerWeeklyHistoryModal({ isOpen, onClose, workerId, weekStart }: WorkerWeeklyHistoryModalProps) {
    const [loading, setLoading] = useState(true);
    const [weekData, setWeekData] = useState<WeeklyData | null>(null);
    const [workerName, setWorkerName] = useState('');
    const [calculatorOpen, setCalculatorOpen] = useState(false);

    const trackingLabel = useMemo(() => {
        if (!isOpen || !weekStart) return 'Historial trabajador horas extras';
        const weekNumber = (() => {
            const [y, m, d] = weekStart.split('T')[0].split('-').map(Number);
            if (!y || !m || !d) return undefined;
            return getISOWeek(new Date(y, m - 1, d));
        })();
        return overtimeWorkerHistoryUsageLabel(workerName || 'Trabajador', weekStart, weekNumber);
    }, [isOpen, weekStart, workerName]);

    useModalUsageTracking({
        open: isOpen,
        usageId: 'overtime-worker-history',
        usageLabel: trackingLabel,
    });

    useEffect(() => {
        if (isOpen && workerId && weekStart) {
            void fetchWeekData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, workerId, weekStart]);

    async function fetchWeekData() {
        setLoading(true);
        try {
            const mondayISO = weekStart.split('T')[0]!;
            const res = await getWeekDetailDto({ userId: workerId, weekStart: mondayISO });
            if (!res.success) {
                toast.error(res.error || 'No se pudo cargar la semana');
                setWeekData(null);
                return;
            }

            setWorkerName(res.workerName);
            const mondayDate = parseISO(mondayISO);
            const sundayDate = addDays(mondayDate, 6);
            const today = new Date();

            const days: DailyLog[] = res.days.map((d) => {
                const date = parseISO(d.date);
                return {
                    date,
                    dayName: format(date, 'EEE', { locale: es }),
                    dayNumber: date.getDate(),
                    hasLog: d.hasLog,
                    clockIn: d.clockIn ?? '',
                    clockOut: d.clockOut ?? '',
                    totalHours: d.totalHours,
                    extraHours: d.extraHours,
                    isToday: isSameDay(date, today),
                };
            });

            setWeekData({
                weekNumber: getISOWeek(mondayDate),
                startDate: mondayDate,
                endDate: sundayDate,
                days,
                summary: {
                    totalHours: res.summary.totalHours,
                    weeklyBalance: res.summary.weeklyBalance,
                    estimatedValue: res.summary.estimatedValue,
                    startBalance: res.summary.startBalance,
                    finalBalance: res.summary.finalBalance,
                    isPaid: res.summary.isPaid,
                    contractedHours: res.summary.limitHours,
                    preferStock: res.summary.preferStock,
                },
            });
        } catch (error) {
            console.error(error);
            toast.error('Error al cargar historial');
        } finally {
            setLoading(false);
        }
    }

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
                <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between shrink-0 bg-white z-10">
                    <div>
                        <h3 className="text-lg font-black text-zinc-900 tracking-tight">{workerName || '…'}</h3>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                            {weekData
                                ? `Semana ${weekData.weekNumber} · ${format(weekData.startDate, "d MMM", { locale: es })} – ${format(weekData.endDate, "d MMM", { locale: es })}`
                                : 'Cargando…'}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-zinc-100 text-zinc-400 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {loading ? (
                        <div className="py-20 flex justify-center"><LoadingSpinner size="lg" className="text-zinc-900" /></div>
                    ) : weekData ? (
                        <>
                            <div className="grid grid-cols-7 gap-1">
                                {weekData.days.map((day) => (
                                    <div
                                        key={day.date.toISOString()}
                                        className={cn(
                                            'rounded-xl border p-1.5 min-h-[72px] flex flex-col items-center gap-0.5',
                                            day.isToday ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-100 bg-white',
                                        )}
                                    >
                                        <span className="text-[9px] font-black text-zinc-400 uppercase">{day.dayName}</span>
                                        <span className="text-sm font-black text-zinc-900">{day.dayNumber}</span>
                                        {day.hasLog ? (
                                            <>
                                                <span className="text-[9px] font-mono text-zinc-600">{day.clockIn}</span>
                                                <span className="text-[9px] font-mono text-zinc-600">{day.clockOut || '—'}</span>
                                                <span className="text-[10px] font-bold text-zinc-900">{formatWorked(day.totalHours)}</span>
                                            </>
                                        ) : (
                                            <span className="text-[9px] text-zinc-300 mt-2">—</span>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-4 gap-2">
                                <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-3 text-center">
                                    <div className="text-[9px] font-black text-zinc-400 uppercase">Horas</div>
                                    <div className="text-lg font-black text-zinc-900">{fmtDecimal(weekData.summary.totalHours)}</div>
                                </div>
                                <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-3 text-center">
                                    <div className="text-[9px] font-black text-zinc-400 uppercase">Pend.</div>
                                    <div className="text-lg font-black text-zinc-900">{fmtDecimal(weekData.summary.startBalance)}</div>
                                </div>
                                <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-3 text-center">
                                    <div className="text-[9px] font-black text-zinc-400 uppercase">Extras</div>
                                    <div className="text-lg font-black text-emerald-600">{fmtDecimal(weekData.summary.weeklyBalance)}</div>
                                </div>
                                <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-3 text-center">
                                    <div className="text-[9px] font-black text-zinc-400 uppercase">Importe</div>
                                    <div className="text-lg font-black text-zinc-900">
                                        {weekData.summary.preferStock ? ' ' : fmtMoney(weekData.summary.estimatedValue)}
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <p className="text-center text-sm text-zinc-500 py-10">Sin datos</p>
                    )}
                </div>
            </div>
            <FloatingCalculatorFab
                isOpen={calculatorOpen}
                onToggle={() => setCalculatorOpen(true)}
            />
            <QuickCalculatorModal
                isOpen={calculatorOpen}
                onClose={() => setCalculatorOpen(false)}
            />
        </div>,
        document.body,
    );
}
