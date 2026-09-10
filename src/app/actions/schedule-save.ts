'use server';

import { createClient } from '@/utils/supabase/server';
import {
    type PersistedDayRow,
    type PersistRowOutput,
    type PersistShiftInput,
    toDbShiftRow,
    verifyPersistedRows,
} from '@/lib/schedule/persist';

export type DaySaveActionInput = {
    /** Fecha civil local del día (yyyy-MM-dd), afirmada por el cliente. */
    ymd: string;
    /** Rango del día en ISO absoluto (calculado en la zona del navegador). */
    startISO: string;
    endISO: string;
    publish: boolean;
    rows: PersistShiftInput[];
    /** Trabajadores que el editor gestiona (los únicos que puede retirar). */
    managedUserIds: string[];
};

export type DaySaveActionResult =
    | { ok: true; saved: number; published: boolean; matched: number }
    | { ok: false; kind: 'auth' | 'validation' | 'persist' | 'verification'; message: string };

const CIVIL_TIME_RE = /^(\d{2}):(\d{2})$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isIso(iso: unknown): iso is string {
    return typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.test(iso)
        && !Number.isNaN(Date.parse(iso));
}

export async function saveScheduleDayAction(input: DaySaveActionInput): Promise<DaySaveActionResult> {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, kind: 'auth', message: 'No hay sesión activa' };

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

    const role = profile?.role;
    if (!(role === 'manager' || role === 'admin' || role === 'supervisor')) {
        return { ok: false, kind: 'auth', message: 'Solo un manager puede guardar horarios' };
    }

    if (!input || typeof input !== 'object') return validation('payload inválido');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.ymd)) return validation('fecha inválida');
    if (!isIso(input.startISO) || !isIso(input.endISO) || input.endISO < input.startISO) {
        return validation('rango del día inválido');
    }
    if (typeof input.publish !== 'boolean') return validation('publish inválido');

    const rows = Array.isArray(input.rows) ? input.rows : [];
    if (rows.length > 60) return validation('demasiados turnos');
    if (!Array.isArray(input.managedUserIds) || input.managedUserIds.length > 60) {
        return validation('lista de gestionados inválida');
    }

    for (const row of rows) {
        if (!UUID_RE.test(row.employeeId)) return validation('empleado inválido');
        if (!isIso(row.startISO) || !isIso(row.endISO)) return validation('hora inválida');
        if (row.endISO < row.startISO) return validation('franja invertida');
        for (const civil of [row.eventStart, row.eventEnd, row.eventStart2, row.eventEnd2]) {
            if (civil && !CIVIL_TIME_RE.test(civil)) return validation('hora civil inválida');
        }
    }
    const managedSet = new Set(input.managedUserIds);
    for (const id of managedSet) {
        if (!UUID_RE.test(id)) return validation('gestión inválida');
    }

    type PrevRow = {
        user_id: string;
        start_time: string;
        end_time: string;
        is_published: boolean;
        activity: string | null;
        activity_2: string | null;
        notes: string | null;
        categoria: string | null;
        categoria_2: string | null;
        event_start_time: string | null;
        event_end_time: string | null;
        event_participants: number | null;
        event_start_time_2: string | null;
        event_end_time_2: string | null;
        event_participants_2: number | null;
        draft_start_time: string | null;
        draft_end_time: string | null;
        draft_activity: string | null;
        draft_notes: string | null;
        draft_categoria: string | null;
        draft_activity_2: string | null;
        draft_categoria_2: string | null;
    };

    type PrevResult = { data: PrevRow[] | null; error: { message: string } | null };

    const prevResult = await supabase
        .from('shifts')
        .select(
            'user_id, start_time, end_time, is_published, activity, activity_2, notes, ' +
            'categoria, categoria_2, event_start_time, event_end_time, event_participants, ' +
            'event_start_time_2, event_end_time_2, event_participants_2, draft_start_time, ' +
            'draft_end_time, draft_activity, draft_notes, draft_categoria, draft_activity_2, draft_categoria_2',
        )
        .gte('start_time', input.startISO)
        .lte('start_time', input.endISO) as unknown as PrevResult;

    const { data: prevRows, error: prevError } = prevResult;

    if (prevError) return { ok: false, kind: 'persist', message: 'Error al leer el estado actual' };

    const prevByUser = new Map<string, PrevRow>();
    const preserved: Array<{ user_id: string; footprint: PersistedDayRow }> = [];
    for (const row of prevRows ?? []) {
        if (managedSet.has(row.user_id)) {
            prevByUser.set(row.user_id, row);
        } else {
            preserved.push({ user_id: row.user_id, footprint: row as unknown as PersistedDayRow });
        }
    }

    const expected: PersistRowOutput[] = rows.map((row) =>
        toDbShiftRow(row, prevByUser.get(row.employeeId), input.publish),
    );
    const removeIds = input.managedUserIds.filter((id) => !rows.some((row) => row.employeeId === id));

    const { data: rpcData, error: rpcError } = await supabase.rpc('save_schedule_day', {
        p_day_start: input.startISO,
        p_day_end: input.endISO,
        p_rows: expected,
        p_remove_user_ids: removeIds,
    });

    if (rpcError) {
        return { ok: false, kind: 'persist', message: rpcError.message };
    }

    const persisted = (rpcData?.rows ?? []) as PersistedDayRow[];

    // Los turnos gestionados que se esperaban y que no se pueden reconstruir si
    // la RPC no los escribió (verificación de que lo persistido coincide).
    const verification = verifyPersistedRows(expected, persisted, preserved);
    if (!verification.ok) {
        const detail = [
            ...verification.warnings.missing.map((id) => `falta ${id}`),
            ...verification.warnings.mismatched.map((m) => `${m.userId}:${m.field}`),
            ...verification.warnings.duplicates.map((id) => `duplicado ${id}`),
            ...verification.warnings.nonGestionadosPerdidos.map((id) => `perdido ${id}`),
        ].slice(0, 3).join(', ');

        return {
            ok: false,
            kind: 'verification',
            message: `La verificación falló (${detail || 'desconocido'}). Reintenta el guardado.`,
        };
    }

    return {
        ok: true,
        saved: Number(rpcData?.saved ?? expected.length),
        published: Boolean(rpcData?.published),
        matched: verification.matched,
    };
}

function validation(message: string): DaySaveActionResult {
    return { ok: false, kind: 'validation', message };
}