'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  loadWeeklyExpectedHours,
  saveWeeklyExpectedHours,
} from '@/app/actions/weekly-expected-hours';
import { Button } from '@/components/ui/button';
import { buildAugustClosureEditorModel } from '@/lib/hours-engine/august-closure-editor-model';
import type { CivilDate } from '@/lib/hours-engine/types';
import { weekBounds } from '@/lib/hours-engine/week-dates';

type Persisted = 'unconfigured' | 'configured' | 'invalid';

function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : String(hours);
}

export function AugustClosureDistribution({
  userId,
  weekStart,
}: {
  userId: string;
  weekStart: CivilDate;
}) {
  const [draft, setDraft] = useState<(number | null)[]>(Array.from({ length: 7 }, () => null));
  const [persisted, setPersisted] = useState<Persisted>('unconfigured');
  const [invalidDetail, setInvalidDetail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [referenceHours, setReferenceHours] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadWeeklyExpectedHours(userId, weekStart).then((result) => {
      if (cancelled) return;
      if (!result.success) {
        setPersisted('invalid');
        setInvalidDetail(result.error);
        setDraft(Array.from({ length: 7 }, () => null));
        setReferenceHours(null);
        setLoading(false);
        return;
      }
      setReferenceHours(result.referenceHours);
      if (result.status === 'configured' && result.hours) {
        setPersisted('configured');
        setInvalidDetail(null);
        setDraft(result.hours);
      } else if (result.status === 'invalid') {
        setPersisted('invalid');
        setInvalidDetail(result.error);
        setDraft(Array.from({ length: 7 }, () => null));
      } else {
        setPersisted('unconfigured');
        setInvalidDetail(null);
        setDraft(Array.from({ length: 7 }, () => null));
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, weekStart]);

  const model = buildAugustClosureEditorModel({
    weekStart,
    weeklyContractHours: referenceHours ?? 0,
    persisted,
    invalidDetail,
    draft,
  });

  if (!model) return null;

  async function handleSave() {
    if (!model?.canSave) return;
    const { days } = weekBounds(weekStart);
    setSaving(true);
    const result = await saveWeeklyExpectedHours(
      userId,
      weekStart,
      days.map((day, index) => ({ day, expectedHours: draft[index] ?? 0 })),
    );
    setSaving(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setPersisted('configured');
    setInvalidDetail(null);
    toast.success('Distribución prevista guardada');
  }

  return (
    <section
      className="mt-2 w-full shrink-0 border-t border-gray-100 pt-2"
      aria-label="Cierre de agosto"
    >
      <p className="text-[7px] font-black uppercase tracking-widest text-zinc-500">
        Cierre de agosto
      </p>
      <p className="text-[10px] font-black text-zinc-800">Distribución prevista de la semana</p>
      {loading ? <p className="text-[10px] text-zinc-500">Cargando distribución…</p> : null}
      {model.pendingLabel ? (
        <p className="text-[10px] font-black text-zinc-900">{model.pendingLabel}</p>
      ) : null}
      {model.invalidLabel ? (
        <p className="text-[10px] font-black text-red-600">{model.invalidLabel}</p>
      ) : null}
      <p className="text-[10px] text-zinc-500">{model.weeklyContractLabel}</p>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {model.days.map((day, index) => (
          <label key={day.day} className="flex min-w-0 flex-col gap-0.5">
            <span className="text-center text-[8px] font-black text-zinc-500">
              {day.label} {day.dateNumber}
            </span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={24}
              step={0.5}
              value={draft[index] == null ? '' : String(draft[index])}
              aria-label={`Horas previstas ${day.label} ${day.dateNumber}`}
              onChange={(event) => {
                const raw = event.target.value;
                setDraft((current) => {
                  const next = [...current];
                  next[index] = raw.trim() === '' ? null : Number(raw);
                  return next;
                });
              }}
              className="h-12 w-full shrink-0 rounded border border-zinc-200 bg-white text-center text-[12px] font-black text-zinc-900 focus:outline-none focus:ring-1 focus:ring-[#36606F]"
            />
            {day.closureLabel ? (
              <span className="text-center text-[8px] font-black text-zinc-500">{day.closureLabel}</span>
            ) : (
              <span className="text-[8px] text-transparent" aria-hidden="true">
                .
              </span>
            )}
          </label>
        ))}
      </div>
      {model.preview ? (
        <div className="mt-1 flex flex-wrap gap-3 text-[10px] font-black text-zinc-800">
          <span>
            {model.preview.expectedLabel} {formatHours(model.preview.expectedTotal)} h
          </span>
          <span>
            {model.preview.referenceLabel} {formatHours(model.preview.referenceHours)} h
          </span>
          <span>
            {model.preview.exemptLabel} {formatHours(model.preview.closureExemptHours)} h
          </span>
          <span>
            {model.preview.requiredLabel} {formatHours(model.preview.requiredHours)} h
          </span>
        </div>
      ) : null}
      {model.error ? <p className="text-[10px] font-black text-red-600">{model.error}</p> : null}
      <Button
        type="button"
        variant="primary"
        instance="staff-week-save-expected-hours"
        onClick={() => void handleSave()}
        disabled={!model.canSave || saving || loading}
        loading={saving}
        loadingLabel="…"
        className="mt-2"
      >
        Guardar distribución
      </Button>
    </section>
  );
}
