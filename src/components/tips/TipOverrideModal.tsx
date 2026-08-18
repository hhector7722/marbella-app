'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { QuickCalculatorModal, FloatingCalculatorFab } from '@/components/ui/QuickCalculatorModal';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';
import { namedEntitySummary } from '@/lib/usage/modal-apply';

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

  const trackTipOverrideSave = useTrackModalApply('tip-override', 'Ajuste propina');

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

  const canSave = true;

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        isSanctioned,
        notes: (notes || '').trim(),
      });
      trackTipOverrideSave(
        `${namedEntitySummary(displayName)} · ${isSanctioned ? 'Sin propina' : 'Con propina'}`,
        { staffId, poolType }
      );
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal
        open={isOpen}
        onClose={handleClose}
        title={
          <span className="flex min-w-0 items-center gap-2 md:gap-3">
            <Avatar
              src={profile?.avatar_url ?? undefined}
              alt={displayName}
              size="sm"
              className="shrink-0 ring-2 ring-white/30"
            />
            <span className="truncate">{displayName}</span>
          </span>
        }
        variant="standard"
        layer="base"
        instance="tip-override"
        headerTone="petroleum"
        usageId="tip-override"
        usageLabel="Ajuste propina"
        footer={
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              instance="tip-override-cancel"
              onClick={handleClose}
              disabled={saving}
            >
              Salir
            </Button>
            <Button
              type="button"
              variant="primary"
              instance="tip-override-save"
              disabled={!canSave || saving}
              loading={saving}
              loadingLabel="Guardando…"
              onClick={() => void handleSave()}
            >
              Guardar
            </Button>
          </div>
        }
      >
        <div className="space-y-2 bg-gray-50 p-2.5 sm:p-3 md:space-y-3">
          <div className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm md:rounded-2xl">
            <label className="group flex cursor-pointer items-center gap-3">
              <div className="relative flex h-6 w-6 items-center justify-center rounded-lg border-2 border-zinc-300 bg-zinc-50 transition-all group-hover:border-rose-400 md:h-8 md:w-8">
                <input
                  type="checkbox"
                  checked={isSanctioned}
                  onChange={(e) => setIsSanctioned(e.target.checked)}
                  className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
                <div
                  className={cn(
                    'absolute inset-0 scale-0 rounded-md bg-rose-500 opacity-0 transition-all',
                    isSanctioned && 'scale-100 opacity-100'
                  )}
                />
                <X
                  strokeWidth={4}
                  className={cn(
                    'relative z-10 h-4 w-4 text-white transition-all scale-0 opacity-0 md:h-5 md:w-5',
                    isSanctioned && 'scale-100 opacity-100'
                  )}
                />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-black uppercase tracking-wide text-rose-600 md:text-base">
                  Sin propina
                </span>
                <span className="text-[9px] font-bold leading-tight text-zinc-400 md:text-[11px]">
                  Excluye a este empleado del reparto y su parte se distribuye equitativamente.
                </span>
              </div>
            </label>
          </div>

          <div className="rounded-xl border border-zinc-100 bg-white p-2 shadow-sm md:rounded-2xl md:p-3">
            <label className="mb-1 block text-[7px] font-black uppercase tracking-widest text-zinc-400 md:mb-2 md:text-[9px]">
              Notas
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-10 min-h-[44px] w-full rounded-xl border border-zinc-200 px-3 text-sm font-bold text-zinc-700 outline-none focus:border-[#5B8FB9]/40 focus:ring-2 focus:ring-[#5B8FB9]/20 md:h-12 md:rounded-2xl md:px-4"
              placeholder="Opcional…"
            />
          </div>
        </div>
      </Modal>

      {/* Residual compartido: no migrar en esta oleada (igual que Caja). */}
      <QuickCalculatorModal isOpen={calculatorOpen} onClose={() => setCalculatorOpen(false)} />
      <FloatingCalculatorFab isOpen={calculatorOpen} onToggle={() => setCalculatorOpen(true)} />
    </>
  );
}
