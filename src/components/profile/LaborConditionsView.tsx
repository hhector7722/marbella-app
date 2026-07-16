'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getEmployeeLaborConditions,
  updateLaborConditions,
  type LaborTermDto,
} from '@/app/actions/labor-conditions';
import {
  bagLabel,
  regimeLabel,
  type LaborConditionsFormInput,
} from '@/lib/hours-engine/labor-conditions';
import type { ContractRegime } from '@/lib/hours-engine';
import { formatYmdInMadrid } from '@/lib/madrid-date-bounds';

function formatYmdEs(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return ymd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function todayMadridYmd(): string {
  return formatYmdInMadrid(new Date()) || '';
}

function displayHours(n: number): string {
  return n === 0 ? ' ' : `${n} horas`;
}

function displayRate(n: number | null): string {
  if (n == null || n === 0) return ' ';
  return `${n} €/h`;
}

function openTerm(terms: LaborTermDto[]): LaborTermDto | null {
  return terms.find((t) => t.effectiveTo === null) ?? null;
}

type Props = {
  employeeId: string;
};

export default function LaborConditionsView({ employeeId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [employeeName, setEmployeeName] = useState('');
  const [terms, setTerms] = useState<LaborTermDto[]>([]);
  const [form, setForm] = useState<LaborConditionsFormInput>({
    weeklyHours: 40,
    regime: 'staff',
    bagMode: false,
    overtimeRatePerHour: null,
    effectiveFrom: todayMadridYmd(),
  });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getEmployeeLaborConditions(employeeId);
    if (!res.success) {
      toast.error(res.error ?? 'No se pudieron cargar las condiciones');
      setLoading(false);
      return;
    }
    setEmployeeName(res.employeeName ?? '');
    const list = res.terms ?? [];
    setTerms(list);
    const open = openTerm(list);
    if (open) {
      setForm({
        weeklyHours: open.weeklyHours,
        regime: open.regime as ContractRegime,
        bagMode: open.bagMode,
        overtimeRatePerHour: open.overtimeRatePerHour,
        effectiveFrom: todayMadridYmd(),
      });
    }
    setLoading(false);
  }, [employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const vigente = openTerm(terms);

  const startEdit = () => {
    if (vigente) {
      setForm({
        weeklyHours: vigente.weeklyHours,
        regime: vigente.regime as ContractRegime,
        bagMode: vigente.bagMode,
        overtimeRatePerHour: vigente.overtimeRatePerHour,
        effectiveFrom: todayMadridYmd(),
      });
    } else {
      setForm((f) => ({ ...f, effectiveFrom: todayMadridYmd() }));
    }
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: LaborConditionsFormInput = {
        ...form,
        weeklyHours:
          form.regime === 'manager' || form.regime === 'fixed' ? 0 : form.weeklyHours,
      };
      const res = await updateLaborConditions(employeeId, payload);
      if (!res.success) {
        toast.error(res.error ?? 'No se pudo guardar');
        return;
      }
      if (res.kind === 'noop') {
        toast.message(res.message ?? 'No hay cambios respecto al contrato vigente');
        setEditing(false);
        return;
      }
      toast.success('Condiciones laborales actualizadas');
      setEditing(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen" />;
  }

  const backToProfile = () =>
    router.push(`/profile?id=${encodeURIComponent(employeeId)}`);

  const cardHeader = (title: string, opts?: { withBack?: boolean }) => (
    <div
      className={cn(
        'flex shrink-0 items-center gap-1 bg-[#36606F] px-2 py-2 text-white',
        !opts?.withBack && 'px-4 py-3',
      )}
    >
      {opts?.withBack ? (
        <button
          type="button"
          onClick={backToProfile}
          className={cn(
            'inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-xl',
            'text-white active:opacity-70',
          )}
          aria-label="Volver al perfil"
        >
          <ArrowLeft className="size-5 shrink-0" strokeWidth={2.25} />
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-semibold text-white">{title}</h1>
        {employeeName ? (
          <p className="truncate text-xs text-white/80">{employeeName}</p>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen pb-24 p-4">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        {!editing ? (
          <>
            <section className="overflow-hidden rounded-xl border border-zinc-100 bg-white shadow-sm">
              {cardHeader('Condiciones laborales', { withBack: true })}
              <div className="p-4">
                {vigente ? (
                  <dl className="divide-y divide-zinc-100">
                    <div className="flex min-h-12 items-center justify-between gap-3 py-3">
                      <dt className="text-xs text-zinc-500">Horas semanales</dt>
                      <dd className="text-sm font-semibold text-zinc-900">
                        {displayHours(vigente.weeklyHours)}
                      </dd>
                    </div>
                    <div className="flex min-h-12 items-center justify-between gap-3 py-3">
                      <dt className="text-xs text-zinc-500">Régimen</dt>
                      <dd className="text-sm font-semibold text-zinc-900">
                        {regimeLabel(vigente.regime as ContractRegime)}
                      </dd>
                    </div>
                    <div className="flex min-h-12 items-center justify-between gap-3 py-3">
                      <dt className="text-xs text-zinc-500">Bolsa / Pago</dt>
                      <dd className="text-sm font-semibold text-zinc-900">
                        {bagLabel(vigente.bagMode)}
                      </dd>
                    </div>
                    <div className="flex min-h-12 items-center justify-between gap-3 py-3">
                      <dt className="text-xs text-zinc-500">Tarifa extras</dt>
                      <dd className="text-sm font-semibold text-zinc-900">
                        {displayRate(vigente.overtimeRatePerHour)}
                      </dd>
                    </div>
                    <div className="flex min-h-12 items-center justify-between gap-3 py-3">
                      <dt className="text-xs text-zinc-500">Vigente desde</dt>
                      <dd className="text-sm font-semibold text-zinc-900">
                        {formatYmdEs(vigente.effectiveFrom)}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="text-sm text-zinc-500">
                    Sin condiciones vigentes. Puedes definirlas ahora.
                  </p>
                )}
                <button
                  type="button"
                  onClick={startEdit}
                  className={cn(
                    'mt-4 flex w-full min-h-12 shrink-0 items-center justify-center rounded-xl',
                    'bg-[#36606F] px-4 text-[10px] font-black uppercase tracking-widest text-white',
                    'active:scale-[0.98]',
                  )}
                >
                  Cambiar condiciones laborales
                </button>
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-zinc-100 bg-white shadow-sm">
              <div className="bg-[#36606F] px-4 py-3">
                <h2 className="text-sm font-semibold text-white">Histórico contractual</h2>
              </div>
              <div className="p-4">
                {terms.length === 0 ? (
                  <p className="text-sm text-zinc-500">Sin histórico.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[32rem] text-left text-xs">
                      <thead>
                        <tr className="border-b border-zinc-100 text-zinc-500">
                          <th className="py-2 pr-2 font-medium">Desde</th>
                          <th className="py-2 pr-2 font-medium">Hasta</th>
                          <th className="py-2 pr-2 font-medium">Horas</th>
                          <th className="py-2 pr-2 font-medium">Régimen</th>
                          <th className="py-2 pr-2 font-medium">Bolsa/Pago</th>
                          <th className="py-2 font-medium">€/h</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {[...terms]
                          .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
                          .map((t) => {
                            const isOpen = t.effectiveTo === null;
                            return (
                              <tr
                                key={`${t.effectiveFrom}-${t.effectiveTo ?? 'open'}`}
                                className={cn(isOpen && 'bg-emerald-50/60')}
                              >
                                <td className="min-h-12 py-3 pr-2 font-medium text-zinc-900">
                                  {formatYmdEs(t.effectiveFrom)}
                                  {isOpen ? (
                                    <span className="ml-2 text-[10px] font-black uppercase tracking-widest text-emerald-700">
                                      Vigente
                                    </span>
                                  ) : null}
                                </td>
                                <td className="py-3 pr-2 text-zinc-700">
                                  {t.effectiveTo ? formatYmdEs(t.effectiveTo) : '—'}
                                </td>
                                <td className="py-3 pr-2 text-zinc-700">
                                  {t.weeklyHours === 0 ? ' ' : t.weeklyHours}
                                </td>
                                <td className="py-3 pr-2 text-zinc-700">
                                  {regimeLabel(t.regime as ContractRegime)}
                                </td>
                                <td className="py-3 pr-2 text-zinc-700">
                                  {bagLabel(t.bagMode)}
                                </td>
                                <td className="py-3 text-zinc-700">
                                  {t.overtimeRatePerHour == null || t.overtimeRatePerHour === 0
                                    ? ' '
                                    : t.overtimeRatePerHour}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </>
        ) : (
          <section className="overflow-hidden rounded-xl border border-zinc-100 bg-white shadow-sm">
            {cardHeader('Cambiar condiciones laborales', { withBack: true })}
            <div className="p-4">
            <p className="text-xs text-zinc-500">
              Indica desde cuándo aplican. El histórico se reconstruye solo.
            </p>

            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  Fecha efectiva
                </span>
                <input
                  type="date"
                  value={form.effectiveFrom ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      effectiveFrom: e.target.value,
                    }))
                  }
                  className={cn(
                    'mt-1 w-full min-h-12 rounded-xl border border-zinc-200 bg-white px-3',
                    'text-sm font-bold text-zinc-800',
                    'focus:outline-none focus:ring-2 focus:ring-[#36606F]/30',
                  )}
                />
              </label>

              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  Horas semanales
                </span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  disabled={form.regime === 'manager' || form.regime === 'fixed'}
                  value={
                    form.regime === 'manager' || form.regime === 'fixed'
                      ? 0
                      : form.weeklyHours
                  }
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      weeklyHours: Number(e.target.value),
                    }))
                  }
                  className={cn(
                    'mt-1 w-full min-h-12 rounded-xl border border-zinc-200 bg-white px-3',
                    'text-sm font-bold text-zinc-800',
                    'focus:outline-none focus:ring-2 focus:ring-[#36606F]/30',
                    (form.regime === 'manager' || form.regime === 'fixed') &&
                      'bg-zinc-50 text-zinc-400',
                  )}
                />
              </label>

              <fieldset>
                <legend className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  Régimen
                </legend>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(
                    [
                      ['staff', 'Staff'],
                      ['manager', 'Manager'],
                      ['fixed', 'Salario fijo'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          regime: value,
                          weeklyHours:
                            value === 'manager' || value === 'fixed' ? 0 : f.weeklyHours,
                        }))
                      }
                      className={cn(
                        'min-h-12 rounded-xl border px-2 text-[10px] font-black uppercase tracking-widest',
                        'active:scale-[0.98]',
                        form.regime === value
                          ? 'border-[#36606F] bg-[#36606F] text-white'
                          : 'border-zinc-200 bg-white text-zinc-700',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  Bolsa / Pago
                </legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, bagMode: true }))}
                    className={cn(
                      'min-h-12 rounded-xl border px-2 text-[10px] font-black uppercase tracking-widest',
                      'active:scale-[0.98]',
                      form.bagMode
                        ? 'border-[#36606F] bg-[#36606F] text-white'
                        : 'border-zinc-200 bg-white text-zinc-700',
                    )}
                  >
                    Bolsa de horas
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, bagMode: false }))}
                    className={cn(
                      'min-h-12 rounded-xl border px-2 text-[10px] font-black uppercase tracking-widest',
                      'active:scale-[0.98]',
                      !form.bagMode
                        ? 'border-[#36606F] bg-[#36606F] text-white'
                        : 'border-zinc-200 bg-white text-zinc-700',
                    )}
                  >
                    Pago mensual
                  </button>
                </div>
              </fieldset>

              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  Tarifa horas extra (€/h)
                </span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.overtimeRatePerHour ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setForm((f) => ({
                      ...f,
                      overtimeRatePerHour: raw === '' ? null : Number(raw),
                    }));
                  }}
                  className={cn(
                    'mt-1 w-full min-h-12 rounded-xl border border-zinc-200 bg-white px-3',
                    'text-sm font-bold text-zinc-800',
                    'focus:outline-none focus:ring-2 focus:ring-[#36606F]/30',
                  )}
                />
              </label>
            </div>

            <div className="mt-6 flex shrink-0 gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditing(false)}
                className={cn(
                  'flex min-h-12 flex-1 items-center justify-center rounded-xl border border-zinc-200',
                  'text-[10px] font-black uppercase tracking-widest text-zinc-700',
                  'active:scale-[0.98]',
                )}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className={cn(
                  'flex min-h-12 flex-1 items-center justify-center rounded-xl',
                  'bg-emerald-600 text-[10px] font-black uppercase tracking-widest text-white',
                  'active:scale-[0.98]',
                  saving && 'opacity-60',
                )}
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
