'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/utils/supabase/client';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { QuickCashTools } from '@/components/ui/QuickCalculatorModal';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';
import { namedEntitySummary } from '@/lib/usage/modal-apply';

type PoolType = 'weekday' | 'weekend';

export type TipOverrideDraft = {
  isSanctioned: boolean;
  overrideAmount: number | null;
  notes: string;
  distributionId?: string;
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
  currentStartDate,
  currentEndDate,
  initialDistributionId,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  staffId: string;
  employeeName: string;
  poolType: PoolType;
  poolId: string | null;
  initial?: TipOverrideDraft;
  currentStartDate?: string;
  currentEndDate?: string;
  initialDistributionId?: string;
  onSave: (draft: TipOverrideDraft) => Promise<void> | void;
}) {
  const [isSanctioned, setIsSanctioned] = useState(false);
  const [overrideAmountText, setOverrideAmountText] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [distributionId, setDistributionId] = useState(initialDistributionId ?? '');
  const [periods, setPeriods] = useState<{ id: string; label: string; excluded: boolean }[]>([]);
  const [loadingPeriod, setLoadingPeriod] = useState(true);
  const [periodError, setPeriodError] = useState(false);
  const historic = Boolean(distributionId);
  const [profile, setProfile] = useState<{ first_name: string; avatar_url: string | null } | null>(null);

  const trackTipOverrideSave = useTrackModalApply('tip-override', 'Ajuste propina');

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const supabase = createClient();
    setLoadingPeriod(true);
    setPeriodError(false);
    const load = async () => {
      const { data: person } = await supabase.from('profiles').select('first_name, avatar_url').eq('id', staffId).single();
      if (!cancelled) setProfile(person || null);
      const { data: lines, error: historyError } = await supabase.from('tip_distribution_lines')
        .select('distribution_id, is_sanctioned, tip_distribution_history(period_start, period_end)')
        .eq('user_id', staffId);
      if (historyError) throw historyError;
      const options = (lines ?? []).flatMap(row => {
        const history = Array.isArray(row.tip_distribution_history) ? row.tip_distribution_history[0] : row.tip_distribution_history;
        return history ? [{ id: row.distribution_id, label: history.period_start + ' → ' + history.period_end, excluded: Boolean(row.is_sanctioned) }] : [];
      }).sort((a,b) => b.label.localeCompare(a.label));
      if (cancelled) return;
      setPeriods(options);
      if (distributionId) {
        const selected = options.find(p => p.id === distributionId);
        if (!selected) throw new Error('Reparto no disponible');
        setIsSanctioned(selected.excluded);
        setOverrideAmountText('');
        setNotes('');
      } else {
        let excluded = initial?.isSanctioned ?? false;
        if (currentStartDate && currentEndDate) {
          const { data, error } = await supabase.rpc('get_tip_pool_preview', {p_start_date:currentStartDate,p_end_date:currentEndDate});
          if (error) throw error;
          const current = data as unknown as { staff?: {id:string;isSanctioned:boolean}[] };
          excluded = current.staff?.find(s=>s.id===staffId)?.isSanctioned ?? false;
        }
        let amount = initial?.overrideAmount ?? null;
        let currentNotes = initial?.notes ?? '';
        if (poolId) {
          const { data, error } = await supabase.from('tip_pool_overrides').select('override_amount, notes').eq('pool_id',poolId).eq('user_id',staffId).maybeSingle();
          if (error) throw error;
          amount = data?.override_amount ?? null;
          currentNotes = data?.notes ?? '';
        }
        if (cancelled) return;
        setIsSanctioned(excluded);
        setOverrideAmountText(amount == null ? '' : String(amount));
        setNotes(currentNotes);
      }
    };
    void load().catch(e => { if (!cancelled) { console.error(e); setPeriodError(true); toast.error('No se pudo cargar el reparto'); } })
      .finally(() => { if (!cancelled) setLoadingPeriod(false); });
    return () => { cancelled = true; };
    // initial is a fallback only; refreshing parent must not discard unsaved edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, staffId, poolId, distributionId, currentStartDate, currentEndDate]);

  const profileFirstName = profile?.first_name;
  const displayName = useMemo(
    () => (profileFirstName ? profileFirstName.trim() : firstNameOnly(employeeName)),
    [profileFirstName, employeeName]
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

  const canSave = !amountInvalid && !loadingPeriod && !periodError;

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
        distributionId: distributionId || undefined,
      });
      trackTipOverrideSave(
        `${namedEntitySummary(displayName)} · ${isSanctioned ? 'Sin propina' : 'Con propina'}`,
        { staffId, poolType }
      );
      onClose();
    } catch (error) {
      console.error(error);
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
          <label className="text-xs font-bold text-zinc-600">
            Reparto
            <select className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold" value={distributionId} onChange={e => { setLoadingPeriod(true); setDistributionId(e.target.value); }} disabled={saving}>
              <option value="">Actual{currentStartDate ? ' · Desde ' + currentStartDate : ''}</option>
              {periods.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          {historic && <p className="text-xs text-zinc-500">Se recalculará solo este reparto. Los pagos ya realizados no se modifican.</p>}
          {loadingPeriod && <p className="text-xs text-zinc-500">Cargando reparto…</p>}
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
                    disabled={loadingPeriod || periodError || saving}
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
                    Excluye al empleado solo del reparto seleccionado y redistribuye su parte equitativamente.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {!historic && <div className="rounded-xl border border-zinc-100 bg-white p-2 shadow-sm md:rounded-2xl md:p-3">
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
          </div>}

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
      <QuickCashTools calculator breakdown />
    </>
  );
}
