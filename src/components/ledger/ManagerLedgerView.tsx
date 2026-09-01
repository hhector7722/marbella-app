'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { toast } from 'sonner';
import {
    Plus,
    Pencil,
    Trash2,
    ArrowUp
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, isSameMonth, subMonths, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { PeriodNav, PeriodFilterButton } from '@/components/time/PeriodNav';
import { TimeFilterModal } from '@/components/time/TimeFilterModal';
import type { TimeFilterValue } from '@/components/time/time-filter-types';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';
import { namedEntitySummary } from '@/lib/usage/modal-apply';
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout';
import { ModalDateButton } from '@/components/time/ModalDateButton';
import { TABLE_COMPONENT_ID } from '@/lib/design-system';

interface LedgerRow {
    id: string;
    movement_type: 'entrada' | 'salida';
    amount: number;
    concept: string;
    date: string;
    running_balance: number;
}

/** Fecha calendario (YYYY-MM-DD) en Europe/Madrid para filtros y apuntes retroactivos */
function madridYmd(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Madrid',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(d);
}

export default function ManagerLedgerView() {
    const supabase = createClient();

    const [allLogs, setAllLogs] = useState<LedgerRow[]>([]);
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
    const [entryDate, setEntryDate] = useState('');
    const [editDate, setEditDate] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const trackLedgerCreate = useTrackModalApply('ledger-create', 'Nuevo apunte libro');
    const trackLedgerEdit = useTrackModalApply('ledger-edit', 'Editar apunte libro');

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
                .from('v_manager_ledger_with_running')
                .select('id, movement_type, amount, concept, date, running_balance')
                .order('date', { ascending: true })
                .order('id', { ascending: true });

            if (error) {
                console.error('Ledger fetch:', error);
                toast.error("Error al cargar movimientos: " + (error.message || ''));
                setAllLogs([]);
            } else {
                setAllLogs(
                    (data ?? []).map((r) => ({
                        ...r,
                        amount: Number(r.amount),
                        running_balance: Number(r.running_balance),
                    }))
                );
            }
        } catch (e: any) {
            toast.error("Error al cargar la cuenta corriente");
            setAllLogs([]);
        } finally {
            setLoading(false);
        }
    }

    const filteredRowsWithBalance = useMemo((): LedgerRow[] => {
        if (!rangeStart && !rangeEnd && filterMode !== 'single') return [];
        if (filterMode === 'single') {
            return allLogs.filter((row) => madridYmd(row.date) === selectedDate);
        }
        if (!rangeStart || !rangeEnd) return [];
        return allLogs.filter((row) => {
            const ymd = madridYmd(row.date);
            return ymd >= rangeStart && ymd <= rangeEnd;
        });
    }, [allLogs, filterMode, selectedDate, rangeStart, rangeEnd]);

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
        const d = new Date();
        setEntryDate(
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        );
        setModalOpen(true);
    };

    const openEditModal = (log: LedgerRow) => {
        setSelectedLog(log);
        setType(log.movement_type);
        setAmount(log.amount.toString());
        setConcept(log.concept);
        const ymd = madridYmd(log.date);
        if (ymd) {
            setEditDate(ymd);
        } else {
            const x = new Date();
            setEditDate(
                `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
            );
        }
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
        if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
            toast.error("Fecha no válida");
            return;
        }
        setIsSaving(true);
        try {
            const { error } = await supabase.rpc('manager_ledger_insert_entry', {
                p_movement_type: type,
                p_amount: numericAmount,
                p_concept: concept.trim(),
                p_entry_date: entryDate,
            });
            if (error) throw error;
            trackLedgerCreate(`${type === 'entrada' ? 'Entrada' : 'Salida'} · ${namedEntitySummary(concept.trim())} · ${numericAmount.toFixed(2)}€`);
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
        if (!/^\d{4}-\d{2}-\d{2}$/.test(editDate)) {
            toast.error("Fecha no válida");
            return;
        }
        setIsSaving(true);
        try {
            const { error } = await supabase.rpc('manager_ledger_update_entry', {
                p_id: selectedLog.id,
                p_movement_type: type,
                p_amount: numericAmount,
                p_concept: concept.trim(),
                p_entry_date: editDate,
            });
            if (error) throw error;
            trackLedgerEdit(`${type === 'entrada' ? 'Entrada' : 'Salida'} · ${namedEntitySummary(concept.trim())} · ${numericAmount.toFixed(2)}€`);
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
        <>
            <DashboardDetailLayout
                title="Libro Mayor"
                showBackButton={false}
                template="list"
                work="table"
                maxWidthClass="max-w-4xl"
                contentClassName="p-0 flex flex-col min-h-0"
                periodSlot={
                    <PeriodNav
                        label={
                            filterMode === 'range' && rangeStart && rangeEnd && isSameMonth(parseLocalSafe(rangeStart), parseLocalSafe(rangeEnd))
                                ? format(parseLocalSafe(rangeStart), 'MMMM yyyy', { locale: es })
                                : 'Periodo'
                        }
                        onPrev={handlePrevMonth}
                        onNext={handleNextMonth}
                        onLabelClick={() => setIsTimeFilterOpen(true)}
                    />
                }
                rightSlot={
                    <div className="flex items-center gap-1 md:gap-2 shrink-0">
                        <PeriodFilterButton instance="ledger-period-filter" onClick={() => setIsTimeFilterOpen(true)} />
                        <Button
                            type="button"
                            variant="tertiary"
                            instance="manager-ledger-new-entry"
                            onClick={openCreateModal}
                        >
                            Nuevo apunte
                        </Button>
                    </div>
                }
                leadSlot={
                    <div className="grid grid-cols-3">
                            <div className="flex flex-col items-center justify-center text-center px-1">
                                <span className="text-[13px] md:text-2xl font-black text-emerald-500 line-clamp-1">{periodSummary.income > 0.005 ? `+${periodSummary.income.toFixed(2)}€` : " "}</span>
                                <span className="text-[7px] md:text-[8px] font-black text-zinc-400 uppercase tracking-tight md:tracking-widest mt-0.5">INGRESOS</span>
                            </div>
                            <div className="flex flex-col items-center justify-center text-center border-l border-zinc-100 px-1">
                                <span className="text-[13px] md:text-2xl font-black text-rose-500 line-clamp-1">{periodSummary.expense > 0.005 ? `-${periodSummary.expense.toFixed(2)}€` : " "}</span>
                                <span className="text-[7px] md:text-[8px] font-black text-zinc-400 uppercase tracking-tight md:tracking-widest mt-0.5">GASTOS</span>
                            </div>
                            <div className="flex flex-col items-center justify-center text-center border-l border-zinc-100 px-1">
                                <span className="text-[13px] md:text-2xl font-black text-white line-clamp-1 tabular-nums">{formatMoney(balance)}</span>
                                <span className="text-[7px] md:text-[8px] font-black text-zinc-400 uppercase tracking-tight md:tracking-widest mt-0.5">SALDO ACTUAL</span>
                            </div>
                    </div>
                }
            >

                        {/* TABLA (Fecha, Concepto, Importe, Saldo) como movements */}
                        <div className="p-1.5">
                            <div data-table-piece className="overflow-hidden">
                                <div className="w-full min-w-0 overflow-x-hidden">
                                    <table data-component={TABLE_COMPONENT_ID} data-instance="libro-mayor" className="w-full text-left font-sans">
                                        <thead>
                                            <tr>
                                                <th className="w-[22%]">FECHA</th>
                                                <th className="w-[38%]">CONCEPTO</th>
                                                <th className="w-[20%] text-center">IMPORTE</th>
                                                <th className="w-[20%] text-right">SALDO</th>
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
                                                    <td colSpan={4}>
                                                        <EmptyState
                                                            instance="manager-ledger-none"
                                                            variant="none"
                                                            title="Sin movimientos"
                                                        />
                                                    </td>
                                                </tr>
                                            ) : (
                                                displayRows.map((mov) => {
                                                    const d = new Date(mov.date);
                                                    const ok = !isNaN(d.getTime());
                                                    const dayLong = ok
                                                        ? new Intl.DateTimeFormat('es', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'short' }).format(d)
                                                        : '';
                                                    const dayShort = ok
                                                        ? new Intl.DateTimeFormat('es', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short' }).format(d)
                                                        : '';
                                                    const hm = ok
                                                        ? new Intl.DateTimeFormat('es', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
                                                        : '--:--';
                                                    return (
                                                        <tr key={mov.id} className="group hover:bg-zinc-50/80 transition-colors">
                                                            <td>
                                                                <div className="flex flex-col min-w-0">
                                                                    <span className="text-[10px] md:text-[13px] font-black text-zinc-900 italic">
                                                                        {!ok ? (
                                                                            <span className="text-rose-500 text-[10px]">Fecha Inválida</span>
                                                                        ) : (
                                                                            <>
                                                                                <span className="md:inline hidden capitalize">{dayLong}</span>
                                                                                <span className="md:hidden inline capitalize">{dayShort}</span>
                                                                            </>
                                                                        )}
                                                                    </span>
                                                                    <span className="text-[8px] md:text-[10px] font-bold text-zinc-400 font-mono">
                                                                        {hm}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td>
                                                                <div className="flex items-center gap-1.5 min-w-0">
                                                                    <div className={cn(
                                                                        "w-5 h-5 md:w-8 md:h-8 rounded-md md:rounded-lg flex items-center justify-center shrink-0 shadow-sm",
                                                                        mov.movement_type === 'entrada' ? "bg-emerald-50 text-emerald-500" : "bg-rose-50 text-rose-500"
                                                                    )}>
                                                                        {mov.movement_type === 'entrada' ? <Plus size={10} className="md:size-[16px]" strokeWidth={3} /> : <ArrowUp size={10} className="md:size-[16px]" strokeWidth={3} />}
                                                                    </div>
                                                                    <span className="text-[9px] md:text-[11px] font-bold text-zinc-500 uppercase tracking-tight truncate min-w-0">{mov.concept}</span>
                                                                </div>
                                                            </td>
                                                            <td className="text-center">
                                                                <span className={cn(
                                                                    "text-[10px] md:text-[13px] font-black tabular-nums",
                                                                    mov.movement_type === 'entrada' ? "text-emerald-500" : "text-rose-500"
                                                                )}>
                                                                    {mov.movement_type === 'entrada' ? '+' : '-'}{mov.amount.toFixed(2)}€
                                                                </span>
                                                            </td>
                                                            <td className="text-right">
                                                                <div className="flex items-center justify-end gap-1">
                                                                    <span className="text-[10px] md:text-[15px] font-black text-zinc-900 tabular-nums">{formatMoney(mov.running_balance)}</span>
                                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                        <button onClick={() => openEditModal(mov)} className="p-1.5 md:p-2 bg-zinc-50 hover:bg-blue-50 text-zinc-400 hover:text-blue-500 rounded-lg transition-all border border-zinc-100 hover:border-blue-200 shadow-sm active:scale-95">
                                                                            <Pencil size={14} />
                                                                        </button>
                                                                        <button onClick={() => openDeleteModal(mov)} className="p-1.5 md:p-2 bg-zinc-50 hover:bg-rose-50 text-zinc-400 hover:text-rose-500 rounded-lg transition-all border border-zinc-100 hover:border-rose-200 shadow-sm active:scale-95">
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
            </DashboardDetailLayout>

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
            <Modal
                open={modalOpen || editModalOpen}
                onClose={() => { setModalOpen(false); setEditModalOpen(false); }}
                variant="compact"
                layer="base"
                instance="ledger-entry-form"
                usageId={editModalOpen ? 'ledger-edit' : 'ledger-create'}
                usageLabel={editModalOpen ? 'Editar apunte libro' : 'Nuevo apunte libro'}
                headerTone="petroleum"
                title={editModalOpen ? 'Editar Apunte' : 'Nuevo Apunte'}
                subtitle="Transcripción"
                headerTrailing={
                    <ModalDateButton
                        value={editModalOpen ? editDate : entryDate}
                        onChange={(next) => (editModalOpen ? setEditDate(next) : setEntryDate(next))}
                        ariaLabel="Fecha del apunte"
                    />
                }
            >
                        <form onSubmit={editModalOpen ? handleEdit : handleCreate}>
                            <div className="grid grid-cols-2 gap-2 mb-4 bg-zinc-100 p-1.5 rounded-2xl">
                                <button type="button" onClick={() => setType('entrada')} className={`py-2 px-4 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${type === 'entrada' ? 'bg-emerald-500 text-white shadow-md' : 'text-zinc-400 hover:text-zinc-600'}`}>Entrada</button>
                                <button type="button" onClick={() => setType('salida')} className={`py-2 px-4 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${type === 'salida' ? 'bg-white text-zinc-900 shadow-md' : 'text-zinc-400 hover:text-zinc-600'}`}>Salida</button>
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
                                <Button
                                    type="submit"
                                    variant="primary"
                                    instance="ledger-confirmar-apunte"
                                    disabled={isSaving}
                                    loading={isSaving}
                                    loadingLabel="Guardando..."
                                >
                                    Confirmar
                                </Button>
                            </div>
                        </form>
            </Modal>

            {/* Modal Borrado */}
            <Modal
                open={Boolean(deleteModalOpen && selectedLog)}
                onClose={() => setDeleteModalOpen(false)}
                variant="compact"
                layer="system"
                instance="ledger-entry-delete"
                usageId="ledger-delete"
                usageLabel="Eliminar apunte libro"
                headerTone="petroleum"
                title="Eliminar Movimiento"
                footer={
                    <div className="flex w-full justify-end gap-3">
                        <Button
                            type="button"
                            variant="secondary"
                            instance="ledger-entry-delete-cancel"
                            onClick={() => setDeleteModalOpen(false)}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            instance="ledger-entry-delete-confirm"
                            onClick={handleDelete}
                            disabled={isDeleting}
                            loading={isDeleting}
                            loadingLabel="Borrando..."
                        >
                            Eliminar
                        </Button>
                    </div>
                }
            >
                        <div className="text-center">
                        <div className="mx-auto w-16 h-16 bg-red-50 text-rose-500 rounded-full flex items-center justify-center mb-4 border border-red-100 shadow-inner">
                            <Trash2 size={24} strokeWidth={2.5} />
                        </div>
                        <p className="text-sm text-zinc-500 font-bold">
                            Estás a punto de borrar este apunte de <strong>{selectedLog ? `${Number(selectedLog.amount).toFixed(2)}€` : ''}</strong> ({selectedLog?.concept}). Esta acción no se puede deshacer.
                        </p>
                        </div>
            </Modal>
        </>
    );
}
