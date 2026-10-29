import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const src = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(resolve(src, path), 'utf8');

describe('Fin de semana: notas integradas y navegación entre modales', () => {
    const modal = read('components/modals/StaffScheduleModal.tsx');
    const notes = read('components/schedule/ScheduleNotesFooter.tsx');
    const activity = read('components/pavilion/PavilionDayModal.tsx');
    const saveAction = read('app/actions/schedule-weekend-public-note.ts');

    it('Nota general no ocupa el cuerpo superior del horario del día', () => {
        assert.doesNotMatch(modal, /<WeekendPublicScheduleNote/);
        assert.match(modal, /footer=\{[\s\S]*?<ScheduleNotesFooter/);
        assert.match(notes, /data-element="schedule-general-note"/);
        assert.match(notes, /line-clamp-1/);
        assert.match(notes, /Ver nota general completa/);
    });

    it('Héctor dispone de Cancelar, Guardar y General dentro de Añadir nota', () => {
        assert.match(notes, /instance="schedule-note-cancel"/);
        assert.match(notes, /instance="schedule-note-save"/);
        assert.match(notes, /instance="schedule-note-save-general"/);
        assert.match(notes, /maySaveGeneral \? \(/);
        assert.match(notes, /mayReply && authUserId === HECTOR_ID && isWeekend\(date\)/);
        assert.match(notes, /saveWeekendPublicScheduleNote\(date, draft\)/);
        assert.match(saveAction, /user.id !== HECTOR_ID/);
        assert.match(saveAction, /isWeekendDate\(date\)/);
    });

    it('Guardar sigue guardando nota personal; General guarda la pública y la presenta', () => {
        assert.match(notes, /instance="schedule-note-save"[^]*?handleSave\(\)/);
        assert.match(notes, /instance="schedule-note-save-general"[^]*?handleSaveGeneral\(\)/);
        assert.match(notes, /setGeneralNote\(result.content\)/);
        assert.match(notes, /schedule_weekend_public_notes/);
    });

    it('La card de actividad abre el horario del mismo día sin cerrar el origen', () => {
        assert.match(modal, /data-element="schedule-event-summary"/);
        assert.match(modal, /setActivityDetailDate\(format\(selectedDate, 'yyyy-MM-dd'\)\)/);
        assert.match(modal, /onKeyDown=\{\(event\)/);
        assert.match(modal, /<PavilionDayModal/);
        assert.match(modal, /parentInstance="staff-schedule"/);
        assert.match(modal, /onClose=\{\(\) => setActivityDetailDate\(null\)\}/);
        assert.match(activity, /layer=\{parentInstance \? 'derived' : 'base'\}/);
        assert.match(activity, /dismissScope=\{parentInstance \? 'self' : 'chain'\}/);
        assert.match(activity, /parentInstance=\{parentInstance\}/);
    });
});
