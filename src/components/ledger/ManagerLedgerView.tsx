'use client';
import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, ArrowDownRight, ArrowUpRight, Plus, Receipt, Pencil, Trash2, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useRouter } from 'next/navigation';

export default function ManagerLedgerView() {
    const router = useRouter();
    const supabase = createClient();

    const [balance, setBalance] = useState<number>(0);
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [modalOpen, setModalOpen] = useState(false);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);

    const [selectedLog, setSelectedLog] = useState<any>(null);

    const [type, setType] = useState<'entrada' | 'salida'>('entrada');
    const [amount, setAmount] = useState<string>('');
    const [concept, setConcept] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    async function fetchData() {
        setLoading(true);
        try {
            const { data: bData, error: bErr } = await supabase.rpc('get_manager_ledger_balance');
            if (bErr) throw bErr;
            setBalance(bData || 0);

            const { data, error } = await supabase
                .from('manager_ledger')
                .select(`id, movement_type, amount, concept, date, created_by, profiles(full_name)`)
                .order('date', { ascending: false });

            if (error) throw error;
            setLogs(data || []);
        } catch (error: any) {
            toast.error("Error al cargar la cuenta corriente");
        } finally {
            setLoading(false);
        }
    }

    const openCreateModal = () => {
        setType('entrada');
        setAmount('');
        setConcept('');
        setModalOpen(true);
    };

    const openEditModal = (log: any) => {
        setSelectedLog(log);
        setType(log.movement_type as 'entrada' | 'salida');
        setAmount(log.amount.toString());
        setConcept(log.concept);
        setEditModalOpen(true);
    };

    const openDeleteModal = (log: any) => {
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
        if (val === 0) return " ";
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(val);
    };

    return (
        <div className="min-h-screen bg-[#5B8FB9] p-1 md:p-3 pb-20">
            <div className="max-w-5xl mx-auto">
                <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden">
                    <div className="bg-[#36606F] p-4 md:p-6 space-y-3 relative">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 md:gap-4">
                                <button onClick={() => router.back()} className="flex items-center justify-center text-white hover:bg-white/20 transition-all active:scale-95 md:w-10 md:h-10 md:bg-white/10 md:rounded-full md:border md:border-white/10">
                                    <ArrowLeft className="w-5 md:w-5 h-5 md:h-5" strokeWidth={3} />
                                </button>
                                <h1 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight italic text-nowrap">Libro Mayor</h1>
                            </div>
                            <button
                                onClick={openCreateModal}
                                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-xl transition-all shadow-lg active:scale-95"
                            >
                                <Plus size={16} className="text-white" strokeWidth={3} />
                                <span className="text-xs font-black text-white uppercase tracking-widest hidden sm:inline">Nuevo Apunte</span>
                            </button>
                        </div>
                    </div>

                    <div className="bg-white">
                        <div className="pt-8 pb-8 px-4 flex flex-col items-center justify-center border-b border-zinc-100">
                            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">Saldo Actual</span>
                            <span className="text-5xl font-black tracking-tighter tabular-nums text-zinc-900 leading-none">
                                {formatMoney(balance)}
                            </span>
                        </div>

                        <div className="p-4 md:p-6 bg-slate-50 min-h-[500px]">
                            {loading ? (
                                <div className="text-center py-20 opacity-50 flex flex-col items-center gap-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest">Cargando...</span>
                                </div>
                            ) : logs.length === 0 ? (
                                <div className="text-center py-20 opacity-30 flex flex-col items-center gap-3">
                                    <Receipt size={32} />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Sin Movimientos</span>
                                </div>
                            ) : (
                                <div className="grid gap-3 max-w-2xl mx-auto">
                                    {logs.map((log) => (
                                        <div key={log.id} className="group bg-white rounded-2xl p-4 md:p-5 border border-zinc-100 shadow-sm flex items-center justify-between hover:border-zinc-300 transition-colors relative overflow-hidden">
                                            <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0 pr-4">
                                                <div className={`shrink-0 p-2 md:p-3 rounded-xl md:rounded-2xl ${log.movement_type === 'entrada' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                                                    {log.movement_type === 'entrada' ? <ArrowDownRight size={20} strokeWidth={3} /> : <ArrowUpRight size={20} strokeWidth={3} />}
                                                </div>
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-sm font-black text-zinc-900 uppercase tracking-tight truncate">{log.concept}</span>
                                                    <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2 mt-1">
                                                        <span className="text-[9px] md:text-[10px] font-bold text-zinc-500 whitespace-nowrap">{format(parseISO(log.date), "d MMM yyyy, HH:mm", { locale: es })}</span>
                                                        <span className="hidden sm:inline text-zinc-300 shrink-0">•</span>
                                                        <span className="text-[9px] md:text-[10px] font-black uppercase text-zinc-400 truncate">{log.profiles?.full_name || 'Manager'}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex flex-col items-end shrink-0 gap-2">
                                                <span className={`text-xl md:text-2xl font-black tabular-nums tracking-tighter ${log.movement_type === 'entrada' ? 'text-emerald-600' : 'text-zinc-900'}`}>
                                                    {log.movement_type === 'entrada' ? '+' : '-'}{log.amount.toFixed(2)}€
                                                </span>
                                                <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => openEditModal(log)} className="p-1.5 md:p-2 bg-zinc-50 hover:bg-blue-50 text-zinc-400 hover:text-blue-500 rounded-xl transition-all border border-zinc-100 hover:border-blue-200 shadow-sm active:scale-95">
                                                        <Pencil size={14} />
                                                    </button>
                                                    <button onClick={() => openDeleteModal(log)} className="p-1.5 md:p-2 bg-zinc-50 hover:bg-rose-50 text-zinc-400 hover:text-rose-500 rounded-xl transition-all border border-zinc-100 hover:border-rose-200 shadow-sm active:scale-95">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal de Nuevo/Editar Movimiento */}
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
                                <button type="button" onClick={() => setType('entrada')} className={`py-2 px-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${type === 'entrada' ? 'bg-emerald-500 text-white shadow-md' : 'text-zinc-400 hover:text-zinc-600'}`}>
                                    Entrada
                                </button>
                                <button type="button" onClick={() => setType('salida')} className={`py-2 px-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${type === 'salida' ? 'bg-white text-zinc-900 shadow-md' : 'text-zinc-400 hover:text-zinc-600'}`}>
                                    Salida
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div className="bg-zinc-50 border border-zinc-100 p-4 rounded-2xl shadow-sm">
                                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Importe</label>
                                    <div className="flex items-center group">
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0.01"
                                            className="w-full bg-transparent text-3xl font-black text-zinc-900 border-none outline-none p-0 focus:ring-0 tabular-nums"
                                            placeholder="0.00"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            required
                                            autoFocus
                                        />
                                        <span className="text-xl font-black text-zinc-300 ml-2">€</span>
                                    </div>
                                </div>
                                <div className="bg-zinc-50 border border-zinc-100 p-4 rounded-2xl shadow-sm">
                                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Concepto</label>
                                    <input
                                        type="text"
                                        className="w-full bg-transparent text-lg font-bold text-zinc-900 border-none outline-none p-0 focus:ring-0 placeholder-zinc-300"
                                        placeholder="Ej: Aporte capital"
                                        value={concept}
                                        onChange={(e) => setConcept(e.target.value)}
                                        required
                                    />
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

            {/* Modal de Borrado */}
            {deleteModalOpen && selectedLog && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center p-4" onClick={() => setDeleteModalOpen(false)}>
                    <div className="absolute inset-0 bg-red-900/40 backdrop-blur-md animate-in fade-in duration-200" />
                    <div className="relative bg-white rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col p-6 text-center" onClick={e => e.stopPropagation()}>
                        <div className="mx-auto w-16 h-16 bg-red-50 text-rose-500 rounded-full flex items-center justify-center mb-4 border border-red-100 shadow-inner">
                            <Trash2 size={24} strokeWidth={2.5} />
                        </div>
                        <h3 className="text-xl font-black uppercase tracking-tighter text-zinc-900 mb-2">Eliminar Movimiento</h3>
                        <p className="text-sm text-zinc-500 font-bold mb-6">
                            Estás a punto de borrar definitivamente este apunte de <strong>{selectedLog.amount.toFixed(2)}€</strong> ({selectedLog.concept}). Esta acción no se puede deshacer.
                        </p>

                        <div className="flex gap-3">
                            <button onClick={() => setDeleteModalOpen(false)} className="flex-1 h-12 rounded-xl bg-zinc-100 text-zinc-500 font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all">
                                Cancelar
                            </button>
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
