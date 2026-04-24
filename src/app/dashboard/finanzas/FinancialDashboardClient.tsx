'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { TrendingDown, TrendingUp, ArrowRightLeft } from 'lucide-react';
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

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm overflow-hidden">
      <div className="px-4 md:px-6 py-4 border-b border-zinc-50 flex items-center justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <div className="text-[11px] md:text-[12px] font-black uppercase tracking-widest text-zinc-900 truncate">
            {title}
          </div>
          <div className="text-[9px] md:text-[10px] font-bold text-zinc-400 truncate">
            {subtitle}
          </div>
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
      <div className="text-[10px] md:text-[11px] font-black uppercase tracking-widest text-zinc-500 truncate">
        {label}
      </div>
      <div className={cn('text-[12px] md:text-[14px] font-black tabular-nums', cls)}>
        {formatEurRead(amount)}
      </div>
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
  const deltaTone = reconciliation.delta > 0 ? 'positive' : reconciliation.delta < 0 ? 'negative' : 'muted';

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
    <div className="min-h-screen bg-white p-4 md:p-8 pb-24 text-zinc-900">
      <div className="max-w-6xl mx-auto space-y-4 md:space-y-6">
        <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm overflow-hidden">
          <div className="px-4 md:px-6 py-4 flex items-center justify-between gap-3 border-b border-zinc-50 shrink-0">
            <div className="min-w-0">
              <div className="text-[12px] md:text-[14px] font-black uppercase tracking-widest text-zinc-900 truncate">
                Finanzas
              </div>
              <div className="text-[9px] md:text-[10px] font-bold text-zinc-400 truncate">
                Cuenta de Pérdidas y Ganancias (Devengo) vs Estado de Flujos de Efectivo (Caja)
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="hidden md:flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className={cn(
                      'min-h-12 px-3 rounded-xl border border-zinc-200 bg-white text-zinc-900',
                      'text-[12px] font-black tabular-nums',
                      'focus:outline-none focus:ring-2 focus:ring-zinc-200',
                    )}
                    aria-label="Fecha inicio"
                  />
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className={cn(
                      'min-h-12 px-3 rounded-xl border border-zinc-200 bg-white text-zinc-900',
                      'text-[12px] font-black tabular-nums',
                      'focus:outline-none focus:ring-2 focus:ring-zinc-200',
                    )}
                    aria-label="Fecha fin"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={applyRange}
                className={cn(
                  'min-h-12 px-4 rounded-xl',
                  'bg-zinc-900 text-white',
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
                  'min-h-12 px-3 rounded-xl border border-zinc-200 bg-white text-zinc-700',
                  'text-[11px] font-black uppercase tracking-widest',
                  'hover:bg-zinc-50 active:scale-[0.99] transition-transform',
                  isPending ? 'opacity-70 pointer-events-none' : '',
                )}
              >
                Últimos 30
              </button>
            </div>
          </div>

          <div className="px-4 md:px-6 py-4">
            <div className="grid grid-cols-3 gap-2 md:gap-3">
              <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm p-4 shrink-0">
                <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
                  PyG neto (devengo)
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <SignTrendIcon value={statement.pyg.net} />
                  <div className="text-[16px] md:text-[20px] font-black tabular-nums text-zinc-900">
                    {formatEurRead(statement.pyg.net)}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm p-4 shrink-0">
                <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
                  Caja neta (operativa)
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <SignTrendIcon value={statement.cashFlow.net} />
                  <div className="text-[16px] md:text-[20px] font-black tabular-nums text-zinc-900">
                    {formatEurRead(statement.cashFlow.net)}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm p-4 shrink-0">
                <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
                  Delta (devengo − caja)
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <ArrowRightLeft className="w-5 h-5 shrink-0 text-zinc-400" strokeWidth={2.5} aria-hidden />
                  <div
                    className={cn(
                      'text-[16px] md:text-[20px] font-black tabular-nums',
                      deltaTone === 'positive'
                        ? 'text-emerald-600'
                        : deltaTone === 'negative'
                          ? 'text-rose-500'
                          : 'text-zinc-400',
                    )}
                  >
                    {formatEurRead(reconciliation.delta)}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-2 text-[9px] font-bold text-zinc-400">
              Periodo: <span className="font-black">{formatDisplayValue(statement.meta.startDate) as string}</span> →{' '}
              <span className="font-black">{formatDisplayValue(statement.meta.endDate) as string}</span>
              {statement.meta.timezone ? ` · ${statement.meta.timezone}` : ''}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <SectionCard
            title="PyG (Devengo)"
            subtitle="Ingresos devengados vs gastos devengados"
          >
            <div className="grid grid-cols-1 gap-4">
              <div className="rounded-2xl border border-zinc-100 p-4">
                <div className="flex items-center justify-between gap-3 min-h-12 shrink-0">
                  <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    Ingresos (neto)
                  </div>
                  <div className="text-[14px] font-black tabular-nums text-emerald-600">
                    {formatEurRead(statement.pyg.income.total)}
                  </div>
                </div>
                <div className="mt-2 space-y-1">
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

              <div className="rounded-2xl border border-zinc-100 p-4">
                <div className="flex items-center justify-between gap-3 min-h-12 shrink-0">
                  <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    Gastos
                  </div>
                  <div className="text-[14px] font-black tabular-nums text-rose-500">
                    {formatEurRead(statement.pyg.expenses.total)}
                  </div>
                </div>
                <div className="mt-2 space-y-1">
                  {statement.pyg.expenses.lines.map((l) => (
                    <LineItem key={l.key} label={l.label} amount={l.amount} tone="negative" />
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-100 p-4">
                <div className="flex items-center justify-between gap-3 min-h-12 shrink-0">
                  <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    Resultado (PyG)
                  </div>
                  <div className="flex items-center gap-2">
                    <SignTrendIcon value={statement.pyg.net} />
                    <div className="text-[16px] font-black tabular-nums text-zinc-900">
                      {formatEurRead(statement.pyg.net)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Cash Flow (Caja)"
            subtitle="Entradas de caja vs salidas de caja (operativo)"
          >
            <div className="grid grid-cols-1 gap-4">
              <div className="rounded-2xl border border-zinc-100 p-4">
                <div className="flex items-center justify-between gap-3 min-h-12 shrink-0">
                  <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    Entradas (orgánicas)
                  </div>
                  <div className="text-[14px] font-black tabular-nums text-emerald-600">
                    {formatEurRead(statement.cashFlow.inflows.total)}
                  </div>
                </div>
                <div className="mt-2 space-y-1">
                  {statement.cashFlow.inflows.lines.map((l) => (
                    <LineItem key={l.key} label={l.label} amount={l.amount} tone="positive" />
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-100 p-4">
                <div className="flex items-center justify-between gap-3 min-h-12 shrink-0">
                  <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    Salidas (orgánicas)
                  </div>
                  <div className="text-[14px] font-black tabular-nums text-rose-500">
                    {formatEurRead(statement.cashFlow.outflows.total)}
                  </div>
                </div>
                <div className="mt-2 space-y-1">
                  {statement.cashFlow.outflows.lines.map((l) => (
                    <LineItem key={l.key} label={l.label} amount={l.amount} tone="negative" />
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-100 p-4">
                <div className="flex items-center justify-between gap-3 min-h-12 shrink-0">
                  <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    Other (no orgánico)
                  </div>
                  <div className="text-[12px] font-black tabular-nums text-zinc-700">
                    {formatDisplayValue(0)}
                  </div>
                </div>
                <div className="mt-2 space-y-1">
                  <LineItem label="SWAP (cambios)" amount={statement.cashFlow.other.swap} tone="muted" />
                  <LineItem
                    label="ADJUSTMENT (descuadres)"
                    amount={statement.cashFlow.other.adjustment}
                    tone="muted"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-100 p-4">
                <div className="flex items-center justify-between gap-3 min-h-12 shrink-0">
                  <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    Neto (Caja)
                  </div>
                  <div className="flex items-center gap-2">
                    <SignTrendIcon value={statement.cashFlow.net} />
                    <div className="text-[16px] font-black tabular-nums text-zinc-900">
                      {formatEurRead(statement.cashFlow.net)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

