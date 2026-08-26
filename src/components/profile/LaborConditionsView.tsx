'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  deleteLaborTerm,
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

type EditMode = 'change' | 'rewrite';

type Props = {
  employeeId: string;
  onSaveSuccess?: () => void;
  onClose?: () => void;
  hostedInPageScreen?: boolean;
};

export default function LaborConditionsView({ employeeId, onSaveSuccess, onClose, hostedInPageScreen = false }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editMode, setEditMode] = useState<EditMode>('change');
  /** Inicio original del tramo (para detectar movimiento de fecha). */
  const [editingTermOriginalFrom, setEditingTermOriginalFrom] = useState<string | null>(
    null,
  );
  /** Fin original del tramo (null = vigente). */
  const [editingTermOriginalTo, setEditingTermOriginalTo] = useState<string | null>(null);
  const [employeeName, setEmployeeName] = useState('');
  const [terms, setTerms] = useState<LaborTermDto[]>([]);
  const [form, setForm] = useState<LaborConditionsFormInput>({
    weeklyHours: 40,
    regime: 'staff',
    bagMode: false,
    overtimeRatePerHour: null,
    effectiveFrom: todayMadridYmd(),
    effectiveTo: null,
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

  const closeEditor = () => {
    setEditing(false);
    setEditMode('change');
    setEditingTermOriginalFrom(null);
    setEditingTermOriginalTo(null);
  };

  /** Edita el tramo vigente in-place (no crea tramos nuevos). */
  const startEditVigente = () => {
    if (!vigente) {
      startNewVigencia();
      return;
    }
    startRewriteTerm(vigente);
  };

  /** Nueva vigencia desde una fecha → puede partir el tramo (splice). */
  const startNewVigencia = () => {
    setEditMode('change');
    setEditingTermOriginalFrom(null);
    setEditingTermOriginalTo(null);
    if (vigente) {
      setForm({
        weeklyHours: vigente.weeklyHours,
        regime: vigente.regime as ContractRegime,
        bagMode: vigente.bagMode,
        overtimeRatePerHour: vigente.overtimeRatePerHour,
        effectiveFrom: todayMadridYmd(),
        effectiveTo: null,
      });
    } else {
      setForm((f) => ({
        ...f,
        effectiveFrom: todayMadridYmd(),
        effectiveTo: null,
      }));
    }
    setEditing(true);
  };

  /** Corrige un tramo ya registrado (condiciones + fechas; sin crear tramo nuevo). */
  const startRewriteTerm = (t: LaborTermDto) => {
    setEditMode('rewrite');
    setEditingTermOriginalFrom(t.effectiveFrom);
    setEditingTermOriginalTo(t.effectiveTo);
    setForm({
      weeklyHours: t.weeklyHours,
      regime: t.regime as ContractRegime,
      bagMode: t.bagMode,
      overtimeRatePerHour: t.overtimeRatePerHour,
      effectiveFrom: t.effectiveFrom,
      effectiveTo: t.effectiveTo,
    });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: LaborConditionsFormInput = {
        ...form,
        weeklyHours:
          form.regime === 'manager' || form.regime === 'fixed' ? 0 : form.weeklyHours,
        effectiveFrom: form.effectiveFrom || todayMadridYmd(),
        effectiveTo:
          editMode === 'rewrite'
            ? form.effectiveTo == null || String(form.effectiveTo).trim() === ''
              ? null
              : form.effectiveTo
            : undefined,
        originalEffectiveFrom:
          editMode === 'rewrite' ? editingTermOriginalFrom ?? undefined : undefined,
        originalEffectiveTo:
          editMode === 'rewrite' ? editingTermOriginalTo : undefined,
      };
      const res = await updateLaborConditions(employeeId, payload);
      if (!res.success) {
        toast.error(res.error ?? 'No se pudo guardar');
        return;
      }
      if (res.kind === 'noop') {
        toast.message(
          res.message ??
            (editMode === 'rewrite'
              ? 'No hay cambios en este tramo'
              : 'No hay cambios respecto a las condiciones de esa fecha'),
        );
        closeEditor();
        return;
      }
      toast.success(
        editMode === 'rewrite'
          ? res.kind === 'rescheduled'
            ? 'Fechas y condiciones actualizadas'
            : 'Tramo actualizado (sin crear tramo nuevo)'
          : 'Nueva vigencia contractual guardada',
      );
      closeEditor();
      await load();
      // Notify parent that save succeeded so UI can refresh
      if (onSaveSuccess) onSaveSuccess();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingTermOriginalFrom) return;
    if (terms.length <= 1) {
      toast.error('No se puede eliminar el único tramo. Edítalo o crea otro antes.');
      return;
    }
    const ok = window.confirm(
      `¿Eliminar el tramo que empieza el ${formatYmdEs(editingTermOriginalFrom)}?\n\nEl tramo anterior absorberá esas fechas. Se recalcularán horas y costes.`,
    );
    if (!ok) return;

    setDeleting(true);
    try {
      const res = await deleteLaborTerm(employeeId, editingTermOriginalFrom);
      if (!res.success) {
        toast.error(res.error ?? 'No se pudo eliminar el tramo');
        return;
      }
      toast.success('Tramo eliminado');
      closeEditor();
      await load();
      onSaveSuccess?.();
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="min-h-[200px] flex items-center justify-center text-xs font-medium text-zinc-400">Cargando condiciones laborales...</div>;
  }

  const backToProfile = () => {
    if (onClose) {
      onClose();
    } else {
      router.push(`/profile?id=${encodeURIComponent(employeeId)}`);
    }
  };

  const editorTitle =
    editMode === 'rewrite'
      ? 'Editar tramo contractual'
      : 'Nueva vigencia contractual';

  const cardHeader = (title: string, opts?: { withBack?: boolean }) => (
    <div
      className={cn(
        'flex shrink-0 items-center gap-1 px-2 py-2',
        !opts?.withBack && 'px-4 py-3',
      )}
      data-element="block-header"
    >
      {opts?.withBack ? (
        <button
          type="button"
          onClick={editing ? closeEditor : backToProfile}
          className={cn(
            'inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-xl',
            'text-white active:opacity-70',
          )}
          aria-label={editing ? 'Cancelar edición' : 'Volver al perfil'}
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
    <div className={hostedInPageScreen ? 'flex flex-col gap-4' : 'min-h-screen pb-24 p-4'}>
      <div className={hostedInPageScreen ? 'flex flex-col gap-4' : 'mx-auto flex max-w-2xl flex-col gap-4'}>
        {!editing ? (
          <>
            <section className={hostedInPageScreen ? '' : 'overflow-hidden rounded-xl border border-zinc-100 bg-white shadow-sm'}>
              {hostedInPageScreen ? null : cardHeader('Condiciones laborales', { withBack: true })}
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
                <div className="mt-4">
                <Button
                  type="button"
                  variant="primary"
                  instance="labor-conditions-definir"
                  onClick={startEditVigente}
                  layout="fill"
                >
                  {vigente ? 'Editar condiciones vigentes' : 'Definir condiciones'}
                </Button>
                </div>
                {vigente ? (
                  <div className="mt-2">
                    <Button
                      type="button"
                      variant="secondary"
                      instance="labor-conditions-new-vigencia"
                      onClick={startNewVigencia}
                      className="w-full shrink-0"
                    >
                      Nueva vigencia desde fecha
                    </Button>
                  </div>
                ) : null}
              </div>
            </section>

            <section className={hostedInPageScreen ? '' : 'overflow-hidden rounded-xl border border-zinc-100 bg-white shadow-sm'}>
              {hostedInPageScreen ? (
                <h2 className="px-1 pb-2 text-sm font-semibold text-zinc-900">Histórico contractual</h2>
              ) : (
                <div data-element="block-header">
                  <h2 data-element="title">Histórico contractual</h2>
                </div>
              )}
              <div className="p-4">
                {terms.length === 0 ? (
                  <p className="text-sm text-zinc-500">Sin histórico.</p>
                ) : (
                  <>
                    <p className="mb-3 text-xs text-zinc-500">
                      Pulsa un tramo para modificarlo (condiciones o fechas) sin crear
                      otro. Al borrar, dejará un hueco en la historia contractual. Vacío en fin =
                      vigente.
                    </p>
                    <div className="divide-y divide-zinc-100">
                      {[...terms]
                        .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
                        .map((t) => {
                          const isOpen = t.effectiveTo === null;
                          return (
                            <button
                              key={`${t.effectiveFrom}-${t.effectiveTo ?? 'open'}`}
                              type="button"
                              onClick={() => startRewriteTerm(t)}
                              className={cn(
                                'flex w-full min-h-12 flex-col gap-1 py-3 text-left active:opacity-70',
                                isOpen && 'bg-emerald-50/60 -mx-1 px-1 rounded-lg',
                              )}
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-zinc-900">
                                  {formatYmdEs(t.effectiveFrom)}
                                  {' → '}
                                  {t.effectiveTo ? formatYmdEs(t.effectiveTo) : 'Vigente'}
                                </span>
                                {isOpen ? (
                                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700">
                                    Vigente
                                  </span>
                                ) : null}
                              </div>
                              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-600">
                                <span>
                                  {t.weeklyHours === 0 ? ' ' : `${t.weeklyHours} h`}
                                </span>
                                <span>{regimeLabel(t.regime as ContractRegime)}</span>
                                <span>{bagLabel(t.bagMode)}</span>
                                <span>
                                  {t.overtimeRatePerHour == null ||
                                  t.overtimeRatePerHour === 0
                                    ? ' '
                                    : `${t.overtimeRatePerHour} €/h`}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                    </div>
                  </>
                )}
              </div>
            </section>
          </>
        ) : (
          <section className={hostedInPageScreen ? '' : 'overflow-hidden rounded-xl border border-zinc-100 bg-white shadow-sm'}>
            {hostedInPageScreen ? (
              <h2 className="px-1 pb-2 text-sm font-semibold text-zinc-900">{editorTitle}</h2>
            ) : (
              cardHeader(editorTitle, { withBack: true })
            )}
            <div className="p-4">
              <p className="text-xs text-zinc-500">
                {editMode === 'rewrite'
                  ? 'Modifica este tramo sin crear uno nuevo. Puedes cambiar inicio/fin; los vecinos se recalculan. Deja fin vacío para «Vigente» (solo el último).'
                  : 'Crea una nueva vigencia desde la fecha indicada (puede partir el tramo actual).'}
              </p>

              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    {editMode === 'rewrite' ? 'Fecha de inicio' : 'Fecha efectiva'}
                  </span>
                  <input
                    type="date"
                    value={form.effectiveFrom ?? ''}
                    max={
                      editMode === 'rewrite' && form.effectiveTo
                        ? form.effectiveTo
                        : undefined
                    }
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

                {editMode === 'rewrite' ? (
                  <div>
                    <label className="block">
                      <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                        Fecha de finalización
                      </span>
                      <input
                        type="date"
                        value={form.effectiveTo ?? ''}
                        min={form.effectiveFrom || undefined}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            effectiveTo: e.target.value === '' ? null : e.target.value,
                          }))
                        }
                        className={cn(
                          'mt-1 w-full min-h-12 rounded-xl border border-zinc-200 bg-white px-3',
                          'text-sm font-bold text-zinc-800',
                          'focus:outline-none focus:ring-2 focus:ring-[#36606F]/30',
                        )}
                      />
                    </label>
                    <div className="mt-2 flex min-h-12 shrink-0 items-center justify-between gap-2">
                      <p className="text-xs text-zinc-500">
                        {form.effectiveTo
                          ? `Hasta ${formatYmdEs(form.effectiveTo)}`
                          : 'Vigente (sin fecha de fin)'}
                      </p>
                      {form.effectiveTo ? (
                        <button
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, effectiveTo: null }))}
                          className={cn(
                            'shrink-0 min-h-12 rounded-xl border border-zinc-200 px-3',
                            'text-[10px] font-black uppercase tracking-widest text-zinc-700',
                            'active:scale-[0.98]',
                          )}
                        >
                          Vigente
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

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

              <div className="mt-6 flex shrink-0 flex-col gap-2">
                <div className="flex shrink-0 gap-2">
                  <div className="min-w-0 flex-1">
                    <Button
                      type="button"
                      variant="secondary"
                      layout="fill"
                      instance="labor-conditions-cancel"
                      disabled={saving || deleting}
                      onClick={closeEditor}
                    >
                      Cancelar
                    </Button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <Button
                      type="button"
                      variant="primary"
                      layout="fill"
                      instance="labor-conditions-save"
                      disabled={saving || deleting}
                      loading={saving}
                      loadingLabel="Guardando…"
                      onClick={() => void handleSave()}
                    >
                      Guardar
                    </Button>
                  </div>
                </div>

                {editMode === 'rewrite' && terms.length > 1 ? (
                  <Button
                    type="button"
                    variant="destructive"
                    layout="fill"
                    instance="labor-conditions-delete-term"
                    disabled={saving || deleting}
                    loading={deleting}
                    loadingLabel="Eliminando…"
                    onClick={() => void handleDelete()}
                  >
                    Eliminar este tramo
                  </Button>
                ) : null}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
