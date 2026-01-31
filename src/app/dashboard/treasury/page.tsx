'use client';

import { useState, useEffect, Suspense } from 'react';
import { createClient } from "@/utils/supabase/client";
import { useSearchParams } from 'next/navigation';
import {
    Wallet,
    ArrowRightLeft,
    ArrowDown,
    ArrowUp,
    Settings,
    History,
    X,
    AlertTriangle,
    Search
} from 'lucide-react';
import { toast } from 'sonner';

// --- TIPOS ---
interface CashBox {
    id: string;
    name: string;
    type: 'operational' | 'change';
    current_balance: number;
    target_balance: number;
    inventory?: Record<string, number>;
}

interface Movement {
    id: string;
    created_at: string;
    amount: number;
    type: string;
    notes: string;
    breakdown: Record<string, number>;
}

const DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1, 0.50, 0.20, 0.10, 0.05, 0.02, 0.01];

// Componente Interno (Lógica)
function TreasuryContent() {
    const supabase = createClient();
    const searchParams = useSearchParams();
    const [boxes, setBoxes] = useState<CashBox[]>([]);
    const [loading, setLoading] = useState(true);

    // --- ESTADOS DE MODALES ---
    const [selectedBox, setSelectedBox] = useState<CashBox | null>(null);
    const [mode, setMode] = useState<'swap' | 'movement' | 'edit' | null>(null);

    // Estado para Movimientos
    const [movementType, setMovementType] = useState<'deposit' | 'expense' | 'history'>('expense');
    const [amountInputs, setAmountInputs] = useState<Record<string, number>>({});
    const [notes, setNotes] = useState('');
    const [recentMovements, setRecentMovements] = useState<Movement[]>([]);
    const [fullHistory, setFullHistory] = useState<Movement[]>([]);

    // Estado para Swap
    const [swapIn, setSwapIn] = useState<Record<string, number>>({});
    const [swapOut, setSwapOut] = useState<Record<string, number>>({});

    // Estado para Edición Manual
    const [editInventory, setEditInventory] = useState<Record<string, number>>({});

    useEffect(() => {
        fetchBoxesAndCheckParams();
    }, []);

    async function fetchBoxesAndCheckParams() {
        setLoading(true);
        const { data: boxesData } = await supabase.from('cash_boxes').select('*').order('name');

        if (boxesData) {
            const boxesWithInv = await Promise.all(boxesData.map(async (box) => {
                const { data: inv } = await supabase
                    .from('cash_box_inventory')
                    .select('denomination, quantity')
                    .eq('box_id', box.id);

                const inventoryMap: Record<string, number> = {};
                inv?.forEach(i => inventoryMap[i.denomination.toString()] = i.quantity);
                return { ...box, inventory: inventoryMap };
            }));

            const sorted = boxesWithInv.sort((a, b) => {
                if (a.type === 'operational') return -1;
                if (b.type === 'operational') return 1;
                return a.name.localeCompare(b.name);
            });

            setBoxes(sorted);

            const boxIdToOpen = searchParams.get('openBox');
            if (boxIdToOpen) {
                const targetBox = sorted.find(b => b.id === boxIdToOpen);
                if (targetBox) {
                    openBox(targetBox);
                }
            }
        }
        setLoading(false);
    }

    async function fetchHistory(boxId: string, limit = 10) {
        const { data } = await supabase
            .from('treasury_movements')
            .select('*')
            .eq('source_box_id', boxId)
            .or(`destination_box_id.eq.${boxId},source_box_id.eq.${boxId}`)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (limit === 10) setRecentMovements(data || []);
        else setFullHistory(data || []);
    }

    const loadFullHistory = () => {
        if (selectedBox) fetchHistory(selectedBox.id, 100);
        setMovementType('history');
    };

    const handleOperationalMovement = async () => {
        if (movementType === 'history') return;
        const total = Object.entries(amountInputs).reduce((sum, [d, q]) => sum + (parseFloat(d) * q), 0);
        if (total <= 0) return toast.error("Importe inválido");
        if (!notes) return toast.error("Añade un concepto");

        if (movementType === 'expense') {
            for (const [denom, qty] of Object.entries(amountInputs)) {
                if ((selectedBox?.inventory?.[denom] || 0) < qty) {
                    return toast.error(`No hay suficientes billetes de ${denom}€`);
                }
            }
        }

        try {
            const { data: { user } } = await supabase.auth.getUser();

            await supabase.from('treasury_movements').insert({
                created_by: user?.id,
                source_box_id: movementType === 'expense' ? selectedBox?.id : null,
                destination_box_id: movementType === 'deposit' ? selectedBox?.id : null,
                amount: total,
                type: movementType,
                notes: notes,
                breakdown: amountInputs
            });

            const multiplier = movementType === 'deposit' ? 1 : -1;
            for (const [denom, qty] of Object.entries(amountInputs)) {
                if (selectedBox) {
                    await rpcUpdateInventory(selectedBox.id, parseFloat(denom), qty * multiplier);
                }
            }
            if (selectedBox) {
                await rpcUpdateBalance(selectedBox.id, total * multiplier);
            }

            toast.success("Movimiento registrado");
            setAmountInputs({});
            setNotes('');
            fetchBoxesAndCheckParams();
            if (selectedBox) fetchHistory(selectedBox.id);
        } catch (e) { toast.error("Error al guardar"); }
    };

    const handleSwap = async () => {
        const totalIn = Object.entries(swapIn).reduce((sum, [d, q]) => sum + (parseFloat(d) * q), 0);
        const totalOut = Object.entries(swapOut).reduce((sum, [d, q]) => sum + (parseFloat(d) * q), 0);

        if (Math.abs(totalIn - totalOut) > 0.01) return toast.error(`Descuadre: Entran ${totalIn.toFixed(2)}€ y Salen ${totalOut.toFixed(2)}€.`);
        if (totalIn === 0) return toast.error("Indica cantidades");

        for (const [denom, qty] of Object.entries(swapOut)) {
            if ((selectedBox?.inventory?.[denom] || 0) < qty) return toast.error(`Falta stock de ${denom}€.`);
        }

        try {
            const { data: { user } } = await supabase.auth.getUser();
            await supabase.from('treasury_movements').insert({
                created_by: user?.id,
                source_box_id: selectedBox?.id,
                amount: totalIn,
                type: 'swap',
                notes: `Cambio: Entra ${totalIn.toFixed(2)}€`,
                breakdown: { in: swapIn, out: swapOut }
            });

            if (selectedBox) {
                for (const [denom, qty] of Object.entries(swapIn)) await rpcUpdateInventory(selectedBox.id, parseFloat(denom), qty);
                for (const [denom, qty] of Object.entries(swapOut)) await rpcUpdateInventory(selectedBox.id, parseFloat(denom), -qty);
            }

            toast.success("Cambio realizado");
            closeModal();
            fetchBoxesAndCheckParams();
        } catch (e) { toast.error("Error en cambio"); }
    };

    const handleManualEdit = async () => {
        if (!confirm("Esto sobrescribirá el stock de la caja. ¿Seguro?")) return;
        const newTotal = Object.entries(editInventory).reduce((sum, [d, q]) => sum + (parseFloat(d) * q), 0);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            await supabase.from('treasury_movements').insert({
                created_by: user?.id,
                source_box_id: selectedBox?.id,
                amount: newTotal,
                type: 'manual_adjustment',
                notes: 'Arqueo/Corrección manual',
                breakdown: editInventory
            });
            for (const denom of DENOMINATIONS) {
                const newQty = editInventory[denom.toString()] || 0;
                const { data } = await supabase.from('cash_box_inventory').select('id').eq('box_id', selectedBox?.id).eq('denomination', denom).maybeSingle();
                if (data) await supabase.from('cash_box_inventory').update({ quantity: newQty }).eq('id', data.id);
                else if (newQty > 0) await supabase.from('cash_box_inventory').insert({ box_id: selectedBox?.id, denomination: denom, quantity: newQty });
            }
            if (selectedBox) {
                await supabase.from('cash_boxes').update({ current_balance: newTotal }).eq('id', selectedBox.id);
            }
            toast.success("Inventario actualizado");
            closeModal();
            fetchBoxesAndCheckParams();
        } catch (e) { toast.error("Error al actualizar"); }
    };

    const rpcUpdateInventory = async (boxId: string, denom: number, delta: number) => {
        const { data } = await supabase.from('cash_box_inventory').select('quantity').eq('box_id', boxId).eq('denomination', denom).maybeSingle();
        const current = data?.quantity || 0;
        if (!data && delta > 0) await supabase.from('cash_box_inventory').insert({ box_id: boxId, denomination: denom, quantity: delta });
        else if (data) await supabase.from('cash_box_inventory').update({ quantity: current + delta }).eq('box_id', boxId).eq('denomination', denom);
    };
    const rpcUpdateBalance = async (boxId: string, delta: number) => {
        const { data } = await supabase.from('cash_boxes').select('current_balance').eq('id', boxId).single();
        await supabase.from('cash_boxes').update({ current_balance: (data?.current_balance || 0) + delta }).eq('id', boxId);
    };

    const closeModal = () => {
        setSelectedBox(null);
        setMode(null);
        setAmountInputs({});
        setSwapIn({});
        setSwapOut({});
        setNotes('');
        setRecentMovements([]);
    };

    const openBox = (box: CashBox) => {
        setSelectedBox(box);
        if (box.type === 'operational') {
            setMode('movement');
            setMovementType('expense');
            fetchHistory(box.id);
        } else {
            setMode(null);
        }
    };

    const calculateTotal = (record: Record<string, number>) => Object.entries(record).reduce((s, [d, q]) => s + parseFloat(d) * q, 0);

    return (
        <div className="p-4 md:p-8 w-full max-w-7xl mx-auto space-y-8 pb-24">
            <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
                <Settings /> Gestión de Efectivo
            </h1>

            {/* GRID DE CAJAS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {boxes.map(box => (
                    <div
                        key={box.id}
                        onClick={() => openBox(box)}
                        className="bg-white rounded-[2rem] p-6 shadow-xl overflow-hidden group cursor-pointer active:scale-95 transition-transform"
                    >
                        {/* HEADER DE LA TARJETA */}
                        <div className="flex justify-between items-start mb-4">
                            <h2 className="text-2xl font-black text-[#36606F] truncate pr-2">
                                {box.name.replace(' (Operativa)', '')}
                            </h2>
                            {box.type === 'operational' && <History size={20} className="text-gray-300 mt-1" />}
                        </div>

                        <div className="flex items-baseline gap-2 mb-4">
                            <span className={`text-4xl font-black tracking-tight ${box.current_balance < 0 ? 'text-red-500' : 'text-gray-800'}`}>
                                {box.current_balance.toFixed(2)}€
                            </span>
                        </div>

                        <div className="flex gap-1 overflow-hidden h-8 items-center opacity-60">
                            {DENOMINATIONS.slice(0, 6).map(d => box.inventory?.[d.toString()] ? (
                                <div key={d} className="bg-gray-100 px-1.5 py-0.5 rounded text-[10px] font-bold text-gray-600 border border-gray-200">
                                    {d}€
                                </div>
                            ) : null)}
                            <span className="text-[10px] text-gray-400">...</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* --- MODAL PRINCIPAL --- */}
            {selectedBox && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 md:p-4">
                    <div className="bg-white w-full max-w-4xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[95vh] md:max-h-[90vh] animate-in zoom-in-95 duration-200">

                        {/* Header Modal */}
                        <div className={`p-4 md:p-6 border-b flex justify-between items-center ${selectedBox.type === 'operational' ? 'bg-blue-50' : 'bg-orange-50'}`}>
                            <div>
                                <h3 className="text-lg md:text-xl font-black text-gray-800">{selectedBox.name.replace(' (Operativa)', '')}</h3>
                                <p className="text-xs md:text-sm text-gray-500 font-bold">Saldo: {selectedBox.current_balance.toFixed(2)}€</p>
                            </div>
                            <div className="flex items-center gap-2">
                                {selectedBox.type === 'operational' && mode !== 'edit' && (
                                    <button
                                        onClick={() => { setEditInventory(selectedBox.inventory || {}); setMode('edit'); }}
                                        className="bg-white p-2 rounded-full shadow hover:bg-gray-100 text-gray-500 hover:text-blue-600 transition-colors"
                                        title="Arqueo Manual / Ajuste"
                                    >
                                        <Settings size={20} />
                                    </button>
                                )}
                                <button onClick={closeModal} className="bg-white p-2 rounded-full shadow hover:bg-gray-100 text-gray-500"><X size={20} /></button>
                            </div>
                        </div>

                        {/* A. CAJA OPERATIVA */}
                        {selectedBox.type === 'operational' && mode === 'movement' && (
                            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

                                <div className="flex-1 p-4 md:p-6 overflow-y-auto custom-scrollbar border-r border-gray-100">
                                    <div className="flex gap-2 mb-6 p-1 bg-gray-100 rounded-2xl">
                                        <button onClick={() => setMovementType('expense')} className={`flex-1 py-2 rounded-xl font-bold text-xs transition-all ${movementType === 'expense' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>SALIDA</button>
                                        <button onClick={() => setMovementType('deposit')} className={`flex-1 py-2 rounded-xl font-bold text-xs transition-all ${movementType === 'deposit' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>ENTRADA</button>
                                        <button onClick={loadFullHistory} className={`flex-1 py-2 rounded-xl font-bold text-xs transition-all ${movementType === 'history' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>HISTÓRICO</button>
                                    </div>

                                    {movementType !== 'history' && (
                                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                            <div>
                                                <label className="text-xs font-bold text-gray-400 uppercase">Concepto</label>
                                                <input autoFocus type="text" className="w-full p-3 bg-gray-50 rounded-xl border font-bold outline-none focus:border-blue-500" placeholder={movementType === 'expense' ? "Ej: Compra Hielo" : "Ej: Ingreso Cambio"} value={notes} onChange={e => setNotes(e.target.value)} />
                                            </div>

                                            <div>
                                                <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">Desglose</label>
                                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                                    {DENOMINATIONS.map(denom => (
                                                        <div key={denom} className={`p-2 rounded-lg border flex items-center gap-1 ${amountInputs[denom.toString()] ? 'bg-blue-50 border-blue-300' : 'bg-white'}`}>
                                                            <span className="text-xs font-bold w-10 text-right">{denom}</span>
                                                            <input
                                                                type="number" placeholder="0"
                                                                className="w-full bg-transparent text-center font-bold outline-none"
                                                                onChange={(e) => {
                                                                    const val = parseInt(e.target.value) || 0;
                                                                    setAmountInputs(p => ({ ...p, [denom.toString()]: val }));
                                                                }}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="pt-4">
                                                <div className="flex justify-between items-end mb-2">
                                                    <span className="text-xs font-bold uppercase text-gray-400">Total</span>
                                                    <span className={`text-2xl font-black ${movementType === 'expense' ? 'text-red-600' : 'text-green-600'}`}>
                                                        {calculateTotal(amountInputs).toFixed(2)}€
                                                    </span>
                                                </div>
                                                <button onClick={handleOperationalMovement} className="w-full py-4 bg-[#36606F] text-white rounded-xl font-bold shadow-lg hover:bg-[#2c4e5a]">
                                                    REGISTRAR
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {movementType === 'history' && (
                                        <div className="space-y-3 animate-in fade-in slide-in-from-right-2 duration-300 h-full">
                                            <div className="flex items-center gap-2 mb-4">
                                                <Search size={16} className="text-gray-400" />
                                                <input type="text" placeholder="Buscar movimientos..." className="bg-transparent text-sm font-bold outline-none w-full" />
                                            </div>
                                            <div className="divide-y divide-gray-50">
                                                {fullHistory.length === 0 && <p className="text-center text-gray-400 text-sm py-10">Cargando histórico...</p>}
                                                {fullHistory.map(mov => (
                                                    <div key={mov.id} className="py-3 flex justify-between items-center group">
                                                        <div>
                                                            <div className="text-xs font-bold text-gray-400 mb-0.5">
                                                                {new Date(mov.created_at).toLocaleDateString()} <span className="text-[10px] opacity-70">{new Date(mov.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                            </div>
                                                            <div className="text-sm font-bold text-gray-700">{mov.notes}</div>
                                                        </div>
                                                        <div className={`text-base font-black ${mov.type === 'expense' ? 'text-red-500' : (mov.type === 'deposit' ? 'text-green-600' : 'text-blue-600')}`}>
                                                            {mov.type === 'expense' ? '-' : (mov.type === 'deposit' ? '+' : '')}{mov.amount.toFixed(2)}€
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {movementType !== 'history' && (
                                    <div className="w-full md:w-80 bg-gray-50 p-4 md:p-6 overflow-y-auto hidden md:block border-l border-gray-100">
                                        <h4 className="text-xs font-bold text-gray-400 uppercase mb-4">Últimos Movimientos</h4>
                                        <div className="space-y-3">
                                            {recentMovements.length === 0 && <p className="text-sm text-gray-400 italic">Sin registros recientes</p>}
                                            {recentMovements.map(mov => (
                                                <div key={mov.id} className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
                                                    <div className="flex justify-between items-start">
                                                        <span className="text-xs font-bold text-gray-600 line-clamp-2">{mov.notes}</span>
                                                        <span className={`text-xs font-black whitespace-nowrap ml-2 ${mov.type === 'expense' ? 'text-red-500' : 'text-green-500'}`}>
                                                            {mov.type === 'expense' ? '-' : '+'}{mov.amount.toFixed(2)}€
                                                        </span>
                                                    </div>
                                                    <span className="text-[10px] text-gray-300 mt-1 block">
                                                        {new Date(mov.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* B. CAJAS DE CAMBIO */}
                        {selectedBox.type === 'change' && !mode && (
                            <div className="p-4 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                                <button onClick={() => setMode('swap')} className="flex flex-col items-center justify-center gap-4 p-8 bg-orange-50 rounded-[2rem] border-2 border-orange-100 hover:border-orange-300 active:scale-95 transition-all">
                                    <div className="w-16 h-16 bg-orange-200 rounded-full flex items-center justify-center text-orange-700">
                                        <ArrowRightLeft size={32} />
                                    </div>
                                    <div className="text-center">
                                        <h3 className="text-lg font-black text-gray-800">Hacer Cambio</h3>
                                        <p className="text-xs text-gray-500 mt-1">Entra dinero / Sale cambio</p>
                                    </div>
                                </button>
                                <button onClick={() => { setEditInventory(selectedBox.inventory || {}); setMode('edit'); }} className="flex flex-col items-center justify-center gap-4 p-8 bg-gray-50 rounded-[2rem] border-2 border-gray-100 hover:border-gray-300 active:scale-95 transition-all">
                                    <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center text-gray-700">
                                        <Settings size={32} />
                                    </div>
                                    <div className="text-center">
                                        <h3 className="text-lg font-black text-gray-800">Arqueo</h3>
                                        <p className="text-xs text-gray-500 mt-1">Corregir inventario manual</p>
                                    </div>
                                </button>
                            </div>
                        )}

                        {/* C. SWAP */}
                        {mode === 'swap' && (
                            <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden">
                                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 overflow-y-auto custom-scrollbar pb- safe">
                                    <div className="space-y-3">
                                        <h4 className="font-bold text-green-600 flex items-center gap-2 border-b pb-2 sticky top-0 bg-white z-10"><ArrowDown size={16} /> ENTRA</h4>
                                        {DENOMINATIONS.map(d => (
                                            <div key={d} className="flex items-center gap-2">
                                                <span className="w-10 text-xs font-bold text-right">{d}</span>
                                                <input type="number" placeholder="0" className="flex-1 p-2 bg-green-50 rounded-lg text-center font-bold outline-none" onChange={e => setSwapIn(p => ({ ...p, [d.toString()]: parseInt(e.target.value) || 0 }))} />
                                            </div>
                                        ))}
                                    </div>
                                    <div className="space-y-3">
                                        <h4 className="font-bold text-red-600 flex items-center gap-2 border-b pb-2 sticky top-0 bg-white z-10"><ArrowUp size={16} /> SALE</h4>
                                        {DENOMINATIONS.map(d => (
                                            <div key={d} className="flex items-center gap-2">
                                                <span className="w-10 text-xs font-bold text-right">{d}</span>
                                                <input type="number" placeholder="0" className="flex-1 p-2 bg-red-50 rounded-lg text-center font-bold outline-none" onChange={e => setSwapOut(p => ({ ...p, [d.toString()]: parseInt(e.target.value) || 0 }))} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="mt-4 pt-4 border-t flex flex-col md:flex-row justify-between items-center bg-gray-50 p-4 rounded-xl gap-4">
                                    <div className="flex items-center justify-between w-full md:w-auto gap-4">
                                        <div className="text-center md:text-left">
                                            <div className="text-[10px] font-bold uppercase text-green-600">Entra</div>
                                            <div className="text-lg md:text-xl font-black text-gray-800">{Object.entries(swapIn).reduce((s, [d, q]) => s + parseFloat(d) * q, 0).toFixed(2)}€</div>
                                        </div>
                                        <div className="text-gray-300 font-light text-2xl">/</div>
                                        <div className="text-center md:text-left">
                                            <div className="text-[10px] font-bold uppercase text-red-500">Sale</div>
                                            <div className="text-lg md:text-xl font-black text-gray-800">{Object.entries(swapOut).reduce((s, [d, q]) => s + parseFloat(d) * q, 0).toFixed(2)}€</div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 w-full md:w-auto justify-end">
                                        <button onClick={() => setMode(null)} className="px-4 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-lg">Atrás</button>
                                        <button onClick={handleSwap} className="px-6 py-2 bg-[#36606F] text-white font-bold rounded-lg shadow hover:bg-[#2c4e5a]">Confirmar</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* D. EDICIÓN MANUAL */}
                        {mode === 'edit' && (
                            <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden">
                                <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-xl mb-4 text-xs text-yellow-800 flex items-center gap-2">
                                    <AlertTriangle size={16} /> Estás editando el inventario real de {selectedBox.name.replace(' (Operativa)', '')}.
                                </div>
                                <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-3 overflow-y-auto custom-scrollbar">
                                    {DENOMINATIONS.map(d => (
                                        <div key={d} className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg">
                                            <span className="w-10 text-right font-black text-gray-600">{d}€</span>
                                            <input
                                                type="number"
                                                className="w-full bg-white p-1 rounded border text-center font-bold"
                                                value={editInventory[d.toString()] ?? 0}
                                                onChange={e => setEditInventory(p => ({ ...p, [d.toString()]: parseInt(e.target.value) || 0 }))}
                                            />
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-4 pt-4 border-t flex flex-col md:flex-row justify-between items-center gap-4">
                                    <div className="text-sm font-bold">
                                        Nuevo Saldo: {calculateTotal(editInventory).toFixed(2)}€
                                    </div>
                                    <div className="flex gap-2 w-full md:w-auto">
                                        <button
                                            onClick={() => {
                                                if (selectedBox.type === 'operational') setMode('movement');
                                                else setMode(null);
                                            }}
                                            className="flex-1 md:flex-none px-4 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-lg"
                                        >
                                            Cancelar
                                        </button>
                                        <button onClick={handleManualEdit} className="flex-1 md:flex-none px-6 py-2 bg-blue-600 text-white font-bold rounded-lg shadow hover:bg-blue-700">Guardar</button>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            )}
        </div>
    );
}

export default function TreasuryPage() {
    return (
        <Suspense fallback={<div className="p-8 text-white">Cargando tesorería...</div>}>
            <TreasuryContent />
        </Suspense>
    );
}