import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const root = resolve(import.meta.dirname, '../../..');
const source = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('Mensajes privados entregados al próximo fichaje', () => {
  const sql = source('supabase/migrations/20261029065103_staff_clock_messages.sql');
  const actions = source('src/app/actions/staff-clock-messages.ts');
  const profile = source('src/app/profile/page.tsx');
  const clock = source('src/components/dashboards/StaffDashboardView.tsx');
  const legacy = source('src/components/TimeTracker.tsx');
  const modal = source('src/components/staff/ClockMessagePrompt.tsx');

  it('solo Héctor puede enviar, también a su propio perfil', () => {
    assert.match(profile, /isMasterDashboardUser\(currentUser\?\.email\)/);
    assert.match(profile, /sendStaffClockMessage\(profile\.id, clockMessageDraft\)/);
    assert.match(actions, /if \(authError \|\| !user \|\| !isMasterDashboardUser\(user\.email\)\)/);
    assert.match(sql, /CREATE POLICY staff_clock_messages_owner_insert/);
    assert.match(sql, /'hhector7722@gmail\.com'/);
    assert.match(sql, /recipient_id uuid NOT NULL REFERENCES public\.profiles/);
  });

  it('oculta mensajes hasta fichar entrada o salida de forma no manual', () => {
    assert.match(sql, /ALTER TABLE public\.staff_clock_messages ENABLE ROW LEVEL SECURITY;/);
    assert.match(sql, /tl\.clock_in > staff_clock_messages\.created_at\s+OR tl\.clock_out > staff_clock_messages\.created_at/);
    assert.match(sql, /coalesce\(tl\.is_manual_entry, false\) = false/);
    assert.match(clock, /void showClockMessagesAfterPunch\(userId\)/);
    assert.match(legacy, /void showClockMessagesAfterPunch\(\)/);
    assert.match(clock, /if \(!user \|\| user\.id !== punchedUserId\) return/);
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
