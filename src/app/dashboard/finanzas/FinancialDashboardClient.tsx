'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRightLeft, TrendingDown, TrendingUp, Landmark, Receipt, Wallet } from 'lucide-react';
import { cn, formatDisplayValue } from '@/lib/utils';
import { parseTPVDate, getStartOfLocalToday } from '@/utils/date-utils';

type MoneyLine = { key: string; label: string; amount: number };

type FinancialStatement = {
  meta: {
    startDate: string;
    endDate: string;
    generatedAt: string;
    timezone: string;
  };
  pyg: {
    income: { total: number; lines: MoneyLine[] };
    expenses: { total: number; lines: MoneyLine[] };
    net: number;
  };
  cashFlow: {
    inflows: { total: number; lines: MoneyLine[] };
    outflows: { total: number; lines: MoneyLine[] };
    other: { adjustment: number; swap: number };
    net: number;
  };
  reconciliation: {
    accrualNet: number;
    cashNet: number;
    delta: number;
  };
};

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function clampYmdOrFallback(s: string, fallback: string): string {
  if (!isYmd(s)) return fallback;
  const d = parseTPVDate(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return fallback;
  return s;
}

function formatEurRead(n: number): string {
  const val = Number(n) || 0;
  if (val === 0 || Object.is(val, -0)) return ' ';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(val);
}

function SignTrendIcon({ value }: { value: number }) {
  if (!value || value === 0) return <span className="w-5 h-5 shrink-0" aria-hidden />;
  const up = value > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <Icon
      className={cn('w-5 h-5 shrink-0', up ? 'text-emerald-600' : 'text-rose-500')}
      strokeWidth={3}
      aria-hidden
    />
  );
}

function MiniBars({
  a,
  b,
  aLabel,
  bLabel,
  aTone,
  bTone,
}: {
  a: number;
  b: number;
  aLabel: string;
  bLabel: string;
  aTone: 'emerald' | 'rose' | 'zinc';
  bTone: 'emerald' | 'rose' | 'zinc';
}) {
  const absA = Math.abs(Number(a) || 0);
  const absB = Math.abs(Number(b) || 0);
  const max = Math.max(absA, absB, 1);
  const wA = Math.round((absA / max) * 100);
  const wB = Math.round((absB / max) * 100);

  const toneToBg = (t: 'emerald' | 'rose' | 'zinc') =>
    t === 'emerald' ? 'bg-emerald-500' : t === 'rose' ? 'bg-rose-500' : 'bg-zinc-400';

  return (
    <div className="mt-3 grid grid-cols-1 gap-2">
      <div className="flex items-center gap-3">
        <div className="w-20 shrink-0 text-[9px] font-black uppercase tracking-widest text-zinc-400 truncate">
          {aLabel}
        </div>
        <div className="flex-1 h-2 rounded-full bg-zinc-100 overflow-hidden">
          <div className={cn('h-full rounded-full', toneToBg(aTone))} style={{ width: `${wA}%` }} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="w-20 shrink-0 text-[9px] font-black uppercase tracking-widest text-zinc-400 truncate">
          {bLabel}
        </div>
        <div className="flex-1 h-2 rounded-full bg-zinc-100 overflow-hidden">
          <div className={cn('h-full rounded-full', toneToBg(bTone))} style={{ width: `${wB}%` }} />
        </div>
      </div>
    </div>
  );
}

function DetailCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200/60 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-100/50 flex items-center justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <div className="text-[11px] md:text-[12px] font-black uppercase tracking-widest text-zinc-900 truncate">
            {title}
          </div>
          <div className="text-[9px] md:text-[10px] font-bold text-zinc-400 truncate">{subtitle}</div>
        </div>
      </div>
      <div className="p-4 md:p-6">{children}</div>
    </div>
  );
}

function LineItem({
  label,
  amount,
  tone = 'neutral',
}: {
  label: string;
  amount: number;
  tone?: 'neutral' | 'positive' | 'negative' | 'muted';
}) {
  const cls =
    tone === 'positive'
      ? 'text-emerald-600'
      : tone === 'negative'
        ? 'text-rose-500'
        : tone === 'muted'
          ? 'text-zinc-400'
          : 'text-zinc-800';

  return (
    <div className="flex items-center justify-between gap-3 min-h-12">
      <div className="text-[9px] md:text-[10px] font-bold text-zinc-400 truncate">
        {label}
      </div>
      <div className={cn('text-[13px] md:text-[14px] font-black tabular-nums', cls)}>
        {formatEurRead(amount)}
      </div>
    </div>
  );
}

function KpiTile({
  label,
  value,
  icon,
  valueClassName,
  footer,
  micro,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  valueClassName?: string;
  footer?: React.ReactNode;
  micro?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200/60 shadow-sm px-5 py-4 shrink-0 min-w-0 overflow-hidden">
      <div className="text-[9px] md:text-[10px] font-bold text-zinc-400">{label}</div>
      <div className="mt-1 flex items-center gap-2 min-w-0">
        <div className="shrink-0">{icon}</div>
        <div
          className={cn(
            'text-[20px] md:text-[24px] font-black tabular-nums tracking-tight truncate',
            valueClassName ?? 'text-zinc-900',
          )}
        >
          {formatEurRead(value)}
        </div>
      </div>
      {micro ? <div className="mt-2">{micro}</div> : null}
      {footer ? <div className="mt-1">{footer}</div> : null}
    </div>
  );
}

export default function FinancialDashboardClient({
  initialStartDate,
  initialEndDate,
  statement,
}: {
  initialStartDate: string;
  initialEndDate: string;
  statement: FinancialStatement;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const todayYmd = useMemo(() => {
    const t = getStartOfLocalToday();
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, '0');
    const d = String(t.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  const [startDate, setStartDate] = useState<string>(
    clampYmdOrFallback(initialStartDate, todayYmd),
  );
  const [endDate, setEndDate] = useState<string>(
    clampYmdOrFallback(initialEndDate, todayYmd),
  );

  const reconciliation = statement.reconciliation;
  const deltaTone =
    reconciliation.delta > 0 ? 'positive' : reconciliation.delta < 0 ? 'negative' : 'muted';

  const rentabilidadPct = useMemo(() => {
    const ventasNetas = Number(statement.pyg.income.total) || 0;
    const neto = Number(statement.pyg.net) || 0;
    if (ventasNetas <= 0) return null;
    return (neto / ventasNetas) * 100;
  }, [statement.pyg.income.total, statement.pyg.net]);

  const rentabilidadText = useMemo(() => {
    if (rentabilidadPct === null) return ' ';
    if (rentabilidadPct === 0 || Object.is(rentabilidadPct, -0)) return ' ';
    return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 0 }).format(rentabilidadPct)}%`;
  }, [rentabilidadPct]);

  const applyRange = () => {
    const s = clampYmdOrFallback(startDate, initialStartDate);
    const e = clampYmdOrFallback(endDate, initialEndDate);

    startTransition(() => {
      router.push(`/dashboard/finanzas?start=${encodeURIComponent(s)}&end=${encodeURIComponent(e)}`);
      router.refresh();
    });
  };

  const clearToLast30 = () => {
    const t = getStartOfLocalToday();
    const end = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    const sDate = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    sDate.setDate(sDate.getDate() - 30);
    const start = `${sDate.getFullYear()}-${String(sDate.getMonth() + 1).padStart(2, '0')}-${String(sDate.getDate()).padStart(2, '0')}`;
    setStartDate(start);
    setEndDate(end);
    startTransition(() => {
      router.push(`/dashboard/finanzas?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
      router.refresh();
    });
  };

  return (
    <div className="min-h-screen bg-[#5B8FB9] p-4 md:p-6 pb-24 text-zinc-900">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* CABECERA PETRÓLEO (Página Detalle) */}
          <div className="bg-[#36606F] px-4 md:px-6 py-4 flex items-start justify-between gap-4 shrink-0">
            <div className="flex items-start gap-3 min-w-0">
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className={cn(
                  'min-h-12 min-w-12 shrink-0',
                  'rounded-xl border border-white/15 bg-white/10 hover:bg-white/15',
                  'inline-flex items-center justify-center',
                  'active:scale-[0.99] transition-transform',
                )}
                aria-label="Volver"
              >
                <ArrowLeft className="w-5 h-5 text-white" strokeWidth={2.75} aria-hidden />
              </button>

              <div className="min-w-0 pt-0.5">
                <div className="text-[11px] md:text-[12px] font-black uppercase tracking-widest text-white truncate">
                  Finanzas
                </div>
                <div className="text-[9px] md:text-[10px] font-bold text-white/80">
                  Cuenta de Pérdidas y Ganancias (Devengo) vs Estado de Flujos de Efectivo (Caja)
                </div>
              </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-2 shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 shrink-0 flex-wrap">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={cn(
                    'min-h-12 px-3 rounded-xl border border-white/15 bg-white/10 text-white shrink-0',
                    'text-[12px] font-black tabular-nums',
                    'focus:outline-none focus:ring-2 focus:ring-white/25',
                  )}
                  aria-label="Fecha inicio"
                />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={cn(
                    'min-h-12 px-3 rounded-xl border border-white/15 bg-white/10 text-white shrink-0',
                    'text-[12px] font-black tabular-nums',
                    'focus:outline-none focus:ring-2 focus:ring-white/25',
                  )}
                  aria-label="Fecha fin"
                />
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={applyRange}
                  className={cn(
                    'min-h-12 px-4 rounded-xl shrink-0',
                    'bg-white text-[#36606F] hover:bg-white/90',
                    'text-[11px] font-black uppercase tracking-widest',
                    'active:scale-[0.99] transition-transform',
                    isPending ? 'opacity-70 pointer-events-none' : '',
                  )}
                >
                  {isPending ? 'Cargando…' : 'Aplicar'}
                </button>

                <button
                  type="button"
                  onClick={clearToLast30}
                  className={cn(
                    'min-h-12 px-3 rounded-xl shrink-0',
                    'border border-white/15 bg-white/10 text-white hover:bg-white/15',
                    'text-[11px] font-black uppercase tracking-widest',
                    'active:scale-[0.99] transition-transform',
                    isPending ? 'opacity-70 pointer-events-none' : '',
                  )}
                >
                  Últimos 30
                </button>
              </div>
            </div>
          </div>

          <div className="px-4 md:px-6 py-3 border-b border-zinc-100/50">
            <div className="text-[9px] md:text-[10px] font-bold text-zinc-400">
              Periodo:{' '}
              <span className="font-black">{formatDisplayValue(statement.meta.startDate) as string}</span> →{' '}
              <span className="font-black">{formatDisplayValue(statement.meta.endDate) as string}</span>
              {statement.meta.timezone ? ` · ${statement.meta.timezone}` : ''}
            </div>
          </div>

          {/* CONTENIDO BLANCO (tarjeta) */}
          <div className="p-4 md:p-6 space-y-4 md:space-y-6">
            {/* KPIs CLAVE (bloque unificado) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
              <KpiTile
                label="PyG neto (devengo)"
                value={statement.pyg.net}
                icon={<SignTrendIcon value={statement.pyg.net} />}
                valueClassName={
                  statement.pyg.net > 0
                    ? 'text-emerald-600'
                    : statement.pyg.net < 0
                      ? 'text-rose-500'
                      : 'text-zinc-400'
                }
                footer={
                  <div className="text-[9px] md:text-[10px] font-bold text-zinc-400">
                    Rentabilidad: <span className="font-black text-zinc-900">{rentabilidadText}</span>
                  </div>
                }
                micro={
                  <MiniBars
                    a={statement.pyg.income.total}
                    b={statement.pyg.expenses.total}
                    aLabel="Ventas"
                    bLabel="Gastos"
                    aTone="emerald"
                    bTone="rose"
                  />
                }
              />
              <KpiTile
                label="Caja neta (operativa)"
                value={statement.cashFlow.net}
                icon={<SignTrendIcon value={statement.cashFlow.net} />}
                valueClassName={
                  statement.cashFlow.net > 0
                    ? 'text-emerald-600'
                    : statement.cashFlow.net < 0
                      ? 'text-rose-500'
                      : 'text-zinc-400'
                }
                micro={
                  <MiniBars
                    a={statement.cashFlow.inflows.total}
                    b={statement.cashFlow.outflows.total}
                    aLabel="Entradas"
                    bLabel="Salidas"
                    aTone="emerald"
                    bTone="rose"
                  />
                }
              />
              <KpiTile
                label="Delta (devengo − caja)"
                value={reconciliation.delta}
                icon={<ArrowRightLeft className="w-5 h-5 text-zinc-700" strokeWidth={3} aria-hidden />}
                valueClassName={
                  deltaTone === 'positive'
                    ? 'text-emerald-600'
                    : deltaTone === 'negative'
                      ? 'text-rose-500'
                      : 'text-zinc-400'
                }
                micro={
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Landmark className="w-4 h-4 text-zinc-400 shrink-0" strokeWidth={2.5} aria-hidden />
                      <div className="text-[9px] md:text-[10px] font-bold text-zinc-400 truncate">
                        Si el delta es alto: desfase devengo/caja
                      </div>
                    </div>
                  </div>
                }
              />
            </div>

            {/* BENTO: PyG vs Cash Flow */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <DetailCard title="PyG (Devengo)" subtitle="Ingresos devengados vs gastos devengados">
                <div className="grid grid-cols-1 gap-4">
                  <div className="bg-white rounded-2xl border border-zinc-200/60 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-zinc-100/50 flex items-center justify-between gap-3 shrink-0">
                      <div className="text-[11px] md:text-[12px] font-black uppercase tracking-widest text-zinc-900">
                        Ingresos (neto)
                      </div>
                      <div className="flex items-baseline gap-3 shrink-0">
                        <div className="text-[20px] md:text-[24px] font-black tabular-nums tracking-tight text-emerald-600">
                          {formatEurRead(statement.pyg.income.total)}
                        </div>
                        <div className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-zinc-400">
                          Rentab. <span className="text-zinc-900">{rentabilidadText}</span>
                        </div>
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <Receipt className="w-4 h-4 text-zinc-400 shrink-0" strokeWidth={2.5} aria-hidden />
                        <div className="text-[9px] md:text-[10px] font-bold text-zinc-400">
                          Ventas netas (tickets; devoluciones restan)
                        </div>
                      </div>
                      <div className="space-y-2">
                        {statement.pyg.income.lines.map((l) => (
                          <LineItem
                            key={l.key}
                            label={l.label}
                            amount={l.amount}
                            tone={l.amount < 0 ? 'negative' : 'neutral'}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-zinc-200/60 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-zinc-100/50 flex items-center justify-between gap-3 shrink-0">
                      <div className="text-[11px] md:text-[12px] font-black uppercase tracking-widest text-zinc-900">
                        Gastos
                      </div>
                      <div className="text-[20px] md:text-[24px] font-black tabular-nums tracking-tight text-rose-500">
                        {formatEurRead(statement.pyg.expenses.total)}
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <Wallet className="w-4 h-4 text-zinc-400 shrink-0" strokeWidth={2.5} aria-hidden />
                        <div className="text-[9px] md:text-[10px] font-bold text-zinc-400">
                          Nóminas + alquiler + compras verificadas
                        </div>
                      </div>
                      <div className="space-y-2">
                        {statement.pyg.expenses.lines.map((l) => (
                          <LineItem key={l.key} label={l.label} amount={l.amount} tone="negative" />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-zinc-200/60 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-zinc-100/50 flex items-center justify-between gap-3 shrink-0">
                      <div className="text-[11px] md:text-[12px] font-black uppercase tracking-widest text-zinc-900">
                        Resultado (PyG)
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <SignTrendIcon value={statement.pyg.net} />
                        <div
                          className={cn(
                            'text-[20px] md:text-[24px] font-black tabular-nums tracking-tight',
                            statement.pyg.net > 0
                              ? 'text-emerald-600'
                              : statement.pyg.net < 0
                                ? 'text-rose-500'
                                : 'text-zinc-400',
                          )}
                        >
                          {formatEurRead(statement.pyg.net)}
                        </div>
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="text-[9px] md:text-[10px] font-bold text-zinc-400">
                        {statement.pyg.net > 0
                          ? 'Rentabilidad positiva en devengo.'
                          : statement.pyg.net < 0
                            ? 'Rentabilidad negativa en devengo.'
                            : 'Sin variación en devengo.'}
                      </div>
                    </div>
                  </div>
                </div>
              </DetailCard>

              <DetailCard title="Cash Flow (Caja)" subtitle="Entradas de caja vs salidas de caja (operativo)">
                <div className="grid grid-cols-1 gap-4">
                  <div className="bg-white rounded-2xl border border-zinc-200/60 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-zinc-100/50 flex items-center justify-between gap-3 shrink-0">
                      <div className="text-[11px] md:text-[12px] font-black uppercase tracking-widest text-zinc-900">
                        Entradas (orgánicas)
                      </div>
                      <div className="text-[20px] md:text-[24px] font-black tabular-nums tracking-tight text-emerald-600">
                        {formatEurRead(statement.cashFlow.inflows.total)}
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="space-y-2">
                        {statement.cashFlow.inflows.lines.map((l) => (
                          <LineItem key={l.key} label={l.label} amount={l.amount} tone="positive" />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-zinc-200/60 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-zinc-100/50 flex items-center justify-between gap-3 shrink-0">
                      <div className="text-[11px] md:text-[12px] font-black uppercase tracking-widest text-zinc-900">
                        Salidas (orgánicas)
                      </div>
                      <div className="text-[20px] md:text-[24px] font-black tabular-nums tracking-tight text-rose-500">
                        {formatEurRead(statement.cashFlow.outflows.total)}
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="space-y-2">
                        {statement.cashFlow.outflows.lines.map((l) => (
                          <LineItem key={l.key} label={l.label} amount={l.amount} tone="negative" />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-zinc-200/60 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-zinc-100/50 flex items-center justify-between gap-3 shrink-0">
                      <div className="text-[11px] md:text-[12px] font-black uppercase tracking-widest text-zinc-900">
                        Other (no orgánico)
                      </div>
                      <div className="text-[9px] md:text-[10px] font-bold text-zinc-400">
                        SWAP y ADJUSTMENT fuera del neto orgánico
                      </div>
                    </div>
                    <div className="p-4 space-y-2">
                      <LineItem label="SWAP (cambios)" amount={statement.cashFlow.other.swap} tone="muted" />
                      <LineItem
                        label="ADJUSTMENT (descuadres)"
                        amount={statement.cashFlow.other.adjustment}
                        tone="muted"
                      />
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-zinc-200/60 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-zinc-100/50 flex items-center justify-between gap-3 shrink-0">
                      <div className="text-[11px] md:text-[12px] font-black uppercase tracking-widest text-zinc-900">
                        Neto (Caja)
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <SignTrendIcon value={statement.cashFlow.net} />
                        <div
                          className={cn(
                            'text-[20px] md:text-[24px] font-black tabular-nums tracking-tight',
                            statement.cashFlow.net > 0
                              ? 'text-emerald-600'
                              : statement.cashFlow.net < 0
                                ? 'text-rose-500'
                                : 'text-zinc-400',
                          )}
                        >
                          {formatEurRead(statement.cashFlow.net)}
                        </div>
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="text-[9px] md:text-[10px] font-bold text-zinc-400">
                        {statement.cashFlow.net > 0
                          ? 'Caja positiva en el periodo.'
                          : statement.cashFlow.net < 0
                            ? 'Caja negativa en el periodo.'
                            : 'Sin variación de caja.'}
                      </div>
                    </div>
                  </div>
                </div>
              </DetailCard>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

