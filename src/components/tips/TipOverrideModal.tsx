'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, Save } from 'lucide-react';
import { cn } from '@/lib/utils';

type PoolType = 'weekday' | 'weekend';

export type TipOverrideDraft = {
  overrideHours: number | null;
  overrideAmount: number | null;
  notes: string;
};

export function TipOverrideModal({
  isOpen,
  onClose,
  employeeName,
  poolType,
  initial,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  employeeName: string;
  poolType: PoolType;
  initial?: TipOverrideDraft;
  onSave: (draft: TipOverrideDraft) => Promise<void> | void;
}) {
  const [overrideHours, setOverrideHours] = useState<number | ''>('');
  const [overrideAmount, setOverrideAmount] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setOverrideHours(initial?.overrideHours ?? '');
    setOverrideAmount(initial?.overrideAmount ?? '');
    setNotes(initial?.notes ?? '');
  }, [isOpen, initial]);

  const title = useMemo(() => (poolType === 'weekday' ? 'Entre semana' : 'Fin de semana'), [poolType]);

  if (!isOpen) return null;

  const canSave =
    (overrideHours !== '' && Number(overrideHours) >= 0) ||
    (overrideAmount !== '' && Number(overrideAmount) >= 0) ||
    (notes || '').trim().length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        overrideHours: overrideHours === '' ? null : Number(overrideHours),
        overrideAmount: overrideAmount === '' ? null : Number(overrideAmount),
        notes: (notes || '').trim(),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-[520px] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#36606F] px-6 py-4 flex items-center justify-between text-white shrink-0">
          <div className="min-w-0">
            <h3 className="text-lg font-black uppercase tracking-wider leading-none truncate">Override propina</h3>
            <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mt-1 truncate">
              {employeeName} • {title}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-11 h-11 flex items-center justify-center bg-white/10 rounded-2xl hover:bg-white/20 transition-all active:scale-95 shrink-0"
          >
            <X size={20} strokeWidth={3} />
          </button>
        </div>

        <div className="p-4 bg-gray-50 flex-1 overflow-y-auto space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-3">
              <label className="block text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-2">
                Horas (override)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={overrideHours}
                onChange={(e) => setOverrideHours(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full h-12 rounded-2xl border border-zinc-200 px-4 font-black text-zinc-800 outline-none focus:ring-2 focus:ring-[#5B8FB9]/20 focus:border-[#5B8FB9]/40"
                placeholder="(vacío = usar horas reales)"
              />
            </div>

            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-3">
              <label className="block text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-2">
                Importe (override)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={overrideAmount}
                  onChange={(e) => setOverrideAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full h-12 rounded-2xl border border-zinc-200 px-4 pr-10 font-black text-zinc-800 outline-none focus:ring-2 focus:ring-[#5B8FB9]/20 focus:border-[#5B8FB9]/40"
                  placeholder="(vacío = reparto por horas)"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 font-black">€</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-3">
            <label className="block text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-2">Notas</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full h-12 rounded-2xl border border-zinc-200 px-4 font-bold text-zinc-700 outline-none focus:ring-2 focus:ring-[#5B8FB9]/20 focus:border-[#5B8FB9]/40"
              placeholder="Opcional…"
            />
          </div>

          <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-3">
            <p className="text-[10px] font-bold text-zinc-500 leading-relaxed">
              - Si pones <b>Horas</b>, el reparto por horas usa ese valor.\n
              - Si pones <b>Importe</b>, manda sobre el reparto calculado.\n
              - Si dejas ambos vacíos, se usa el cálculo 100% BD.
            </p>
          </div>
        </div>

        <div className="p-3 bg-white border-t border-zinc-100 shrink-0">
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              className={cn(
                'flex-[2] h-12 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2',
                canSave && !saving
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200'
                  : 'bg-zinc-100 text-zinc-300 cursor-not-allowed border border-zinc-200'
              )}
            >
              <Save size={18} strokeWidth={3} />
              Guardar
            </button>
            <button
              onClick={onClose}
              className="flex-1 h-12 bg-rose-500 text-white font-black uppercase tracking-widest rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2 shadow-md shadow-rose-200 text-[11px]"
            >
              <X size={16} strokeWidth={3} />
              Salir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

