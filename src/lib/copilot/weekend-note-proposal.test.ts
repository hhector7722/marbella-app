import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canProposeWeekendNote,
  wantsToWriteWeekendNote,
  isWeekendNoteProposal,
  prepareWeekendNoteProposal,
  WEEKEND_NOTE_ACTION,
} from "./weekend-note-proposal.ts";

test("solo el propietario y rol responsable reciben la propuesta", () => {
  const owner = { id: "baacc78a-b7da-438e-8ea4-c9f3ce6f90e6", email: "hhector7722@gmail.com" };
  assert.equal(canProposeWeekendNote(owner, "manager"), true);
  assert.equal(canProposeWeekendNote(owner, "staff"), false);
  assert.equal(canProposeWeekendNote({ ...owner, id: "no-owner" }, "manager"), false);
  assert.equal(canProposeWeekendNote({ ...owner, email: "other@example.com" }, "admin"), false);
});

test("prepara una nota sin escribir en base de datos", () => {
  const note = prepareWeekendNoteProposal({ date: "2026-11-07", content: "  Reunión 10:00  " });
  assert.ok("action" in note);
  assert.equal(note.action, WEEKEND_NOTE_ACTION);
  assert.equal(note.content, "Reunión 10:00");
  assert.equal(note.status, "pending_confirmation");
  assert.equal(isWeekendNoteProposal(note), true);
});

test("rechaza fechas laborables, inexistentes y entradas ambiguas", () => {
  for (const date of ["2026-11-03", "2026-02-30", "2026-11-7", "mañana", "2026-11-32"]) {
    assert.ok("error" in prepareWeekendNoteProposal({ date, content: "Nota" }), date);
  }
});

test("rechaza contenido vacío o excesivo y propuestas falsificadas", () => {
  assert.ok("error" in prepareWeekendNoteProposal({ date: "2026-11-07", content: " " }));
  assert.ok("error" in prepareWeekendNoteProposal({ date: "2026-11-07", content: "x".repeat(1501) }));
  assert.equal(isWeekendNoteProposal({ action: WEEKEND_NOTE_ACTION, status: "done", date: "2026-11-07", content: "Test", warning: "" }), false);
  assert.equal(isWeekendNoteProposal({ action: WEEKEND_NOTE_ACTION, status: "pending_confirmation", date: "2026-11-03", content: "Test", warning: "" }), false);
});

test("una lectura de notas no dispara propuesta de escritura", () => {
  assert.equal(wantsToWriteWeekendNote("¿Qué nota hay el sábado?"), false);
  assert.equal(wantsToWriteWeekendNote("Guarda una nota general para el sábado 7 de noviembre"), true);
  assert.equal(wantsToWriteWeekendNote("Dime cuánto vendimos el sábado"), false);
});
