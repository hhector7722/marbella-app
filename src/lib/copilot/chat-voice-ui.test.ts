import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const source = (file: string) => readFileSync(new URL(file, root), 'utf8');

test('imagen adjunta muestra miniatura y control rojo de eliminación', () => {
  const chat = source('components/chat/ChatMarbella.tsx');
  assert.match(chat, /selectedImagePreview/);
  assert.match(chat, /URL\.createObjectURL\(file\)/);
  assert.match(chat, /URL\.revokeObjectURL\(/);
  assert.match(chat, /aria-label="Quitar imagen adjunta"/);
  assert.match(chat, /bg-rose-500/);
});

test('grabación visible con pausa, borrado y envío manual', () => {
  const chat = source('components/chat/ChatMarbella.tsx');
  const recorder = source('components/chat/VoiceRecordingBar.tsx');
  const hook = source('hooks/useVoiceRecorder.tsx');
  assert.doesNotMatch(chat, /onPointerDown=\{startMicOnHold\}/);
  for (const label of ['Eliminar grabación', 'Reanudar grabación', 'Pausar grabación', 'Enviar mensaje de voz']) {
    assert.ok(recorder.includes(label), label);
  }
  assert.match(recorder, /createAnalyser\(\)/);
  assert.match(hook, /function pauseRecording\(\)/);
  assert.match(hook, /function resumeRecording\(\)/);
});

test('la llamada real es WebRTC y está protegida contra gastos no autorizados', () => {
  const call = source('components/chat/VoiceConversation.tsx');
  const token = source('app/api/copiloto/voice/token/route.ts');
  const tools = source('app/api/copiloto/voice/tools/route.ts');
  assert.match(call, /new RTCPeerConnection\(\)/);
  assert.match(call, /realtime\/calls/);
  assert.doesNotMatch(call, /from ['"]@\/hooks\/useVoiceRecorder|window\.speechSynthesis|new MediaRecorder/);
  assert.match(token, /OPENAI_REALTIME_VOICE_ENABLED/);
  assert.match(token, /acceptPaidRealtime/);
  assert.match(token, /gpt-realtime-2\.1-mini/);
  assert.match(tools, /toolEnabled\(role/);
  assert.doesNotMatch(tools, /executeCopilotTool|ACTION_SCHEMA/);
});

test('la respuesta de chat conserva margen frente al timeout del servidor', () => {
  const route=source('app/api/copiloto/route.ts');
  assert.match(route, /const requestStartedAt = Date\.now\(\);/);
  assert.match(route, /const deadlineMs = Math\.min\(started \+ 47500, requestStartedAt \+ 44000\);/);
  assert.match(route, /export const maxDuration = 60;/);
});

test('el micro soporta toque corto y pulsación larga que finaliza al soltar', () => {
  const chat = source('components/chat/ChatMarbella.tsx');
  assert.match(chat, /onPointerDown=\{handleMicPointerDown\}/);
  assert.match(chat, /addEventListener\('pointerup', release\)/);
  assert.match(chat, /addEventListener\('pointercancel', cancel\)/);
  assert.match(chat, /window\.clearTimeout\(hold\.timer\)/);
  assert.match(chat, /hold\.onRelease\?\.\(\)/);
  assert.match(chat, /hold\.started = await startVoiceNote\(\)/);
  assert.match(chat, /suppressMicClickRef\.current/);
  assert.match(chat, /void sendVoiceNote\(\)/);
});
