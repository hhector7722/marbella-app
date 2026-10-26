'use client';

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { createClient } from '@/utils/supabase/client';
import { Modal } from '@/components/ui/modal';
import { CashBreakdownModal } from '@/components/cash/CashBreakdownModal';

type Closing = {
    id: string; closed_at: string; closing_date: string; tpv_sales: number;
    sales_card: number; sales_pending: number; debt_recovered: number;
    net_sales: number; cash_expected: number; cash_counted: number; difference: number;
    cash_withdrawn: number | null; cash_left: number | null;
    breakdown: Record<string, number> | null;
};
type NumberField = 'tpv_sales' | 'sales_card' | 'sales_pending' | 'debt_recovered' | 'cash_counted';

function computed(input: Closing): Closing {
    const expected = Number(input.tpv_sales) - Number(input.sales_card)
        - Number(input.sales_pending) + Number(input.debt_recovered);
    return {
        ...input,
        net_sales: Math.round(Number(input.tpv_sales) / 1.1 * 100) / 100,
        cash_expected: Math.round(expected * 100) / 100,
        difference: Math.round((Number(input.cash_counted) - expected) * 100) / 100,
    };
}
function euros(v: number) {
    return v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

export default function VentasClosingEditor({ closingId, onClose, onSaved }: {
    closingId: string | null;
    onClose: () => void;
    onSaved: () => void;
}) {
    const supabase = useMemo(() => createClient(), []);
    const [current, setCurrent] = useState<Closing | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [breakdownOpen, setBreakdownOpen] = useState(false);
    useEffect(() => {
        if (!closingId) return;
        let live = true;
        void (async () => {
            const { data, error } = await supabase.from('cash_closings').select('*').eq('id', closingId).maybeSingle();
            if (!live) return;
            if (error || !data) toast.error('No se pudo abrir el cierre');
            else setCurrent({
                ...data,
                breakdown: data.breakdown && typeof data.breakdown === 'object' && !Array.isArray(data.breakdown)
                    ? data.breakdown as Record<string, number> : {},
            } as Closing);
            setLoading(false);
        })();
        return () => { live = false; };
    }, [closingId, supabase]);

    const setNumber = (key: NumberField, value: number) => {
        if (!Number.isFinite(value)) return;
        setCurrent(old => {
            if (!old) return null;
            if (key === 'cash_counted') {
                const purchases = Math.max(0, Number(old.cash_counted) - Number(old.cash_withdrawn ?? old.cash_counted));
                return computed({ ...old, cash_counted: value,
                    cash_withdrawn: Math.max(0, Math.round((value - purchases) * 100) / 100) });
            }
            return computed({ ...old, [key]: value });
        });
    };
    const updateBreakdown = (den: string, qty: number) => {
        setCurrent(old => {
            if (!old) return null;
            const breakdown = { ...old.breakdown, [den]: Math.max(0, qty) };
            const total = Math.round(Object.entries(breakdown).reduce((sum, [unit, count]) =>
                sum + Number(unit) * Number(count || 0), 0) * 100) / 100;
            const previousPurchases = Math.max(0, Number(old.cash_counted) - Number(old.cash_withdrawn ?? old.cash_counted));
            if (total + 0.005 < previousPurchases) {
                toast.error('El arqueo no puede ser inferior a las compras TPV2');
                return old;
            }
            return computed({ ...old, breakdown, cash_counted: total, cash_withdrawn: Math.round((total - previousPurchases) * 100) / 100, cash_left: 0 });
        });
    };
    const save = async (close = true): Promise<boolean> => {
        if (!current || saving || current.id !== closingId) return false;
        setSaving(true);
        try {
            const closing = computed(current);
            const { error } = await supabase.from('cash_closings').update({
                closed_at: closing.closed_at, closing_date: closing.closing_date,
                tpv_sales: closing.tpv_sales, net_sales: closing.tpv_sales / 1.10,
                sales_card: closing.sales_card, sales_pending: closing.sales_pending,
                debt_recovered: closing.debt_recovered, cash_expected: closing.cash_expected,
                cash_counted: closing.cash_counted, difference: closing.difference,
                breakdown: closing.breakdown, cash_withdrawn: closing.cash_withdrawn,
                cash_left: closing.cash_left,
            }).eq('id', closing.id);
            if (error) throw error;
            toast.success('Cierre actualizado');
            onSaved();
            if (close) onClose();
            return true;
        } catch (error) {
            toast.error('Error al guardar: ' + (error instanceof Error ? error.message : 'No disponible'));
            return false;
        } finally {
            setSaving(false);
        }
    };
    const numbers: { key: NumberField; label: string }[] = [
        { key: 'tpv_sales', label: 'Ventas TPV' },
        { key: 'sales_card', label: 'Tarjeta' },
        { key: 'sales_pending', label: 'Pendiente' },
        { key: 'debt_recovered', label: 'Cobros de deuda' },
        { key: 'cash_counted', label: 'Efectivo contado' },
    ];
    return (
        <>
            <Modal open={closingId !== null} onClose={saving ? () => {} : onClose}
                title="Editar cierre" subtitle={current?.closing_date ?? ''} scheme="dark"
                variant="standard" instance="ventas-closing-edit">
                <div className="space-y-3 px-3 py-4 text-white">
                    {!current || current.id !== closingId ? <p className="py-10 text-center text-sm text-white/60">{loading ? 'Cargando cierre…' : 'Cargando datos…'}</p> : (
                        <>
                            <label className="flex flex-col gap-1 text-xs text-white/75">
                                Fecha y hora del cierre
                                <input type="datetime-local" className="rounded-lg border border-white/20 bg-white/10 p-2 text-sm text-white"
                                    value={current.closed_at ? format(new Date(current.closed_at), "yyyy-MM-dd'T'HH:mm") : ''}
                                    onChange={event => {
                                        const value = event.target.value;
                                        if (!value) return;
                                        const date = new Date(value);
                                        if (!Number.isFinite(date.getTime())) return;
                                        setCurrent(old => old ? { ...old, closed_at: date.toISOString(), closing_date: value.slice(0,10) } : old);
                                    }}/>
                            </label>
                            <div className="space-y-2">
                                {numbers.map(({ key, label }) => (
                                    <label key={key} className="grid grid-cols-[1fr_115px] items-center gap-3 text-xs">
                                        <span>{label}</span>
                                        <input type="number" inputMode="decimal" step="0.01" min="0"
                                            className="w-full rounded-lg border border-white/20 bg-white/10 px-2 py-2 text-right text-sm tabular-nums"
                                            value={Number(current[key] ?? 0)}
                                            onChange={event => setNumber(key, Number(event.target.value))}/>
                                    </label>
                                ))}
                            </div>
                            <button type="button" onClick={() => setBreakdownOpen(true)}
                                className="w-full rounded-lg border border-sky-300/30 bg-sky-400/10 p-3 text-sm">
                                Editar desglose de billetes y monedas
                            </button>
                            <div className="space-y-1 rounded-lg border border-white/15 bg-white/5 p-3 text-xs">
                                <div className="flex justify-between"><span>Venta neta (10% IVA)</span><strong>{euros(computed(current).net_sales)}</strong></div>
                                <div className="flex justify-between"><span>Efectivo esperado</span><strong>{euros(computed(current).cash_expected)}</strong></div>
                                <div className="flex justify-between"><span>Diferencia</span><strong>{euros(computed(current).difference)}</strong></div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 pt-2">
                                <button type="button" disabled={saving} onClick={onClose} className="rounded-lg border border-white/20 p-3 text-xs">Cancelar</button>
                                <button type="button" disabled={saving} onClick={() => void save()}
                                    className="rounded-lg bg-sky-400 p-3 text-xs font-bold text-slate-950">{saving ? 'Guardando…' : 'Guardar cierre'}</button>
                            </div>
                        </>
                    )}
                </div>
            </Modal>
            {current && (
                <CashBreakdownModal isOpen={breakdownOpen} onClose={() => setBreakdownOpen(false)}
                    parentInstance="ventas-closing-edit" instance="ventas-closing-breakdown"
                    breakdown={current.breakdown} date={current.closed_at} total={current.cash_counted}
                    isEditing onUpdate={updateBreakdown} saving={saving}
                    onSave={() => { void save(false).then(ok => { if (ok) setBreakdownOpen(false); }); }}/>
            )}
        </>
    );
}
