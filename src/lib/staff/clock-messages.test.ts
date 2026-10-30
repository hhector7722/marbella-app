import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const root = resolve(import.meta.dirname, '../../..');
const source = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('Mensajes privados entregados al próximo fichaje', () => {
  const sql = source('supabase/migrations/20261029065103_staff_clock_messages.sql');
  const onePendingSql = source('supabase/migrations/20261030065455_one_pending_clock_message_per_user.sql');
  const actions = source('src/app/actions/staff-clock-messages.ts');
  const profile = source('src/app/profile/page.tsx');
  const clock = source('src/components/dashboards/StaffDashboardView.tsx');
  const legacy = source('src/components/TimeTracker.tsx');
  const modal = source('src/components/staff/ClockMessagePrompt.tsx');

  it('solo Héctor puede enviar, también a su propio perfil', () => {
    assert.match(profile, /isMasterDashboardUser\(currentUser\?\.email\)/);
    assert.match(profile, /sendStaffClockMessage\(profile\.id, clockMessageDraft\)/);
    assert.match(profile, /isMasterDashboardUser\(currentUser\?\.email\) && \(\s*<div className="mt-4 flex justify-center">/,
      'Héctor encuentra un botón claramente visible en el menú de su perfil');
    assert.match(profile, /Enviar mensaje al fichar/);
    assert.match(actions, /if \(authError \|\| !user \|\| !isMasterDashboardUser\(user\.email\)\)/);
    assert.match(sql, /CREATE POLICY staff_clock_messages_owner_insert/);
    assert.match(sql, /'hhector7722@gmail\.com'/);
    assert.match(sql, /recipient_id uuid NOT NULL REFERENCES public\.profiles/);
  });

  it('oculta mensajes hasta fichar entrada o salida de forma no manual', () => {
    assert.match(sql, /ALTER TABLE public\.staff_clock_messages ENABLE ROW LEVEL SECURITY;/);
    assert.match(sql, /tl\.clock_in > staff_clock_messages\.created_at\s+OR tl\.clock_out > staff_clock_messages\.created_at/);
    assert.match(sql, /coalesce\(tl\.is_manual_entry, false\) = false/);
    assert.equal((clock.match(/const messages = await showClockMessagesAfterPunch\(userId\)/g) ?? []).length, 2,
      'entrada y salida esperan la consulta de mensajes antes de abrir el vídeo');
    assert.match(legacy, /void showClockMessagesAfterPunch\(\)/);
    assert.match(clock, /if \(!user \|\| user\.id !== punchedUserId\) return/);
  });

  it('avisa antes del vídeo, difumina el fondo y solo presenta el mensaje y Entendido', () => {
    assert.match(modal, /hideHeader/);
    assert.match(modal, /layer="base"/);
    assert.doesNotMatch(modal, /footer=\{/);
    assert.doesNotMatch(modal, /Mensaje de Héctor|Mensaje recibido al registrar|mensaje\(s\) más pendientes/);
    assert.match(modal, /\{message\?\.body \?\? ''\}/);
    assert.match(modal, /Entendido/);
    assert.match(clock, /queuedClockVideoRef\.current = \(\) => openGiffOverlay\(overlayConfig\.entrada\)/);
    assert.match(clock, /queuedClockVideoRef\.current = \(\) => openGiffOverlay\(overlayConfig\.salida\)/);
    assert.match(clock, /const remaining = clockMessages\.filter/);
    assert.match(clock, /if \(remaining\.length === 0\) \{[\s\S]*?playVideo\?\.\(\)/);
    const css = source('src/app/globals.css');
    assert.match(css, /\[data-modal-backdrop='base'\] \{[\s\S]*?backdrop-filter: var\(--modal-overlay-base-filter\)/);
  });

  it('impide guardar un segundo mensaje hasta que se confirme el primero', () => {
    assert.match(onePendingSql, /CREATE UNIQUE INDEX IF NOT EXISTS staff_clock_messages_one_pending_per_recipient/);
    assert.match(onePendingSql, /ON public\.staff_clock_messages \(recipient_id\)/);
    assert.match(onePendingSql, /WHERE acknowledged_at IS NULL;/,
      'la unicidad desaparece solo después de la confirmación de lectura');
    assert.match(actions, /findUnacknowledgedMessage\(db, recipient\)/);
    assert.match(actions, /\.is\('acknowledged_at', null\)/);
    assert.match(actions, /error\.code === '23505'/, 'protección concurrente de la base de datos');
    assert.match(actions, /checkPendingStaffClockMessage/, 'comprobación previa propietaria');
    assert.match(actions, /isMasterDashboardUser\(user\.email\)/, 'solo Héctor consulta mensajes ajenos');
    assert.match(profile, /await checkPendingStaffClockMessage\(profile\.id\)/);
    assert.match(profile, /setClockMessagePending\(check\.pending\)/);
    assert.match(profile, /setClockMessagePending\(result\.pending\)/, 'muestra conflictos de envíos simultáneos');
    assert.match(profile, /data-element="profile-pending-clock-message"/);
    assert.match(profile, /\{clockMessagePending\?\.body\}/, 'se ve el texto completo del mensaje pendiente');
    assert.match(profile, /hasta[\s\S]*?que registre su entrada o salida y confirme que lo ha leído/);
    assert.match(actions, /acknowledged_at: new Date\(\)\.toISOString\(\)/);
  });

  it('nadie más puede cambiar los mensajes y la lectura requiere confirmación', () => {
    assert.match(sql, /GRANT UPDATE \(acknowledged_at\)/);
    assert.doesNotMatch(sql, /GRANT UPDATE \(body\)/);
    assert.match(sql, /CREATE POLICY staff_clock_messages_recipient_ack/);
    assert.match(modal, /onClose=\{\(\) => \{/);
    assert.match(modal, /acknowledgeStaffClockMessage\(message\.id\)/);
    assert.match(modal, /Entendido/);
    assert.match(actions, /\.eq\('recipient_id', user\.id\)/);
  });
});
