// Capa pura de persistencia del editor de horarios.
//
// Contiene SOLO funciones sin efectos: la transformación estado-editor → fila
// de `shifts` (misma semántica que el antiguo handleSave) y la verificación
// post-guardado «lo persistido coincide con lo esperado». Es la pieza que se
// prueba con node:test y la que usan tanto el editor como la server action.

export type PersistShiftInput = {
    employeeId: string;
    /** ISO absoluto calculado en la zona del navegador (ancla del día). */
    startISO: string;
    endISO: string;
    activity: string;
    categoria: string;
    participantsCount: string;
    activity2: string;
    categoria2: string;
    participantsCount2: string;
    /** Horas civiles del día (cabecera del evento, columnas event_*). */
    eventStart: string;
    eventEnd: string;
    eventStart2: string;
    eventEnd2: string;
};

export type DbShiftFields = {
    user_id: string;
    start_time: string;
    end_time: string;
    draft_start_time: string;
    draft_end_time: string;
    draft_activity: string | null;
    draft_categoria: string | null;
    draft_activity_2: string | null;
    draft_categoria_2: string | null;
    draft_notes: string;
    event_start_time: string | null;
    event_end_time: string | null;
    event_participants: number | null;
    event_start_time_2: string | null;
    event_end_time_2: string | null;
    event_participants_2: number | null;
    is_published: boolean;
    activity: string | null;
    activity_2: string | null;
    notes: string;
    categoria: string | null;
    categoria_2: string | null;
};

export type ExistingShiftRow = {
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
};

export type PersistedDayRow = {
    user_id: string;
    start_time: string;
    end_time: string;
    is_published: boolean;
    activity: string | null;
    draft_activity: string | null;
    draft_start_time: string | null;
    draft_end_time: string | null;
    notes: string | null;
    draft_notes: string | null;
    event_start_time: string | null;
    event_end_time: string | null;
    event_participants: number | null;
    categoria: string | null;
    draft_categoria: string | null;
    activity_2: string | null;
    draft_activity_2: string | null;
    event_start_time_2: string | null;
    event_end_time_2: string | null;
    event_participants_2: number | null;
    categoria_2: string | null;
    draft_categoria_2: string | null;
};

export type PersistRowOutput = {
    user_id: string;
    start_time: string;
    end_time: string;
    notes: string;
    is_published: boolean;
    activity: string | null;
    draft_start_time: string | null;
    draft_end_time: string | null;
    draft_activity: string | null;
    /** JSON con la cabecera del día (SIEMPRE string; null nunca). */
    draft_notes: string;
    event_start_time: string | null;
    event_end_time: string | null;
    event_participants: number | null;
    categoria: string | null;
    draft_categoria: string | null;
    activity_2: string | null;
    draft_activity_2: string | null;
    event_start_time_2: string | null;
    event_end_time_2: string | null;
    event_participants_2: number | null;
    categoria_2: string | null;
    draft_categoria_2: string | null;
};

/** Convierte un turno del editor en la fila DB que la RPC debe insertar. */
export function toDbShiftRow(
    input: PersistShiftInput,
    existing: ExistingShiftRow | undefined,
    publish: boolean,
): PersistRowOutput {
    const slot2Participants = input.participantsCount2 || '';
    const raw = () => ({
        user_id: input.employeeId,
        start_time: input.startISO,
        end_time: input.endISO,
        draft_start_time: input.startISO,
        draft_end_time: input.endISO,
        draft_activity: input.activity || null,
        draft_categoria: input.categoria || null,
        draft_activity_2: input.activity2 || null,
        draft_categoria_2: input.categoria2 || null,
        draft_notes: JSON.stringify({
            defaultStart: input.eventStart,
            defaultEnd: input.eventEnd,
            participantsCount: input.participantsCount,
            defaultStart2: input.eventStart2,
            defaultEnd2: input.eventEnd2,
            participantsCount2: slot2Participants,
        }),
        event_start_time: input.eventStart || null,
        event_end_time: input.eventEnd || null,
        event_participants: input.participantsCount ? Number.parseInt(input.participantsCount, 10) : null,
        event_start_time_2: input.eventStart2 || null,
        event_end_time_2: input.eventEnd2 || null,
        event_participants_2: slot2Participants ? Number.parseInt(slot2Participants, 10) : null,
        is_published: publish ? true : (existing?.is_published || false),
        activity: null,
        activity_2: null,
        notes: '',
        categoria: null,
        categoria_2: null,
    });

    const data: PersistRowOutput = raw();

    if (publish) {
        data.activity = input.activity || null;
        data.activity_2 = input.activity2 || null;
        data.notes = data.draft_notes;
        data.categoria = input.categoria || null;
        data.categoria_2 = input.categoria2 || null;
        data.is_published = true;
    } else if (existing && existing.is_published) {
        // Horario publicado: el autoguardado NO toca las columnas principales.
        data.start_time = existing.start_time;
        data.end_time = existing.end_time;
        data.activity = existing.activity;
        data.activity_2 = existing.activity_2;
        data.notes = existing.notes ?? '';
        data.categoria = existing.categoria;
        data.categoria_2 = existing.categoria_2;
        data.is_published = true;
    } else if (!existing) {
        // Turno totalmente nuevo: principales inicializadas como borrador.
        data.activity = input.activity || null;
        data.activity_2 = input.activity2 || null;
        data.notes = data.draft_notes;
        data.categoria = input.categoria || null;
        data.categoria_2 = input.categoria2 || null;
    }

    return data;
}

function norm(value: unknown): string {
    if (value === null || value === undefined || value === '') return '';
    return String(value);
}

function sameEqual(a: number | null | undefined, b: number | null | undefined): boolean {
    return (a ?? null) === (b ?? null);
}

/**
 * `timestamptz` sale de Postgres como «2026-09-12T12:00:00+00:00» y la capa
 * superior lo compara con su propio ISO «...T12:00:00.000Z». Son el mismo
 * instante con distinto texto: se comparan por epoch, no por string.
 */
const TIMESTAMP_COLUMNS = new Set<string>([
    'start_time',
    'end_time',
    'draft_start_time',
    'draft_end_time',
]);

function sameColumnValue(got: unknown, want: unknown, isTimestamp: boolean): boolean {
    if (typeof got === 'number' || typeof want === 'number') {
        return sameEqual(got as number, want as number);
    }
    if (isTimestamp) {
        const g = norm(got);
        const w = norm(want);
        if (!g || !w) return g === w;
        const gt = Date.parse(g);
        const wt = Date.parse(w);
        if (Number.isNaN(gt) || Number.isNaN(wt)) return g === w;
        return gt === wt;
    }
    return norm(got) === norm(want);
}

export type VerificationWarnings = {
    missing: string[];
    mismatched: Array<{ userId: string; field: string; expected: string; got: string }>;
    duplicates: string[];
    nonGestionadosPerdidos: string[];
};

export type VerifyResult = {
    ok: boolean;
    matched: number;
    warnings: VerificationWarnings;
};

const STABLE_COLUMNS: Array<keyof PersistRowOutput> = [
    'user_id', 'start_time', 'end_time', 'is_published',
    'notes', 'activity', 'activity_2', 'categoria', 'categoria_2',
    'draft_start_time', 'draft_end_time', 'draft_activity', 'draft_notes',
    'draft_categoria', 'draft_activity_2', 'draft_categoria_2',
    'event_start_time', 'event_end_time', 'event_participants',
    'event_start_time_2', 'event_end_time_2', 'event_participants_2',
];

/**
 * Comprueba que lo que se pidió persistir existe en la BD y coincide campo a
 * campo, sin duplicados, y que los turnos que el editor no gestiona se conservan.
 */
export function verifyPersistedRows(
    expected: PersistRowOutput[],
    persisted: PersistedDayRow[],
    preserved: Array<{ user_id: string; footprint: PersistedDayRow }>,
): VerifyResult {
    const warnings: VerificationWarnings = {
        missing: [],
        mismatched: [],
        duplicates: [],
        nonGestionadosPerdidos: [],
    };

    const persistedByUser = new Map<string, PersistedDayRow[]>();
    for (const row of persisted) {
        const list = persistedByUser.get(row.user_id) ?? [];
        list.push(row);
        persistedByUser.set(row.user_id, list);
    }

    let matched = 0;
    const expectedByUser = new Map<string, PersistRowOutput>();
    for (const row of expected) {
        const prev = expectedByUser.get(row.user_id);
        if (prev) {
            warnings.duplicates.push(row.user_id);
            continue;
        }
        expectedByUser.set(row.user_id, row);
    }

    for (const [userId, want] of expectedByUser) {
        const rows = persistedByUser.get(userId) ?? [];
        if (rows.length === 0) {
            warnings.missing.push(userId);
            continue;
        }
        if (rows.length > 1) warnings.duplicates.push(userId);
        const got = rows[0];
        let rowOk = true;
        for (const col of STABLE_COLUMNS) {
            const g = got[col];
            const w = want[col];
            const equalValue = sameColumnValue(g, w, TIMESTAMP_COLUMNS.has(col as string));
            if (!equalValue) {
                rowOk = false;
                warnings.mismatched.push({
                    userId,
                    field: col as string,
                    expected: norm(w),
                    got: norm(g),
                });
            }
        }
        if (rowOk) matched += 1;
    }

    // Los turnos que el editor no gestiona deben seguir existiendo, sin
    // duplicados y con el mismo contenido que tenía antes de guardar.
    for (const prev of preserved) {
        const rows = persistedByUser.get(prev.user_id) ?? [];
        if (rows.length === 0) {
            warnings.nonGestionadosPerdidos.push(prev.user_id);
            continue;
        }
        if (rows.length > 1) warnings.duplicates.push(`${prev.user_id} (no gestionado)`);
        const got = rows[0];
        for (const col of STABLE_COLUMNS) {
            const g = got[col];
            const w = prev.footprint[col];
            const equalValue = sameColumnValue(g, w, TIMESTAMP_COLUMNS.has(col as string));
            if (!equalValue) {
                warnings.mismatched.push({
                    userId: prev.user_id,
                    field: col as string,
                    expected: norm(w),
                    got: norm(g),
                });
            }
        }
    }

    const expectedTotal = new Set([
        ...expected.map((row) => row.user_id),
        ...preserved.map((row) => row.user_id),
    ]).size;
    const persistedUsers = new Set(persisted.map((row) => row.user_id)).size;
    if (persistedUsers !== expectedTotal) {
        warnings.mismatched.push({
            userId: '*',
            field: 'total_usuarios',
            expected: String(expectedTotal),
            got: String(persistedUsers),
        });
    }

    return {
        ok: matched === expected.length
            && warnings.missing.length === 0
            && warnings.duplicates.length === 0
            && warnings.nonGestionadosPerdidos.length === 0
            && warnings.mismatched.length === 0,
        matched,
        warnings,
    };
}