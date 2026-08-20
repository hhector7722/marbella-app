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
  overrideAmount: number | null;
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
  poolId,
  initial,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  staffId: string;
  employeeName: string;
  poolType: PoolType;
  poolId: string | null;
  initial?: TipOverrideDraft;
  onSave: (draft: TipOverrideDraft) => Promise<void> | void;
}) {
  const [isSanctioned, setIsSanctioned] = useState(false);
  const [overrideAmountText, setOverrideAmountText] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<{ first_name: string; avatar_url: string | null } | null>(null);
  const [calculatorOpen, setCalculatorOpen] = useState(false);

  const trackTipOverrideSave = useTrackModalApply('tip-override', 'Ajuste propina');

  useEffect(() => {
    if (!isOpen) return;
    setIsSanctioned(initial?.isSanctioned ?? false);
    setNotes(initial?.notes ?? '');
    setOverrideAmountText(
      initial?.overrideAmount != null && Number.isFinite(initial.overrideAmount)
        ? String(initial.overrideAmount)
        : ''
    );
    setProfile(null);

    const supabase = createClient();
    if (staffId) {
      supabase
        .from('profiles')
        .select('first_name, avatar_url')
        .eq('id', staffId)
        .single()
        .then(({ data }) => setProfile(data || null));
    }

    if (staffId && poolId) {
      supabase
        .from('tip_pool_overrides')
        .select('override_amount, notes, is_sanctioned')
        .eq('pool_id', poolId)
        .eq('user_id', staffId)
        .maybeSingle()
        .then(({ data }) => {
          if (!data) return;
          if (data.is_sanctioned != null) setIsSanctioned(Boolean(data.is_sanctioned));
          if (data.notes) setNotes(String(data.notes));
          if (data.override_amount != null) {
            setOverrideAmountText(String(data.override_amount));
          }
        });
    }
  }, [isOpen, staffId, poolId, initial]);

  const displayName = useMemo(
    () => (profile?.first_name ? profile.first_name.trim() : firstNameOnly(employeeName)),
    [profile?.first_name, employeeName]
  );

  const amountLabel = poolType === 'weekday' ? 'Importe Lun – Vie' : 'Importe Sáb – Dom';

  const parsedOverrideAmount = useMemo(() => {
    const trimmed = overrideAmountText.trim();
    if (trimmed === '') return null;
    const n = Number(trimmed.replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : null;
  }, [overrideAmountText]);

  const amountInvalid =
    overrideAmountText.trim() !== '' && parsedOverrideAmount === null;

  const canSave = !amountInvalid;

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
        overrideAmount: parsedOverrideAmount,
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
        title={displayName}
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
        <div className="flex min-w-0 max-w-full flex-col gap-3">
          <div className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm md:rounded-2xl">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar
                src={profile?.avatar_url ?? undefined}
                alt={displayName}
                size="sm"
                className="shrink-0"
              />
              <label className="group flex min-w-0 flex-1 cursor-pointer items-center gap-3">
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
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm font-black uppercase tracking-wide text-rose-600 md:text-base">
                    Sin propina
                  </span>
                  <span className="text-[9px] font-bold leading-tight text-zinc-400 md:text-[11px]">
                    Excluye a este empleado del reparto y su parte se distribuye equitativamente.
                  </span>
                </div>
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-100 bg-white p-2 shadow-sm md:rounded-2xl md:p-3">
            <label
              htmlFor="tip-override-amount"
              className="mb-1 block text-[7px] font-black uppercase tracking-widest text-zinc-400 md:mb-2 md:text-[9px]"
            >
              {amountLabel}
            </label>
            <div className="relative">
              <input
                id="tip-override-amount"
                type="text"
                inputMode="decimal"
                value={overrideAmountText}
                onChange={(e) => setOverrideAmountText(e.target.value)}
                className={cn(
                  'h-10 min-h-[44px] w-full rounded-xl border px-3 pr-8 text-sm font-black text-zinc-800 outline-none tabular-nums focus:ring-2 md:h-12 md:rounded-2xl md:px-4 md:pr-10',
                  amountInvalid
                    ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-200'
                    : 'border-zinc-200 focus:border-[#5B8FB9]/40 focus:ring-[#5B8FB9]/20'
                )}
                placeholder="Opcional…"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-black text-zinc-400 md:right-4">
                €
              </span>
            </div>
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
