import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function source(path: string): string {
  return readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
}

test('solo un cliente servidor puede escribir sesiones y mensajes del copiloto', () => {
  const chat = source('app/api/copiloto/route.ts');
  const open = source('app/api/copiloto/open/route.ts');
  const voice = source('app/api/copiloto/voice/token/route.ts');
  const helper = source('lib/copilot/chat-write-client.ts');
  for (const file of [chat, open, voice]) {
    assert.match(file, /createCopilotWriteClient\(/);
    assert.match(file, /chatWriter/);
    assert.match(file, /supabase\.auth\.getUser\(/);
  }
  assert.match(chat, /chatWriter\.from\("ai_chat_messages"\)\.insert/);
  assert.match(chat, /chatWriter\.from\("ai_chat_sessions"\)/);
  assert.match(open, /chatWriter\.from\('ai_chat_sessions'\)/);
  assert.match(voice, /chatWriter\s*\n\s*\.from\('ai_chat_sessions'\)/);
  assert.doesNotMatch(chat, /supabase\.from\("ai_chat_messages"\)\.insert/);
  assert.match(helper, /import 'server-only'/);
  assert.match(helper, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('los accesos a conversaciones siguen ligados al usuario autenticado', () => {
  const route = source('app/api/copiloto/route.ts');
  assert.match(route, /\.eq\("user_id", user.id\)\.maybeSingle\(\)/);
  assert.match(route, /normalizeCopilotRole\(profile\?\.role\)/);
  const history = source('app/api/usage/chat/[eventId]/route.ts');
  assert.match(history, /canAccessUsageAnalytics\(/);
  assert.match(history, /session.user_id !== event.profile_id/);
});
