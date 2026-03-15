'use client';

import {
    ArrowLeft, ChevronLeft, ChevronRight, Check, Circle, X
} from 'lucide-react';
import React, { memo, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, addMonths, subMonths, getISOWeek, addDays, eachDayOfInterval, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { getOvertimeData, togglePaidStatus, togglePreferStockStatus, type WeeklyStats } from '@/app/actions/overtime';
import { cn } from '@/lib/utils';
import WorkerWeeklyHistoryModal from '@/components/WorkerWeeklyHistoryModal';

// REGLA ZERO-DISPLAY: En vistas de lectura, cualquier valor igual a 0 debe mostrarse como un espacio vacío " ".
const formatDisplay = (val: number, suffix: string = '') => {
    if (val === 0) return " ";
    return `${val.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}${suffix}`;
};

// Fila de staff en el modal (réplica del dashboard)
const StaffOvertimeRow = memo(({
    staff,
    weekId,
    isPaid,
    onTogglePaid,
    onClick
}: {
    staff: { id: string; name: string; amount: number };
    weekId: string;
    isPaid: boolean;
    onTogglePaid: (e: React.MouseEvent, weekId: string, staffId: string, status: boolean) => void;
    onClick: () => void;
}) => (
    <div onClick={onClick} className="flex items-center justify-between p-3 bg-white/60 rounded-2xl border border-purple-100/30 cursor-pointer hover:bg-white transition-colors group">
        <span className="text-xs font-bold text-gray-700 capitalize group-hover:text-purple-700 transition-colors leading-none">
            {staff.name}
        </span>
        <div className="flex items-center gap-3">
            <span className="text-xs font-black text-gray-800">
                {staff.amount > 0.05 ? `${staff.amount.toFixed(0)}€` : " "}
            </span>
            <div className="flex items-center bg-gray-100/50 rounded-full h-8 px-1 gap-1">
                <button
                    onClick={(e) => onTogglePaid(e, weekId, staff.id, !isPaid)}
                    className={cn(
                        "flex items-center justify-center transition-all active:scale-90 p-0.5",
                        isPaid ? "" : "text-gray-300 hover:text-gray-400"
                    )}
                >
                    {isPaid ? (
                        <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm">
                            <Check className="w-3.5 h-3.5 text-white" strokeWidth={4} />
                        </div>
                    ) : (
                        <Circle className="w-5 h-5" />
                    )}
                </button>
            </div>
        </div>
    </div>
));
StaffOvertimeRow.displayName = 'StaffOvertimeRow';

export default function OvertimePage() {
    const router = useRouter();
    const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
    const [weeksData, setWeeksData] = useState<WeeklyStats[]>([]);
    const [loading, setLoading] = useState(true);
    const [weekDetailModal, setWeekDetailModal] = useState<{ week: any } | null>(null);
    const [paidStatus, setPaidStatus] = useState<Record<string, boolean>>({});
    const [selectedHistory, setSelectedHistory] = useState<{ workerId: string; weekId: string } | null>(null);

    useEffect(() => {
        const start = format(startOfMonth(viewMonth), 'yyyy-MM-dd');
        const end = format(endOfMonth(viewMonth), 'yyyy-MM-dd');
        setLoading(true);
        getOvertimeData(start, end)
            .then((result) => {
                if (result?.weeksResult) setWeeksData(result.weeksResult);
                else setWeeksData([]);
            })
            .catch(() => setWeeksData([]))
            .finally(() => setLoading(false));
    }, [viewMonth]);

    const handleTogglePaid = async (e: React.MouseEvent, weekId: string, staffId: string, newStatus: boolean) => {
        e.stopPropagation();
        const key = `${weekId}-${staffId}`;
        setPaidStatus(prev => ({ ...prev, [key]: newStatus }));
        setWeeksData(prev => prev.map(w => w.weekId === weekId
            ? { ...w, staff: w.staff.map(s => s.id === staffId ? { ...s, isPaid: newStatus } : s) }
            : w));
        try {
            const weekData = weeksData.find(w => w.weekId === weekId);
            const staffData = weekData?.staff?.find((s: any) => s.id === staffId);
            const result = await togglePaidStatus(staffId, weekId, newStatus, {
                totalHours: staffData?.totalHours ?? 0,
                overtimeHours: staffData?.overtimeHours ?? 0
            });
            if (!result.success) throw new Error("Error updating paid status");
            toast.success(newStatus ? "Marcado como pagado" : "Pago cancelado");
        } catch (error) {
            setPaidStatus(prev => ({ ...prev, [key]: !newStatus }));
            setWeeksData(prev => prev.map(w => w.weekId === weekId
                ? { ...w, staff: w.staff.map(s => s.id === staffId ? { ...s, isPaid: !newStatus } : s) }
                : w));
            toast.error("Error al actualizar pago");
        }
    };

    const handleTogglePreferStock = async (e: React.MouseEvent, weekId: string, staffId: string, currentStatus: boolean) => {
        e.stopPropagation();
        try {
            toast.loading("Actualizando balances...", { id: 'prefer-stock-toggle' });
            const result = await togglePreferStockStatus(staffId, weekId, currentStatus);
            if (!result.success) throw new Error(result.error);
            toast.success(result.newStatus ? "Enviado a Bolsa de Horas" : "Cambiado a Pago en Nómina", { id: 'prefer-stock-toggle' });
            const start = format(startOfMonth(viewMonth), 'yyyy-MM-dd');
            const end = format(endOfMonth(viewMonth), 'yyyy-MM-dd');
            const res = await getOvertimeData(start, end);
            if (res?.weeksResult) setWeeksData(res.weeksResult);
        } catch (error: any) {
            toast.error("Error al actualizar modo: " + error.message, { id: 'prefer-stock-toggle' });
        }
    };

    const start = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start, end });
    const today = new Date();
    const currentWeekStart = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const rows: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));
    const rowWeekIds = rows.map(row => row[0] ? format(row[0], 'yyyy-MM-dd') : '');

    return (
        <>
            <div className="bg-[#5B8FB9] p-4 md:p-6 pb-24">
                <div className="max-w-4xl mx-auto">
                    {/* Vista detalle: contenedor que se adapta al contenido (calendario + filas) */}
                    <div className="bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col w-full">
                        {/* Cabecera petróleo (vista detalle) */}
                        <div className="bg-[#36606F] px-6 md:px-8 py-4 md:py-5 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => router.push('/dashboard')}
                                    className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                                    aria-label="Volver"
                                >
                                    <ArrowLeft size={20} strokeWidth={2.5} />
                                </button>
                                <h1 className="text-lg md:text-xl font-black text-white uppercase tracking-wider">Horas Extras</h1>
                            </div>
                            <button onClick={() => router.push('/dashboard')} className="p-2 text-white/60 hover:text-white transition-colors" aria-label="Cerrar">
                                <X size={24} />
                            </button>
                        </div>

                        {/* Cuerpo: calendario + filas de semanas (altura por contenido) */}
                        <div className="p-4 md:p-6 flex flex-col shrink-0">
                            {/* Navegación mes (como widget) */}
                            <div className="flex items-center justify-center gap-2 mb-3 md:mb-4">
                                <button
                                    type="button"
                                    onClick={() => setViewMonth(prev => subMonths(prev, 1))}
                                    className="p-2 rounded-xl hover:bg-purple-50 text-zinc-600 hover:text-purple-700 transition-colors shrink-0"
                                    aria-label="Mes anterior"
                                >
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                                <span className="text-sm md:text-base font-black uppercase tracking-wider text-zinc-800 min-w-[140px] text-center">
                                    {format(viewMonth, 'MMMM yyyy', { locale: es })}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setViewMonth(prev => addMonths(prev, 1))}
                                    className="p-2 rounded-xl hover:bg-purple-50 text-zinc-600 hover:text-purple-700 transition-colors shrink-0"
                                    aria-label="Mes siguiente"
                                >
                                    <ChevronRight className="w-5 h-5" />
                                </button>
                            </div>

                            {loading ? (
                                <div className="flex items-center justify-center py-12">
                                    <div className="w-10 h-10 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                                </div>
                            ) : (
                                <div className="flex gap-3 md:gap-4">
                                    {/* Calendario mini (escala widget, un poco mayor) */}
                                    <div className="shrink-0 flex flex-col gap-[3px]">
                                        {rows.map((rowDays, rowIndex) => (
                                            <div key={rowIndex} className="grid grid-cols-7 gap-[3px]">
                                                {rowDays.map((day) => {
                                                    const inMonth = isSameMonth(day, viewMonth);
                                                    const isToday = isSameDay(day, today);
                                                    return (
                                                        <div
                                                            key={day.getTime()}
                                                            className={cn(
                                                                'w-7 h-7 md:w-8 md:h-8 flex items-center justify-center rounded-full text-[10px] md:text-xs font-bold',
                                                                !inMonth && 'text-zinc-300',
                                                                inMonth && !isToday && 'text-zinc-600',
                                                                isToday && 'bg-blue-500 text-white'
                                                            )}
                                                        >
                                                            {format(day, 'd')}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ))}
                                    </div>
                                    {/* Lista de semanas (1 fila = 1 fila calendario) */}
                                    <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
                                        {rowWeekIds.map((weekId, rowIndex) => {
                                            if (weekId === currentWeekStart) {
                                                return <div key={weekId} className="w-7 h-7 md:w-8 md:h-8 flex-shrink-0" aria-hidden />;
                                            }
                                            const week = weeksData.find(w => w.weekId === weekId);
                                            if (!week) {
                                                return <div key={weekId} className="h-7 md:h-8 flex-shrink-0 min-h-[28px] md:min-h-[32px]" aria-hidden />;
                                            }
                                            const isFullyPaid = week.staff?.every((s: any) => {
                                                const cost = (s.totalCost ?? (s as any).amount ?? 0);
                                                return cost < 0.05 || !!s.isPaid || s.preferStock === true;
                                            });
                                            const weekTotal = week.totalAmount ?? 0;
                                            return (
                                                <button
                                                    key={week.weekId}
                                                    type="button"
                                                    onClick={() => setWeekDetailModal({ week })}
                                                    className={cn(
                                                        'w-full h-7 md:h-8 min-h-[28px] md:min-h-[32px] flex items-center justify-between gap-2 px-2 py-0 rounded-md shadow-sm hover:shadow transition-all text-left flex-shrink-0',
                                                        'bg-transparent border-0 hover:bg-purple-50/50'
                                                    )}
                                                >
                                                    <div className="flex items-center gap-1.5 shrink-0 w-24 md:w-28">
                                                        <div className="shrink-0 flex items-center justify-center w-6 md:w-7">
                                                            {isFullyPaid ? (
                                                                <div className="w-3.5 h-3.5 md:w-4 md:h-4 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm">
                                                                    <Check className="w-2.5 h-2.5 md:w-3 md:h-3 text-white" strokeWidth={4} />
                                                                </div>
                                                            ) : (
                                                                <div className="w-3.5 h-3.5 md:w-4 md:h-4 rounded-full bg-rose-500 flex items-center justify-center shadow-sm">
                                                                    <span className="text-white font-black text-[8px] leading-none">!</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <span className="text-[8px] md:text-[9px] font-black text-zinc-500 uppercase shrink-0">Semana {getISOWeek(new Date(week.weekId))}</span>
                                                    </div>
                                                    <span className="flex-1 text-[8px] md:text-[9px] font-bold text-zinc-500 uppercase truncate min-w-0 text-left pl-2">
                                                        {format(new Date(week.weekId), 'd MMM', { locale: es })} - {format(addDays(new Date(week.weekId), 6), 'd MMM', { locale: es })}
                                                    </span>
                                                    <span className="text-[10px] md:text-xs font-black text-zinc-900 shrink-0 w-10 md:w-12 text-right">
                                                        {weekTotal > 0.05 ? `${weekTotal.toFixed(0)}€` : ' '}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal detalle semana */}
            {weekDetailModal && (() => {
                const weekStaff = (weekDetailModal.week.staff ?? []).filter((s: any) => {
                    const cost = (s.totalCost ?? s.amount ?? 0);
                    return cost > 0.05 && s.preferStock !== true;
                });
                const weekTotal = weekStaff.reduce((sum: number, s: any) => sum + (s.totalCost ?? s.amount ?? 0), 0);
                const weekNum = getISOWeek(new Date(weekDetailModal.week.weekId));
                const periodStr = `${format(new Date(weekDetailModal.week.weekId), 'd MMM', { locale: es })} - ${format(addDays(new Date(weekDetailModal.week.weekId), 6), 'd MMM yyyy', { locale: es })}`;
                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setWeekDetailModal(null)}>
                        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                            <div className="bg-[#36606F] px-4 py-3 flex items-center justify-between gap-3 shrink-0">
                                <span className="text-base font-black text-white shrink-0">{weekTotal > 0.05 ? `${weekTotal.toFixed(0)}€` : ' '}</span>
                                <div className="flex-1 flex flex-col gap-0.5 min-w-0 text-center">
                                    <h3 className="text-sm font-black uppercase tracking-wider text-white">Semana {weekNum}</h3>
                                    <span className="text-[10px] text-white/80 font-bold uppercase tracking-wider">{periodStr}</span>
                                </div>
                                <button type="button" onClick={() => setWeekDetailModal(null)} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white shrink-0"><X className="w-5 h-5" /></button>
                            </div>
                            <div className="p-4 overflow-y-auto flex-1 space-y-2">
                                {weekStaff.map((s: any) => (
                                    <StaffOvertimeRow
                                        key={s.id}
                                        staff={{ id: s.id, name: s.name?.split?.(' ')[0] ?? s.name, amount: s.totalCost ?? s.amount ?? 0 }}
                                        weekId={weekDetailModal.week.weekId}
                                        isPaid={paidStatus[`${weekDetailModal.week.weekId}-${s.id}`] ?? !!s.isPaid}
                                        onTogglePaid={handleTogglePaid}
                                        onClick={() => setSelectedHistory({ workerId: s.id, weekId: weekDetailModal.week.weekId })}
                                    />
                                ))}
                                {weekStaff.length === 0 && (
                                    <p className="text-center text-zinc-400 text-xs font-bold uppercase tracking-widest py-4">Sin importes esta semana</p>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}

            <WorkerWeeklyHistoryModal
                isOpen={!!selectedHistory}
                onClose={() => setSelectedHistory(null)}
                workerId={selectedHistory?.workerId || ''}
                weekStart={selectedHistory?.weekId || ''}
            />
        </>
    );
}
