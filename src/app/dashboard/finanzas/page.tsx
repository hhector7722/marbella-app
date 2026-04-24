import { redirect } from 'next/navigation';
import FinancialDashboardClient from '@/app/dashboard/finanzas/FinancialDashboardClient';
import { createClient } from '@/utils/supabase/server';
import { getStartOfLocalToday, parseTPVDate } from '@/utils/date-utils';

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isYmd(s: string | null | undefined): s is string {
  if (!s) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function safeYmdOrDefault(s: string | null | undefined, fallback: string): string {
  if (!isYmd(s)) return fallback;
  // Validación numérica (sin new Date('YYYY-MM-DD')): si no parsea bien, fallback.
  const d = parseTPVDate(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return fallback;
  return s;
}

type FinancialStatement = {
  meta: {
    startDate: string;
    endDate: string;
    generatedAt: string;
    timezone: string;
  };
  pyg: {
    income: { total: number; lines: { key: string; label: string; amount: number }[] };
    expenses: { total: number; lines: { key: string; label: string; amount: number }[] };
    net: number;
  };
  cashFlow: {
    inflows: { total: number; lines: { key: string; label: string; amount: number }[] };
    outflows: { total: number; lines: { key: string; label: string; amount: number }[] };
    other: { adjustment: number; swap: number };
    net: number;
  };
  reconciliation: {
    accrualNet: number;
    cashNet: number;
    delta: number;
  };
};

export default async function FinanzasPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const startParam = Array.isArray(sp.start) ? sp.start[0] : sp.start;
  const endParam = Array.isArray(sp.end) ? sp.end[0] : sp.end;

  const today = getStartOfLocalToday();
  const defaultEnd = formatLocalYmd(today);
  const defaultStart = (() => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    d.setDate(d.getDate() - 30);
    return formatLocalYmd(d);
  })();

  const startDate = safeYmdOrDefault(startParam, defaultStart);
  const endDate = safeYmdOrDefault(endParam, defaultEnd);

  const supabase = await createClient();

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) {
    redirect('/login');
  }
  if (!auth?.user) redirect('/login');

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', auth.user.id)
    .single();
  if (profileErr) redirect('/dashboard');
  if (profile?.role !== 'manager') redirect('/dashboard');

  const { data, error } = await supabase.rpc('get_financial_statement', {
    p_start_date: startDate,
    p_end_date: endDate,
  });
  if (error) {
    throw new Error(`RPC get_financial_statement falló: ${error.message}`);
  }

  return (
    <FinancialDashboardClient
      initialStartDate={startDate}
      initialEndDate={endDate}
      statement={data as FinancialStatement}
    />
  );
}

