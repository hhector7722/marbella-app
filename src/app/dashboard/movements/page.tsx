'use client';

import { useState, useEffect } from 'react';
import { createClient } from "@/utils/supabase/client";
import { useRouter } from 'next/navigation';
import {
    ArrowLeft,
    ArrowDownLeft,
    ArrowUpRight,
    Search,
    Filter,
    X
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Movement {
    id: string;
    created_at: string;
    amount: number;
    type: 'income' | 'expense';
    notes: string;
    calculated_balance?: number;
}

export default function MovementsPage() {
    const supabase = createClient();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [movements, setMovements] = useState<Movement[]>([]);

    // Filtros
    const [year, setYear] = useState(new Date().getFullYear());
    const [month, setMonth] = useState(new Date().getMonth());
    const [showFilters, setShowFilters] = useState(false);

    useEffect(() => {
        fetchMovements();
    }, [year, month]);

    async function fetchMovements() {
        setLoading(true);
        try {
            const { data: box } = await supabase.from('cash_boxes').select('id, current_balance').eq('type', 'operational').single();
            if (!box) return;

            const startOfMonth = new Date(year, month, 1).toISOString();
            const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

            const { data } = await supabase
                .from('treasury_movements')
                .select('*')
                .or(`source_box_id.eq.${box.id},destination_box_id.eq.${box.id}`)
                .gte('created_at', startOfMonth)
                .lte('created_at', endOfMonth)
                .order('created_at', { ascending: false });

            if (data) {
                const movementsWithBalance = data.map((mov) => ({ ...mov, calculated_balance: 0 }));
                setMovements(movementsWithBalance);
            }
        } catch (error) { console.error(error); } finally { setLoading(false); }
    }

    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    return (
        <div className="min-h-screen bg-gray-50 pb-10">
            {/* Header */}
            <header className="bg-[#5B8FB9] text-white p-4 sticky top-0 z-10 shadow-md">
                <div className="max-w-5xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button onClick={() => router.back()} className="p-2 hover:bg-white/20 rounded-full transition-colors"><ArrowLeft size={24} /></button>
                        <div>
                            <h1 className="text-lg font-bold leading-none">Movimientos Caja Inicial</h1>
                            <p className="text-xs text-blue-100 opacity-90 mt-1 capitalize">{months[month]} {year}</p>
                        </div>
                    </div>
                    <button onClick={() => setShowFilters(true)} className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"><Filter size={20} /></button>
                </div>
            </header>

            <div className="max-w-5xl mx-auto p-4">

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

                    {/* --- CABECERA DE LA TABLA --- */}
                    {/* Estructura grid-cols-5 exacta sin gaps */}
                    <div className="grid grid-cols-5 bg-gray-50 border-b border-gray-200">
                        <div className="p-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-left">Fecha</div>
                        <div className="p-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Tipo</div>
                        <div className="p-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-left">Concepto</div>
                        <div className="p-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Importe</div>
                        <div className="p-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Saldo</div>
                    </div>

                    {/* --- CUERPO DE LA TABLA --- */}
                    {loading ? (
                        <div className="p-10 text-center text-gray-400">Cargando...</div>
                    ) : movements.length === 0 ? (
                        <div className="p-10 text-center text-gray-400 flex flex-col items-center gap-2">
                            <Search size={32} className="opacity-20" />
                            <p>No hay movimientos</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {movements.map((mov) => {
                                const isIncome = mov.type === 'income';
                                return (
                                    <div key={mov.id} className="grid grid-cols-5 hover:bg-gray-50 transition-colors items-center">

                                        {/* COL 1: Fecha (Left) */}
                                        <div className="p-4 text-left flex flex-col justify-center h-full">
                                            <span className="font-bold text-gray-800 text-sm">{format(new Date(mov.created_at), 'd MMM', { locale: es })}</span>
                                            <span className="text-[10px] text-gray-400 font-mono">{format(new Date(mov.created_at), 'HH:mm')}</span>
                                        </div>

                                        {/* COL 2: Tipo (Center) */}
                                        <div className="p-4 flex items-center justify-center h-full">
                                            <div className={`flex flex-col items-center gap-1`}>
                                                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${isIncome ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                                    {isIncome ? <ArrowDownLeft size={14} strokeWidth={3} /> : <ArrowUpRight size={14} strokeWidth={3} />}
                                                </div>
                                                <span className={`text-[10px] font-bold ${isIncome ? 'text-green-600' : 'text-red-600'}`}>
                                                    {isIncome ? 'Entrada' : 'Salida'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* COL 3: Concepto (Left) */}
                                        <div className="p-4 text-left flex items-center h-full">
                                            <span className="text-sm font-medium text-gray-600 truncate w-full" title={mov.notes}>
                                                {mov.notes || '-'}
                                            </span>
                                        </div>

                                        {/* COL 4: Importe (Right) */}
                                        <div className="p-4 text-right flex items-center justify-end h-full">
                                            <span className={`font-black text-sm ${isIncome ? 'text-green-600' : 'text-red-600'}`}>
                                                {isIncome ? '+' : '-'}{mov.amount.toFixed(2)}€
                                            </span>
                                        </div>

                                        {/* COL 5: Saldo (Right) */}
                                        <div className="p-4 text-right flex items-center justify-end h-full">
                                            <span className="font-mono text-gray-400 text-xs">--</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Modal Filtros */}
            {showFilters && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white w-full max-w-xs rounded-2xl p-6 shadow-xl">
                        <div className="flex justify-between items-center mb-6"><h3 className="font-bold text-lg">Filtrar Fecha</h3><button onClick={() => setShowFilters(false)}><X size={20} className="text-gray-400" /></button></div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Año</label>
                                <div className="flex gap-2">{[2024, 2025, 2026].map(y => (<button key={y} onClick={() => setYear(y)} className={`px-4 py-2 rounded-lg text-sm font-bold border ${year === y ? 'bg-[#5B8FB9] text-white border-[#5B8FB9]' : 'bg-white text-gray-600'}`}>{y}</button>))}</div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Mes</label>
                                <div className="grid grid-cols-3 gap-2">{months.map((m, i) => (<button key={i} onClick={() => setMonth(i)} className={`py-2 rounded-lg text-xs font-bold border ${month === i ? 'bg-[#5B8FB9] text-white border-[#5B8FB9]' : 'bg-white text-gray-600'}`}>{m.substring(0, 3)}</button>))}</div>
                            </div>
                            <button onClick={() => setShowFilters(false)} className="w-full py-3 bg-[#5B8FB9] text-white font-bold rounded-xl mt-2">Aplicar Filtros</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}