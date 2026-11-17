import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchesTodayPublishedScheduleIntent, tryDirectTodayScheduleAnswer } from './direct-schedule.ts';
import type { createClient } from '@/utils/supabase/server';
type Client = Awaited<ReturnType<typeof createClient>>;

test('distingue horarios publicados y asistencia real', () => {
  assert.equal(matchesTodayPublishedScheduleIntent('¿Quién trabaja hoy y en qué horario?'), true);
  assert.equal(matchesTodayPublishedScheduleIntent('¿Quién ha trabajado hoy?'), false);
  assert.equal(matchesTodayPublishedScheduleIntent('¿Quién ha fichado hoy?'), false);
});

test('sin turnos publicados no afirma ausencia de trabajadores', async () => {
  const query = {
    select: () => query, eq: () => query, gte: () => query, lte: () => query,
    order: () => query, limit: async () => ({ data: [], error: null }),
  };
  const supabase = { from: () => query } as unknown as Client;
  const answer = await tryDirectTodayScheduleAnswer('Quién trabaja hoy y en qué horario?', {
    supabase, role: 'manager', today: '2026-11-17',
  });
  assert.match(answer!, /No hay turnos publicados/);
  assert.match(answer!, /no significa que no haya trabajadores presentes/);
});

test('los turnos publicados se formatean según hora de Madrid y no como fichajes', async () => {
  const example = [{
    user_id: 'u1', start_time: '2026-11-17T07:00:00.000Z',
    end_time: '2026-11-17T15:00:00.000Z',
  }];
  const q = {
    select: () => q, eq: () => q, gte: () => q, lte: () => q,
    order: () => q, limit: async () => ({ data: example, error: null }),
    in: () => q,
  };
  const supabase = { from: (table: string) => table === 'shifts'
    ? q
    : { select: () => ({ in: () => ({ limit: async () => ({
      data: [{ id: 'u1', first_name: 'Alba', last_name: 'Prueba' }], error: null,
    }) }) }) },
  } as unknown as Client;
  const answer = await tryDirectTodayScheduleAnswer('¿Quién trabaja hoy y en qué horario?', {
    supabase, role: 'manager', today: '2026-11-17',
  });
  assert.match(answer!, /Alba Prueba: 08:00–16:00/);
  assert.match(answer!, /horarios previstos, no fichajes/);
});

test('solo gerencia recibe el horario de toda la plantilla', async () => {
  const answer = await tryDirectTodayScheduleAnswer('Quién trabaja hoy y en qué horario?', {
    supabase: {} as Client, role: 'staff', today: '2026-11-17',
  });
  assert.match(answer!, /No tienes permiso/);
});
