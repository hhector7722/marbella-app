import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path: string) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');

test('chat open is displayed as one row per session without coalescing events', () => {
  const present = source('lib/usage/present.ts');
  const queries = source('lib/usage/queries.ts');
  assert.match(present, /if \(action === 'chat_open'\) return 'Abrió el chat'/);
  assert.match(present, /if \(candidateAction === 'chat_open'\) continue/);
  assert.match(queries, /isChatOpen: row\?\.metadata\?\.action === 'chat_open'/);
});

test('transcripts are fetched lazily and the server validates analyst, event owner and session', () => {
  const usage = source('components/usage/UsageRecentActivity.tsx');
  const api = source('app/api/usage/chat/[eventId]/route.ts');
  const opening = source('app/api/copiloto/open/route.ts');
  const chat = source('components/chat/ChatMarbella.tsx');
  assert.match(usage, /onClick=\{\(\) => void toggleConversation\(event.id\)\}/);
  assert.match(usage, /fetch\(\`\/api\/usage\/chat\//);
  assert.match(api, /canAccessUsageAnalytics\(/);
  assert.match(api, /session.user_id !== event.profile_id/);
  assert.match(api, /\.eq\('user_id', event.profile_id\)/);
  assert.match(api, /'Cache-Control': 'private, no-store, max-age=0'/);
  assert.match(opening, /recordAppUsageEventWithClient\(/);
  assert.match(opening, /sessionId: session.id/);
  assert.match(chat, /await ready/);
  assert.match(chat, /disableUsageTracking/);
});
