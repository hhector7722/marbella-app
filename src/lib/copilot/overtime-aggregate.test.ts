import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { createClient } from '@/utils/supabase/server';
import { detectOvertimeTotalIntent, queryOvertimeTotal, formatOvertimeTotalAnswer } from './overtime-aggregate.ts';
type Client = Awaited<ReturnType<typeof createClient>>;

function fakeDb(rows: Array<Record<string, unknown>>, failure = false) {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  const db = {
    from: (table: string) => {
      calls.push({ op: 'from', args: [table] });
      const q = {
        select: (...args: unknown[]) => { calls.push({ op: 'select', args }); return q; },
        gte: (...args: unknown[]) => { calls.push({ op: 'gte', args }); return q; },
        lte: (...args: unknown[]) => { calls.push({ op: 'lte', args }); return q; },
        order: (...args: unknown[]) => { calls.push({ op: 'order', args }); return q; },
        range: (...args: unknown[]) => {
          calls.push({ op: 'range', args });
          return Promise.resolve(failure
            ? { data: null, error: { message: 'RLS' } }
            : { data: rows.slice(Number(args[0]), Number(args[1]) + 1), error: null });
        },
      };
      return q;
    },
  };
  return { supabase: db as unknown as Client, calls };
}

const userId = '11111111-1111-4111-8111-111111111111';
const today = '2026-11-17';
const example = [
  { user_id: 'a', week_start: '2026-11-09', extra_hours: 12, total_cost: 120, has_missing_rate: false, prefer_stock_effective: false },
  { user_id: 'b', week_start: '2026-11-09', extra_hours: 0.5, total_cost: 0, has_missing_rate: false, prefer_stock_effective: true },
  { user_id: 'c', week_start: '2026-11-09', extra_hours: 0, total_cost: 0, has_missing_rate: false, prefer_stock_effective: false },
];

test('detecta total de toda la plantilla y hereda solo contexto de horas extras', () => {
  assert.deepEqual(
    detectOvertimeTotalIntent('quiero el coste total de horas extras de todos los trabajadores', [
      'cuanto cuestan las horas extras de la semana pasada',
    ]),
    { matched: true, period: 'semana_pasada' },
  );
  assert.deepEqual(
    detectOvertimeTotalIntent('coste total horas extra de todos esta semana'),
    { matched: true, period: 'esta_semana' },
  );
  assert.deepEqual(
    detectOvertimeTotalIntent('coste total horas extras de todos', ['ventas de ayer']),
    { matched: true, period: null },
  );
  assert.equal(detectOvertimeTotalIntent('horas extras de Silvia').matched, false);
  assert.equal(detectOvertimeTotalIntent('coste total horas extra de Silvia').matched, false);
  assert.equal(detectOvertimeTotalIntent('total ventas de todos los trabajadores').matched, false);
});

test('calcula suma oficial sin inventar tarifas y trata bolsa como coste cero', async () => {
  const { supabase, calls } = fakeDb(example);
  const result = await queryOvertimeTotal({ supabase, role: 'manager', userId, today }, 'semana_pasada');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.summary.dates, { inicio: '2026-11-09', fin: '2026-11-15' });
  assert.equal(result.summary.totalCostCents, 12000);
  assert.equal(result.summary.employeesWithOvertime, 2);
  assert.equal(result.summary.bankHoursWithoutCost, 0.5);
  assert.equal(result.summary.employeesWithPositiveCost, 1);
  assert.match(formatOvertimeTotalAnswer(result), /120,00 €|120\.00 €/);
  assert.ok(calls.some(c => c.op === 'gte' && c.args[1] === '2026-11-09'));
  assert.ok(calls.some(c => c.op === 'lte' && c.args[1] === '2026-11-15'));
});

test('no permite a otros roles ni consultar una sola fila', async () => {
  for (const role of ['staff', 'supervisor', 'chef', 'admin'] as const) {
    const { supabase, calls } = fakeDb(example);
    const result = await queryOvertimeTotal({ supabase, role, userId, today }, 'semana_pasada');
    assert.deepEqual(result, { ok: false, reason: 'forbidden' });
    assert.equal(calls.length, 0);
  }
});

test('no presenta errores de RLS como un total de 0 €', async () => {
  const { supabase } = fakeDb(example, true);
  const result = await queryOvertimeTotal({ supabase, role: 'manager', userId, today }, 'semana_pasada');
  assert.deepEqual(result, { ok: false, reason: 'query_failed' });
  assert.doesNotMatch(formatOvertimeTotalAnswer(result), /0,00 €/);
});

test('los resultados vacíos no son un total numérico fiable', async () => {
  const { supabase } = fakeDb([]);
  const result = await queryOvertimeTotal({ supabase, role: 'manager', userId, today }, 'semana_pasada');
  assert.deepEqual(result, { ok: false, reason: 'no_data' });
});

test('detecta filas con tarifa pendiente y no afirma un total definitivo', async () => {
  const { supabase } = fakeDb([{ ...example[0], has_missing_rate: true }]);
  const result = await queryOvertimeTotal({ supabase, role: 'manager', userId, today }, 'semana_pasada');
  assert.equal(result.ok, true);
  assert.match(formatOvertimeTotalAnswer(result), /parcial/);
});

test('maneja más de 500 registros sin truncar el total', async () => {
  const rows = Array.from({ length: 502 }, (_, i) => ({
    user_id: String(i), week_start: '2026-11-09', extra_hours: 1,
    total_cost: 2.5, has_missing_rate: false, prefer_stock_effective: false,
  }));
  const { supabase, calls } = fakeDb(rows);
  const result = await queryOvertimeTotal({ supabase, role: 'manager', userId, today }, 'semana_pasada');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.summary.totalCostCents, 502 * 250);
  assert.equal(result.summary.employeesWithOvertime, 502);
  assert.equal(calls.filter(c => c.op === 'range').length, 2);
});
