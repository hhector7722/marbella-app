import type { createClient } from '@/utils/supabase/server';
import type { RoleName } from './permissions.ts';
import { madridDayUtcRangeIso, formatMadridHmFromIso } from '../madrid-date-bounds.ts';

type Client = Awaited<ReturnType<typeof createClient>>;

/** Los horarios publicados no son fichajes ni presencia real. */
export function matchesTodayPublishedScheduleIntent(question: string): boolean {
  const q = question.toLocaleLowerCase('es').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').trim();
  if (!/\bhoy\b/.test(q)) return false;
  if (/\b(?:fich\w*|asistencia|entrada|salida|han trabajado|ha trabajado|horas trabajadas)\b/.test(q)) return false;
  return /\b(?:quien(?:es)?|que empleados|que trabajadores|que personal)\b/.test(q)
    && /\b(?:trabaja\w*|turnos?|horarios?|programad\w*)\b/.test(q);
}

/** Leer turnos publicados del día civil Madrid, con el rol de la sesión. */
export async function tryDirectTodayScheduleAnswer(
  question: string,
  ctx: { supabase: Client; role: RoleName; today: string },
): Promise<string | null> {
  if (!matchesTodayPublishedScheduleIntent(question)) return null;
  if (ctx.role !== 'manager' && ctx.role !== 'admin') {
    return 'No tienes permiso para consultar los turnos de otros trabajadores.';
  }
  const { startIso, endIso } = madridDayUtcRangeIso(ctx.today);
  const { data: shifts, error } = await ctx.supabase.from('shifts')
    .select('user_id,start_time,end_time')
    .eq('is_published', true)
    .gte('start_time', startIso).lte('start_time', endIso)
    .order('start_time', { ascending: true })
    .limit(200);
  if (error || !shifts) return 'No he podido consultar los turnos publicados.';
  if (shifts.length === 200) return 'Hay demasiados turnos para una respuesta completa; consulta el horario publicado.';
  if (!shifts.length) {
    return 'No hay turnos publicados para hoy (' + ctx.today +
      ') en el calendario de personal. Esto no significa que no haya trabajadores presentes.';
  }
  const ids = [...new Set(shifts.map(shift => shift.user_id).filter((id): id is string => typeof id === 'string'))];
  if (!ids.length) return 'Hay turnos publicados, pero no se pudo verificar a quién pertenecen.';
  const { data: people, error: peopleError } = await ctx.supabase.from('profiles')
    .select('id,first_name,last_name').in('id', ids).limit(200);
  if (peopleError || !people || people.length !== ids.length) {
    return 'Hay turnos publicados, pero no se pudo identificar a toda la plantilla.';
  }
  const names = new Map(people.map(p => [p.id, [p.first_name, p.last_name].filter(Boolean).join(' ').trim()]));
  const lines = shifts.map(shift => {
    const name = names.get(shift.user_id);
    const start = formatMadridHmFromIso(shift.start_time);
    const end = formatMadridHmFromIso(shift.end_time);
    if (!name || !start || !end) return null;
    return '• ' + name + ': ' + start + '–' + end;
  });
  if (lines.some(row => row === null)) return 'Faltan nombres u horas en uno o más turnos; no puedo dar una lista completa.';
  return 'Turnos publicados para hoy (' + ctx.today + '):\n' + lines.join('\n') +
    '\nSon horarios previstos, no fichajes.';
}
