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

test('solo gerencia recibe el horario de toda la plantilla', async () => {
  const answer = await tryDirectTodayScheduleAnswer('Quién trabaja hoy y en qué horario?', {
    supabase: {} as Client, role: 'staff', today: '2026-11-17',
  });
  assert.match(answer!, /No tienes permiso/);
});
