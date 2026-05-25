'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, Save } from 'lucide-react';
import { createPortal } from 'react-dom';
import { createClient } from '@/utils/supabase/client';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { QuickCalculatorModal, FloatingCalculatorFab } from '@/components/ui/QuickCalculatorModal';

type PoolType = 'weekday' | 'weekend';

export type TipOverrideDraft = {
  isSanctioned: boolean;
  notes: string;
};

function firstNameOnly(fullName: string): string {
  return (fullName || '').trim().split(/\s+/)[0] || fullName || '';
}

export function TipOverrideModal({
  isOpen,
  onClose,
  staffId,
  employeeName,
  poolType,
  initial,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  staffId: string;
  employeeName: string;
  poolType: PoolType;
  initial?: TipOverrideDraft;
  onSave: (draft: TipOverrideDraft) => Promise<void> | void;
}) {
  const [isSanctioned, setIsSanctioned] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<{ first_name: string; avatar_url: string | null } | null>(null);
  const [calculatorOpen, setCalculatorOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setIsSanctioned(initial?.isSanctioned ?? false);
    setNotes(initial?.notes ?? '');
    setProfile(null);
    if (staffId) {
      const supabase = createClient();
      supabase
        .from('profiles')
        .select('first_name, avatar_url')
        .eq('id', staffId)
        .single()
        .then(({ data }) => setProfile(data || null));
    }
  }, [isOpen, staffId, initial]);

  const displayName = useMemo(
    () => (profile?.first_name ? profile.first_name.trim() : firstNameOnly(employeeName)),
    [profile?.first_name, employeeName]
  );

  if (!isOpen) return null;

  const canSave = true; // Siempre se puede guardar

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        isSanctioned,
        notes: (notes || '').trim(),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const modal = (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-[520px] rounded-xl md:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] z-[10000]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#36606F] px-3 py-2.5 md:px-6 md:py-4 flex items-center justify-between text-white shrink-0 rounded-t-xl md:rounded-t-3xl">
          <div className="min-w-0 flex items-center gap-2 md:gap-3">
            <Avatar src={profile?.avatar_url ?? undefined} alt={displayName} size="sm" className="shrink-0 ring-2 ring-white/30" />
            <span className="text-sm md:text-lg font-black uppercase tracking-wider truncate">{displayName}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onClose}
              className="w-10 h-10 md:w-11 md:h-11 flex items-center justify-center bg-white/10 rounded-xl md:rounded-2xl hover:bg-white/20 transition-all active:scale-95 min-h-[44px] min-w-[48px]"
            >
              <X size={18} strokeWidth={3} className="md:w-5 md:h-5" />
            </button>
          </div>
        </div>
        <QuickCalculatorModal isOpen={calculatorOpen} onClose={() => setCalculatorOpen(false)} />
        <FloatingCalculatorFab isOpen={calculatorOpen} onToggle={() => setCalculatorOpen(true)} />

        <div className="p-2.5 md:p-4 bg-gray-50 flex-1 overflow-y-auto space-y-2 md:space-y-3">
          <div className="bg-white rounded-xl md:rounded-2xl border border-zinc-100 shadow-sm p-4 md:p-5">
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative flex items-center justify-center w-6 h-6 md:w-8 md:h-8 rounded-lg border-2 border-zinc-300 bg-zinc-50 transition-all group-hover:border-rose-400">
                <input
                  type="checkbox"
                  checked={isSanctioned}
                  onChange={(e) => setIsSanctioned(e.target.checked)}
                  className="peer absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <div className={cn(
                  "absolute inset-0 rounded-md transition-all scale-0 opacity-0 bg-rose-500",
                  isSanctioned && "scale-100 opacity-100"
                )} />
                <X 
                  strokeWidth={4} 
                  className={cn(
                    "relative z-10 w-4 h-4 md:w-5 md:h-5 text-white transition-all scale-0 opacity-0",
                    isSanctioned && "scale-100 opacity-100"
                  )} 
                />
              </div>
              <div className="flex flex-col">
                <span className="text-sm md:text-base font-black text-rose-600 uppercase tracking-wide">
                  Sin propina
                </span>
                <span className="text-[9px] md:text-[11px] font-bold text-zinc-400 leading-tight">
                  Excluye a este empleado del reparto y su parte se distribuye equitativamente.
                </span>
              </div>
            </label>
          </div>

          <div className="bg-white rounded-xl md:rounded-2xl border border-zinc-100 shadow-sm p-2 md:p-3">
            <label className="block text-[7px] md:text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 md:mb-2">Notas</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full min-h-[44px] h-10 md:h-12 rounded-xl md:rounded-2xl border border-zinc-200 px-3 md:px-4 text-sm font-bold text-zinc-700 outline-none focus:ring-2 focus:ring-[#5B8FB9]/20 focus:border-[#5B8FB9]/40"
              placeholder="Opcional…"
            />
          </div>
        </div>

        <div className="p-2 md:p-3 bg-white border-t border-zinc-100 shrink-0">
          <div className="flex gap-1.5 md:gap-2">
            <button
              onClick={onClose}
              className="flex-1 min-h-[44px] h-10 md:h-12 bg-rose-500 text-white font-black uppercase tracking-widest rounded-xl md:rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-1.5 md:gap-2 shadow-md shadow-rose-200 text-[9px] md:text-[11px]"
            >
              <X size={14} strokeWidth={3} className="md:w-4 md:h-4" />
              Salir
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              className={cn(
                'flex-[2] min-h-[44px] h-10 md:h-12 rounded-xl md:rounded-2xl font-black text-[9px] md:text-[11px] uppercase tracking-widest shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 md:gap-2',
                canSave && !saving
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200'
                  : 'bg-zinc-100 text-zinc-300 cursor-not-allowed border border-zinc-200'
              )}
            >
              <Save size={16} strokeWidth={3} className="md:w-[18px] md:h-[18px]" />
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return modal;
  return createPortal(modal, document.body);
}

