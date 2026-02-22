import { tool } from 'ai';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

/**
 * Herramienta de Asistencia con Delegación de RLS.
 */
export const getStaffAttendanceTool = (supabaseAccessToken: string) => tool({
    description: 'Consulta las horas trabajadas y extras de la plantilla. Los managers ven todo, el staff solo lo suyo.',
    parameters: z.object({
        employee_name: z.string().optional().describe('Nombre del empleado a consultar (opcional, si eres manager).'),
        startDate: z.string().optional().describe('Fecha de inicio (YYYY-MM-DD).'),
        endDate: z.string().optional().describe('Fecha de fin (YYYY-MM-DD).')
    }),
    execute: async ({ employee_name, startDate, endDate }) => {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            global: {
                headers: {
                    Authorization: `Bearer ${supabaseAccessToken}`
                }
            }
        });

        console.log(`[AI Tool] Consultando asistencia. Empleado: ${employee_name || 'yo'}, Rango: ${startDate || 'siempre'} a ${endDate || 'siempre'}`);

        let targetUserId: string | null = null;

        // 1. Resolver nombre si se proporciona
        if (employee_name) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('id, first_name, last_name')
                .ilike('first_name', `%${employee_name}%`)
                .limit(1)
                .maybeSingle();

            if (profile) {
                targetUserId = profile.id;
            } else {
                // Si no encontramos al empleado, puede ser porque no tenemos permisos para ver otros perfiles
                // o porque el nombre no coincide.
                return {
                    error: `No encontré ningún empleado llamado "${employee_name}" o no tienes permisos para consultarlo.`
                };
            }
        }

        // 2. Consultar logs de tiempo
        let query = supabase
            .from('time_logs')
            .select('total_hours, clock_in, profiles(first_name, last_name)')
            .not('total_hours', 'is', null);

        if (targetUserId) {
            query = query.eq('user_id', targetUserId);
        }

        if (startDate) query = query.gte('clock_in', startDate);
        if (endDate) query = query.lte('clock_in', endDate);

        const { data: logs, error } = await query.order('clock_in', { ascending: false });

        if (error) {
            console.error('[AI Tool] Error consultando time_logs:', error.message);
            throw new Error(`Error de base de datos: ${error.message}`);
        }

        if (!logs || logs.length === 0) {
            return { message: "No se encontraron registros de asistencia para los criterios seleccionados." };
        }

        // 3. Agrupar por empleado y calcular totales
        const stats: Record<string, { name: string, total: number, days: Set<string> }> = {};

        logs.forEach((log: any) => {
            const name = log.profiles ? `${log.profiles.first_name} ${log.profiles.last_name}` : 'Usuario desconocido';
            const day = log.clock_in.split('T')[0];

            if (!stats[name]) {
                stats[name] = { name, total: 0, days: new Set() };
            }

            stats[name].total += log.total_hours || 0;
            stats[name].days.add(day);
        });

        const summary = Object.values(stats).map(s => {
            const totalHours = s.total;
            const daysWorked = s.days.size;
            // Cálculo simple de extras: horas que exceden 8h por día trabajado
            // Nota: Esto es una simplificación, en producción usaríamos la lógica de contratos.
            const standardHours = daysWorked * 8;
            const extras = Math.max(0, totalHours - standardHours);

            return {
                empleado: s.name,
                horas_totales: totalHours.toFixed(2),
                dias_fichados: daysWorked,
                posibles_extras: extras.toFixed(2),
                mensaje: `${s.name}: ${totalHours.toFixed(2)}h totales en ${daysWorked} días. (~${extras.toFixed(2)}h extras).`
            };
        });

        return summary;
    }
});
