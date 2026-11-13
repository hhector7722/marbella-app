import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildUsageRecentFeed } from './present.ts';

const source = (path: string) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');

test('chat open appears as one expandable row even when openings are seconds apart', () => {
  const events = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']
    .map((id, index) => ({
      id, event_type: 'action' as const, path: '/dashboard', search: null, label: 'Chat IA',
      duration_ms: null, metadata: { action: 'chat_open', sessionId: id },
      created_at: new Date(Date.UTC(2026, 10, 13, 11, 0, index)).toISOString(),
    }));
  const feed = buildUsageRecentFeed(events);
  assert.equal(feed.length, 2);
  assert.equal(feed[0].title, 'Abrió el chat');
  assert.equal(feed[1].title, 'Abrió el chat');
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
