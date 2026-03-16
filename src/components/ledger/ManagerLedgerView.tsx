'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { toast } from 'sonner';
import {
    ArrowLeft,
    Plus,
    Pencil,
    Trash2,
    X,
    ChevronLeft,
    ChevronRight,
    PiggyBank,
    ArrowUp
} from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, isSameMonth, subMonths, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { TimeFilterButton } from '@/components/time/TimeFilterButton';
import { TimeFilterModal } from '@/components/time/TimeFilterModal';
import type { TimeFilterValue } from '@/components/time/time-filter-types';

interface LedgerRow {
    id: string;
    movement_type: 'entrada' | 'salida';
    amount: number;
    concept: string;
    date: string;
    running_balance: number;
}

export default function ManagerLedgerView() {
    const router = useRouter();
    const supabase = createClient();

    const [allLogs, setAllLogs] = useState<Array<{ id: string; movement_type: 'entrada' | 'salida'; amount: number; concept: string; date: string }>>([]);
    const [balance, setBalance] = useState<number>(0);
    const [loading, setLoading] = useState(true);

    const [filterMode, setFilterMode] = useState<'single' | 'range'>('range');
    const [selectedDate, setSelectedDate] = useState<string>(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const [rangeStart, setRangeStart] = useState<string | null>(() => {
        const d = startOfMonth(new Date());
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const [rangeEnd, setRangeEnd] = useState<string | null>(() => {
        const d = endOfMonth(new Date());
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const [isTimeFilterOpen, setIsTimeFilterOpen] = useState(false);

    const [modalOpen, setModalOpen] = useState(false);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [selectedLog, setSelectedLog] = useState<any>(null);
    const [type, setType] = useState<'entrada' | 'salida'>('entrada');
    const [amount, setAmount] = useState<string>('');
    const [concept, setConcept] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const parseLocalSafe = (dateStr: string | null) => {
        if (!dateStr) return new Date();
        const [y, m, d] = dateStr.split('T')[0].split('-').map(Number);
        return new Date(y, m - 1, d);
    };

    useEffect(() => {
        fetchData();
    }, []);

    async function fetchData() {
        setLoading(true);
        try {
            const { data: bData, error: bErr } = await supabase.rpc('get_manager_ledger_balance');
            if (bErr) {
                console.error('Ledger balance RPC:', bErr);
                toast.error("Error al cargar el saldo");
            } else {
                setBalance(Number(bData ?? 0));
            }

            const { data, error } = await supabase
                .from('manager_ledger')
                .select('id, movement_type, amount, concept, date')
                .order('date', { ascending: true });

            if (error) {
                console.error('Ledger fetch:', error);
                toast.error("Error al cargar movimientos: " + (error.message || ''));
                setAllLogs([]);
            } else {
                setAllLogs(data ?? []);
            }
        } catch (e: any) {
            toast.error("Error al cargar la cuenta corriente");
            setAllLogs([]);
        } finally {
            setLoading(false);
        }
    }

    const runningBalances = useMemo(() => {
        let acc = 0;
        return allLogs.map((row) => {
            const delta = row.movement_type === 'entrada' ? row.amount : -row.amount;
            acc += delta;
            return { ...row, running_balance: acc };
        });
    }, [allLogs]);

    const filteredRowsWithBalance = useMemo((): LedgerRow[] => {
        if (!rangeStart && !rangeEnd && filterMode !== 'single') return [];
        let start: Date;
        let end: Date;
        if (filterMode === 'single') {
            const d = parseLocalSafe(selectedDate);
            start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
            end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
        } else {
            if (!rangeStart || !rangeEnd) return [];
            start = parseLocalSafe(rangeStart);
            start.setHours(0, 0, 0, 0);
            end = parseLocalSafe(rangeEnd);
            end.setHours(23, 59, 59, 999);
        }
        return runningBalances.filter((row) => {
            const t = new Date(row.date);
            return t.getTime() >= start.getTime() && t.getTime() <= end.getTime();
        });
    }, [runningBalances, filterMode, selectedDate, rangeStart, rangeEnd]);

    const displayRows = useMemo(() => [...filteredRowsWithBalance].reverse(), [filteredRowsWithBalance]);

    const periodSummary = useMemo(() => {
        let income = 0;
        let expense = 0;
        filteredRowsWithBalance.forEach((row) => {
            if (row.movement_type === 'entrada') income += row.amount;
            else expense += row.amount;
        });
        return { income, expense };
    }, [filteredRowsWithBalance]);

    const handlePrevMonth = () => {
        const current = rangeStart ? parseLocalSafe(rangeStart) : new Date();
        const prev = subMonths(current, 1);
        setRangeStart(format(startOfMonth(prev), 'yyyy-MM-dd'));
        setRangeEnd(format(endOfMonth(prev), 'yyyy-MM-dd'));
        setFilterMode('range');
    };

    const handleNextMonth = () => {
        const current = rangeStart ? parseLocalSafe(rangeStart) : new Date();
        const next = addMonths(current, 1);
        setRangeStart(format(startOfMonth(next), 'yyyy-MM-dd'));
        setRangeEnd(format(endOfMonth(next), 'yyyy-MM-dd'));
        setFilterMode('range');
    };

    const openCreateModal = () => {
        setType('entrada');
        setAmount('');
        setConcept('');
        setModalOpen(true);
    };

    const openEditModal = (log: LedgerRow) => {
        setSelectedLog(log);
        setType(log.movement_type);
        setAmount(log.amount.toString());
        setConcept(log.concept);
        setEditModalOpen(true);
    };

    const openDeleteModal = (log: LedgerRow) => {
        setSelectedLog(log);
        setDeleteModalOpen(true);
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            toast.error("El importe debe ser mayor a 0");
            return;
        }
        if (!concept.trim()) {
            toast.error("El concepto es obligatorio");
            return;
        }
        setIsSaving(true);
        try {
            const { error } = await supabase.from('manager_ledger').insert({
                movement_type: type,
                amount: numericAmount,
                concept: concept.trim()
            });
            if (error) throw error;
            toast.success("Movimiento registrado con éxito");
            setModalOpen(false);
            fetchData();
        } catch (error: any) {
            toast.error("Error al guardar: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedLog) return;
        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            toast.error("El importe debe ser mayor a 0");
            return;
        }
        if (!concept.trim()) {
            toast.error("El concepto es obligatorio");
            return;
        }
        setIsSaving(true);
        try {
            const { error } = await supabase.from('manager_ledger').update({
                movement_type: type,
                amount: numericAmount,
                concept: concept.trim()
            }).eq('id', selectedLog.id);
            if (error) throw error;
            toast.success("Movimiento actualizado con éxito");
            setEditModalOpen(false);
            fetchData();
        } catch (error: any) {
            toast.error("Error al actualizar: " + error.message);
        } finally {
            setIsSaving(false);
            setSelectedLog(null);
        }
    };

    const handleDelete = async () => {
        if (!selectedLog) return;
        setIsDeleting(true);
        try {
            const { error } = await supabase.from('manager_ledger').delete().eq('id', selectedLog.id);
            if (error) throw error;
            toast.success("Movimiento eliminado");
            setDeleteModalOpen(false);
            fetchData();
        } catch (error: any) {
            toast.error("Error al eliminar: " + error.message);
        } finally {
            setIsDeleting(false);
            setSelectedLog(null);
        }
    };

    const formatMoney = (val: number) => {
        if (Math.abs(val) < 0.005) return " ";
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(val);
    };

    return (
        <div className="min-h-screen bg-[#5B8FB9] p-4 md:p-8 pb-24 text-zinc-900">
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden">
                    {/* CABECERA (como movements: título + Nuevo apunte, sin Arqueo) */}
                    <div className="bg-[#36606F] p-4 md:p-6 space-y-6">
                        <div className="flex items-center justify-between gap-2 md:gap-4">
                            <div className="flex items-center gap-3 md:gap-4 flex-1">
                                <button
                                    onClick={() => router.back()}
                                    className="w-9 h-9 md:w-10 md:h-10 flex items-center justify-center bg-white/10 rounded-full hover:bg-white/20 transition-all text-white border border-white/10 active:scale-95 shrink-0"
                                >
                                    <ArrowLeft className="w-[18px] h-[18px] md:w-5 md:h-5" strokeWidth={3} />
                                </button>
                                <h1 className="text-lg md:text-4xl font-black text-white uppercase tracking-tight italic truncate">Libro Mayor</h1>
                            </div>
                            <div className="flex items-center justify-end gap-1 md:gap-4 shrink-0">
                                <button
                                    onClick={openCreateModal}
                                    className="bg-transparent hover:bg-white/10 px-1.5 md:px-3 py-1.5 rounded-xl flex flex-col items-center gap-1 transition-all active:scale-95 group"
                                >
                                    <div className="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center bg-emerald-500 rounded-full shadow-md group-hover:scale-110 transition-transform">
                                        <Plus className="w-[14px] h-[14px] md:w-4 md:h-4 text-white" strokeWidth={3} />
                                    </div>
                                    <span className="text-[7px] md:text-[9px] font-black uppercase tracking-widest text-white/90">NUEVO APUNTE</span>
                                </button>
                            </div>
                        </div>

                        {/* FILTROS (unificado) */}
                        <div className="flex items-center justify-between gap-2 pb-2">
                            <div className="flex items-center gap-0.5 md:gap-1">
                                <button onClick={handlePrevMonth} className="p-1 md:p-1.5 hover:bg-white/10 rounded-lg text-white transition-all outline-none min-h-[48px] min-w-[48px] flex items-center justify-center">
                                    <ChevronLeft size={18} />
                                </button>
                                <button onClick={() => setIsTimeFilterOpen(true)} className="py-1 px-1 md:px-2 text-[11px] md:text-[13px] font-black text-white uppercase tracking-widest text-center transition-all outline-none whitespace-nowrap">
                                    {filterMode === 'range' && rangeStart && rangeEnd && isSameMonth(parseLocalSafe(rangeStart), parseLocalSafe(rangeEnd))
                                        ? format(parseLocalSafe(rangeStart), 'MMMM yyyy', { locale: es })
                                        : 'SELECCIONAR MES'}
                                </button>
                                <button onClick={handleNextMonth} className="p-1 md:p-1.5 hover:bg-white/10 rounded-lg text-white transition-all outline-none min-h-[48px] min-w-[48px] flex items-center justify-center">
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 text-white">
                                <TimeFilterButton
                                    onClick={() => setIsTimeFilterOpen(true)}
                                    hasActiveFilter={(() => {
                                        const d = new Date();
                                        const defS = format(startOfMonth(d), 'yyyy-MM-dd');
                                        const defE = format(endOfMonth(d), 'yyyy-MM-dd');
                                        const isDefault = filterMode === 'range' && rangeStart === defS && rangeEnd === defE;
                                        return !isDefault;
                                    })()}
                                    onClear={() => {
                                        const d = new Date();
                                        const s = startOfMonth(d);
                                        const e = endOfMonth(d);
                                        setFilterMode('range');
                                        setRangeStart(format(s, 'yyyy-MM-dd'));
                                        setRangeEnd(format(e, 'yyyy-MM-dd'));
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* CUERPO: resumen 3 columnas (Ingresos, Gastos, Saldo) sin Arqueo ni Diferencia */}
                    <div className="bg-white">
                        <div className="py-4 px-2 grid grid-cols-3 border-b border-zinc-50">
                            <div className="flex flex-col items-center justify-center text-center px-1">
                                <span className="text-[13px] md:text-2xl font-black text-emerald-500 line-clamp-1">{periodSummary.income > 0.005 ? `+${periodSummary.income.toFixed(2)}€` : " "}</span>
                                <span className="text-[7px] md:text-[8px] font-black text-zinc-400 uppercase tracking-tight md:tracking-widest mt-0.5">INGRESOS</span>
                            </div>
                            <div className="flex flex-col items-center justify-center text-center border-l border-zinc-100 px-1">
                                <span className="text-[13px] md:text-2xl font-black text-rose-500 line-clamp-1">{periodSummary.expense > 0.005 ? `-${periodSummary.expense.toFixed(2)}€` : " "}</span>
                                <span className="text-[7px] md:text-[8px] font-black text-zinc-400 uppercase tracking-tight md:tracking-widest mt-0.5">GASTOS</span>
                            </div>
                            <div className="flex flex-col items-center justify-center text-center border-l border-zinc-100 px-1">
                                <span className="text-[13px] md:text-2xl font-black text-[#36606F] line-clamp-1 tabular-nums">{formatMoney(balance)}</span>
                                <span className="text-[7px] md:text-[8px] font-black text-zinc-400 uppercase tracking-tight md:tracking-widest mt-0.5">SALDO ACTUAL</span>
                            </div>
                        </div>

                        {/* TABLA (Fecha, Concepto, Importe, Saldo) como movements */}
                        <div className="p-3 bg-white">
                            <div className="rounded-[1.5rem] overflow-hidden border border-zinc-100 shadow-xl">
                                <div className="w-full">
                                    <table className="w-full text-left font-sans">
                                        <thead className="bg-[#36606F] text-white">
                                            <tr className="text-[9px] md:text-[10px] font-black uppercase tracking-wider md:tracking-[0.15em]">
                                                <th className="px-3 md:px-6 py-4 w-[22%]">FECHA</th>
                                                <th className="px-2 md:px-6 py-4 w-[38%]">CONCEPTO</th>
                                                <th className="px-2 md:px-6 py-4 text-center w-[20%]">IMPORTE</th>
                                                <th className="px-3 md:px-8 py-4 text-right w-[20%]">SALDO</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-50/50">
                                            {loading ? (
                                                <tr>
                                                    <td colSpan={4} className="py-20">
                                                        <div className="flex items-center justify-center">
                                                            <LoadingSpinner size="lg" />
                                                        </div>
                                                    </td>
                                                </tr>
                                            ) : displayRows.length === 0 ? (
                                                <tr>
                                                    <td colSpan={4} className="py-20 text-center">
                                                        <div className="flex flex-col items-center justify-center gap-2 opacity-20">
                                                            <PiggyBank size={32} />
                                                            <span className="text-[10px] font-black uppercase tracking-widest">Sin movimientos</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ) : (
                                                displayRows.map((mov) => {
                                                    const date = new Date(mov.date);
                                                    return (
                                                        <tr key={mov.id} className="group hover:bg-zinc-50/80 transition-colors">
                                                            <td className="px-3 md:px-6 py-3">
                                                                <div className="flex flex-col">
                                                                    <span className="text-[10px] md:text-[13px] font-black text-zinc-900 italic">
                                                                        {isNaN(date.getTime()) ? (
                                                                            <span className="text-rose-500 text-[10px]">Fecha Inválida</span>
                                                                        ) : (
                                                                            <>
                                                                                <span className="md:inline hidden">{format(date, 'eeee d MMM', { locale: es })}</span>
                                                                                <span className="md:hidden inline">{format(date, 'd MMM', { locale: es })}</span>
                                                                            </>
                                                                        )}
                                                                    </span>
                                                                    <span className="text-[8px] md:text-[10px] font-bold text-zinc-400 font-mono">
                                                                        {isNaN(date.getTime()) ? '--:--' : format(date, 'HH:mm')}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="px-2 md:px-6 py-3">
                                                                <div className="flex items-center gap-1.5 md:gap-3">
                                                                    <div className={cn(
                                                                        "w-5 h-5 md:w-8 md:h-8 rounded-md md:rounded-lg flex items-center justify-center shrink-0 shadow-sm",
                                                                        mov.movement_type === 'entrada' ? "bg-emerald-50 text-emerald-500" : "bg-rose-50 text-rose-500"
                                                                    )}>
                                                                        {mov.movement_type === 'entrada' ? <Plus size={10} className="md:size-[16px]" strokeWidth={3} /> : <ArrowUp size={10} className="md:size-[16px]" strokeWidth={3} />}
                                                                    </div>
                                                                    <span className="text-[9px] md:text-[12px] font-bold text-zinc-500 uppercase tracking-tight truncate max-w-[60px] md:max-w-[200px]">{mov.concept}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-2 md:px-6 py-3 text-center">
                                                                <span className={cn(
                                                                    "text-[10px] md:text-[15px] font-black tabular-nums",
                                                                    mov.movement_type === 'entrada' ? "text-emerald-500" : "text-rose-500"
                                                                )}>
                                                                    {mov.movement_type === 'entrada' ? '+' : '-'}{mov.amount.toFixed(2)}€
                                                                </span>
                                                            </td>
                                                            <td className="px-3 md:px-8 py-3 text-right">
                                                                <div className="flex items-center justify-end gap-1">
                                                                    <span className="text-[10px] md:text-[15px] font-black text-zinc-900 tabular-nums">{mov.running_balance.toFixed(2)}€</span>
                                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                        <button onClick={() => openEditModal(mov)} className="p-1.5 md:p-2 bg-zinc-50 hover:bg-blue-50 text-zinc-400 hover:text-blue-500 rounded-xl transition-all border border-zinc-100 hover:border-blue-200 shadow-sm active:scale-95">
                                                                            <Pencil size={14} />
                                                                        </button>
                                                                        <button onClick={() => openDeleteModal(mov)} className="p-1.5 md:p-2 bg-zinc-50 hover:bg-rose-50 text-zinc-400 hover:text-rose-500 rounded-xl transition-all border border-zinc-100 hover:border-rose-200 shadow-sm active:scale-95">
                                                                            <Trash2 size={14} />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal calendario */}
            <TimeFilterModal
                isOpen={isTimeFilterOpen}
                onClose={() => setIsTimeFilterOpen(false)}
                allowedKinds={['date', 'range', 'week', 'month', 'year']}
                initialValue={
                    filterMode === 'single'
                        ? ({ kind: 'date', date: selectedDate } satisfies TimeFilterValue)
                        : rangeStart && rangeEnd
                            ? ({ kind: 'range', startDate: rangeStart, endDate: rangeEnd } satisfies TimeFilterValue)
                            : ({ kind: 'date', date: selectedDate } satisfies TimeFilterValue)
                }
                onApply={(v) => {
                    if (v.kind === 'date') {
                        setSelectedDate(v.date);
                        setFilterMode('single');
                        return;
                    }
                    if (v.kind === 'range' || v.kind === 'week') {
                        setRangeStart(v.startDate);
                        setRangeEnd(v.endDate);
                        setFilterMode('range');
                        return;
                    }
                    if (v.kind === 'month') {
                        const s = startOfMonth(new Date(v.year, v.month - 1, 1));
                        const e = endOfMonth(new Date(v.year, v.month - 1, 1));
                        setRangeStart(format(s, 'yyyy-MM-dd'));
                        setRangeEnd(format(e, 'yyyy-MM-dd'));
                        setFilterMode('range');
                        return;
                    }
                    if (v.kind === 'year') {
                        const s = new Date(v.year, 0, 1);
                        const e = new Date(v.year, 11, 31);
                        setRangeStart(format(s, 'yyyy-MM-dd'));
                        setRangeEnd(format(e, 'yyyy-MM-dd'));
                        setFilterMode('range');
                    }
                }}
            />

            {/* Modal Nuevo/Editar */}
            {(modalOpen || editModalOpen) && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center p-4" onClick={() => { setModalOpen(false); setEditModalOpen(false); }}>
                    <div className="absolute inset-0 bg-[#36606F]/60 backdrop-blur-md animate-in fade-in duration-200" />
                    <div className="relative bg-white rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="bg-[#36606F] p-6 pt-8 text-white relative shrink-0 text-center">
                            <button onClick={() => { setModalOpen(false); setEditModalOpen(false); }} className="absolute right-4 top-4 p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all text-white active:scale-95">
                                <X size={16} strokeWidth={3} />
                            </button>
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40 mb-1 block">Transcripción</span>
                            <h3 className="text-2xl font-black uppercase tracking-tighter">{editModalOpen ? 'Editar Apunte' : 'Nuevo Apunte'}</h3>
                        </div>
                        <form onSubmit={editModalOpen ? handleEdit : handleCreate} className="p-6">
                            <div className="grid grid-cols-2 gap-2 mb-6 bg-zinc-100 p-1.5 rounded-2xl">
                                <button type="button" onClick={() => setType('entrada')} className={`py-2 px-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${type === 'entrada' ? 'bg-emerald-500 text-white shadow-md' : 'text-zinc-400 hover:text-zinc-600'}`}>Entrada</button>
                                <button type="button" onClick={() => setType('salida')} className={`py-2 px-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${type === 'salida' ? 'bg-white text-zinc-900 shadow-md' : 'text-zinc-400 hover:text-zinc-600'}`}>Salida</button>
                            </div>
                            <div className="space-y-4">
                                <div className="bg-zinc-50 border border-zinc-100 p-4 rounded-2xl shadow-sm">
                                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Importe</label>
                                    <div className="flex items-center group">
                                        <input type="number" step="0.01" min="0.01" className="w-full bg-transparent text-3xl font-black text-zinc-900 border-none outline-none p-0 focus:ring-0 tabular-nums" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
                                        <span className="text-xl font-black text-zinc-300 ml-2">€</span>
                                    </div>
                                </div>
                                <div className="bg-zinc-50 border border-zinc-100 p-4 rounded-2xl shadow-sm">
                                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Concepto</label>
                                    <input type="text" className="w-full bg-transparent text-lg font-bold text-zinc-900 border-none outline-none p-0 focus:ring-0 placeholder-zinc-300" placeholder="Ej: Crédito mensual" value={concept} onChange={(e) => setConcept(e.target.value)} required />
                                </div>
                            </div>
                            <div className="mt-8">
                                <button type="submit" disabled={isSaving} className={`w-full h-14 rounded-2xl text-white font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all shadow-xl ${type === 'entrada' ? 'bg-emerald-500 shadow-emerald-200' : 'bg-[#36606F] shadow-blue-200'} disabled:opacity-50 flex items-center justify-center gap-2`}>
                                    {isSaving ? 'Guardando...' : 'Confirmar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Borrado */}
            {deleteModalOpen && selectedLog && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center p-4" onClick={() => setDeleteModalOpen(false)}>
                    <div className="absolute inset-0 bg-red-900/40 backdrop-blur-md animate-in fade-in duration-200" />
                    <div className="relative bg-white rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col p-6 text-center" onClick={e => e.stopPropagation()}>
                        <div className="mx-auto w-16 h-16 bg-red-50 text-rose-500 rounded-full flex items-center justify-center mb-4 border border-red-100 shadow-inner">
                            <Trash2 size={24} strokeWidth={2.5} />
                        </div>
                        <h3 className="text-xl font-black uppercase tracking-tighter text-zinc-900 mb-2">Eliminar Movimiento</h3>
                        <p className="text-sm text-zinc-500 font-bold mb-6">
                            Estás a punto de borrar este apunte de <strong>{Number(selectedLog.amount).toFixed(2)}€</strong> ({selectedLog.concept}). Esta acción no se puede deshacer.
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setDeleteModalOpen(false)} className="flex-1 h-12 rounded-xl bg-zinc-100 text-zinc-500 font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all">Cancelar</button>
                            <button onClick={handleDelete} disabled={isDeleting} className="flex-1 h-12 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all shadow-lg shadow-rose-200 disabled:opacity-50">
                                {isDeleting ? 'Borrando...' : 'Eliminar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
