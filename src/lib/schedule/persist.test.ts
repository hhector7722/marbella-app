import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    toDbShiftRow,
    verifyPersistedRows,
    type PersistShiftInput,
    type PersistedDayRow,
    type PersistRowOutput,
} from './persist.ts';

const input = (overrides: Partial<PersistShiftInput> = {}): PersistShiftInput => ({
    employeeId: '11111111-1111-4111-8111-111111111111',
    startISO: '2026-09-20T06:00:00.000Z',
    endISO: '2026-09-20T14:00:00.000Z',
    activity: 'Artística',
    categoria: 'Infantiles',
    participantsCount: '12',
    activity2: '',
    categoria2: '',
    participantsCount2: '',
    eventStart: '08:00',
    eventEnd: '16:00',
    eventStart2: '',
    eventEnd2: '',
    ...overrides,
});

const EMPTY_EXISTING = undefined;
const publishedExisting = {
    user_id: input().employeeId,
    start_time: '2026-09-18T06:00:00.000Z',
    end_time: '2026-09-18T14:00:00.000Z',
    is_published: true,
    activity: 'Artística',
    activity_2: null,
    notes: '{"legacy":true}',
    categoria: 'Infantiles',
    categoria_2: null,
    event_start_time: '08:00',
    event_end_time: '16:00',
    event_participants: 12,
    event_start_time_2: null,
    event_end_time_2: null,
    event_participants_2: null,
};

const persistedRow = (row: PersistRowOutput): PersistedDayRow => ({
    user_id: row.user_id,
    start_time: row.start_time,
    end_time: row.end_time,
    is_published: row.is_published,
    activity: row.activity,
    draft_activity: row.draft_activity,
    draft_start_time: row.draft_start_time,
    draft_end_time: row.draft_end_time,
    notes: row.notes,
    draft_notes: row.draft_notes,
    event_start_time: row.event_start_time,
    event_end_time: row.event_end_time,
    event_participants: row.event_participants,
    categoria: row.categoria,
    draft_categoria: row.draft_categoria,
    activity_2: row.activity_2,
    draft_activity_2: row.draft_activity_2,
    event_start_time_2: row.event_start_time_2,
    event_end_time_2: row.event_end_time_2,
    event_participants_2: row.event_participants_2,
    categoria_2: row.categoria_2,
    draft_categoria_2: row.draft_categoria_2,
});

test('toDbShiftRow: turno nuevo queda como borrador con principales inicializadas', () => {
    const row = toDbShiftRow(input(), EMPTY_EXISTING, false);
    assert.equal(row.is_published, false);
    assert.equal(row.start_time, input().startISO);
    assert.equal(row.draft_start_time, input().startISO);
    assert.equal(row.activity, 'Artística');
    assert.equal(row.event_participants, 12);
    assert.ok(row.draft_notes.includes('"participantsCount":"12"'));
});

test('toDbShiftRow: al publicar sincroniza principales y marca is_published', () => {
    const row = toDbShiftRow(input(), EMPTY_EXISTING, true);
    assert.equal(row.is_published, true);
    assert.equal(row.activity, 'Artística');
    assert.equal(row.categoria, 'Infantiles');
    assert.equal(row.notes, row.draft_notes);
});

test('toDbShiftRow: autoguardado sobre publicado conserva las principales y el ancla', () => {
    const row = toDbShiftRow(input(), publishedExisting, false);
    assert.equal(row.is_published, true);
    assert.equal(row.start_time, publishedExisting.start_time);
    assert.equal(row.end_time, publishedExisting.end_time);
    assert.equal(row.activity, publishedExisting.activity);
    assert.equal(row.notes, publishedExisting.notes);
    assert.equal(row.draft_start_time, input().startISO);
});

test('toDbShiftRow: autoguardado sobre no publicado actualiza el borrador sin tocar principales', () => {
    const existing = { ...publishedExisting, is_published: false, notes: null, activity: null };
    const row = toDbShiftRow(input(), existing, false);
    assert.equal(row.is_published, false);
    assert.equal(row.activity, null);
    assert.equal(row.notes, '');
});

test('verifyPersistedRows: coincidencia exacta', () => {
    const expected = [toDbShiftRow(input(), EMPTY_EXISTING, true)];
    const res = verifyPersistedRows(expected, [persistedRow(expected[0])], []);
    assert.equal(res.ok, true);
    assert.equal(res.matched, 1);
    assert.deepEqual(res.warnings.mismatched, []);
});

test('verifyPersistedRows: falta una fila esperada', () => {
    const expected = [toDbShiftRow(input(), EMPTY_EXISTING, true)];
    const res = verifyPersistedRows(expected, [], []);
    assert.equal(res.ok, false);
    assert.deepEqual(res.warnings.missing, [input().employeeId]);
});

test('verifyPersistedRows: detecta fila con valor distinto', () => {
    const expected = [toDbShiftRow(input(), EMPTY_EXISTING, true)];
    const got = persistedRow(expected[0]);
    got.end_time = '2026-09-20T15:00:00.000Z';
    const res = verifyPersistedRows(expected, [got], []);
    assert.equal(res.ok, false);
    assert.ok(res.warnings.mismatched.some((m) => m.field === 'end_time'));
});

test('verifyPersistedRows: detecta duplicados del mismo trabajador', () => {
    const one = toDbShiftRow(input(), EMPTY_EXISTING, true);
    const dup = persistedRow(one);
    const res = verifyPersistedRows([one], [dup, dup], []);
    assert.equal(res.ok, false);
    assert.ok(res.warnings.duplicates.length > 0);
});

test('verifyPersistedRows: conserva un turno no gestionado idéntico', () => {
    const other = toDbShiftRow(
        input({ employeeId: '22222222-2222-4222-8222-222222222222' }),
        EMPTY_EXISTING,
        false,
    );
    const expected = [toDbShiftRow(input(), EMPTY_EXISTING, true)];
    const res = verifyPersistedRows(
        expected,
        [persistedRow(expected[0]), persistedRow(other)],
        [{ user_id: other.user_id, footprint: persistedRow(other) }],
    );
    assert.equal(res.ok, true);
    assert.deepEqual(res.warnings.nonGestionadosPerdidos, []);
});

test('verifyPersistedRows: avisa si un turno no gestionado se pierde', () => {
    const other = toDbShiftRow(
        input({ employeeId: '22222222-2222-4222-8222-222222222222' }),
        EMPTY_EXISTING,
        false,
    );
    const res = verifyPersistedRows(
        [],
        [],
        [{ user_id: other.user_id, footprint: persistedRow(other) }],
    );
    assert.equal(res.ok, false);
    assert.deepEqual(res.warnings.nonGestionadosPerdidos, [other.user_id]);
});