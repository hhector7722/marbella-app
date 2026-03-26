import { WebSocketServer } from 'ws';
import type WebSocket from 'ws';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { convertWebmToWav, transcribeWav } from './utils/stt-utils';
import { verifyToken } from './utils/token';

const PORT = Number(process.env.VOICE_WS_PORT || 8081);
const SECRET = process.env.VOICE_WS_SECRET || '';
const CHUNK_INTERVAL = Number(process.env.STT_CHUNK_INTERVAL_MS || 1500);
const MAX_CONCURRENT = Number(process.env.VOICE_WS_MAX_CONCURRENT || 8);
const NEXT_BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

type Session = {
  ws: WebSocket;
  chunks: Buffer[];
  timer: NodeJS.Timeout | null;
  processing: boolean;
  closed: boolean;
  userId?: string;
  authToken?: string;
};

const wss = new WebSocketServer({ port: PORT });
const sessions = new Set<Session>();

console.log(`Voice WS server listening on ws://0.0.0.0:${PORT}`);

wss.on('connection', (ws, req) => {
  const session: Session = { ws, chunks: [], timer: null, processing: false, closed: false };

  if (sessions.size >= MAX_CONCURRENT) {
    ws.send(JSON.stringify({ type: 'error', message: 'Server busy: too many concurrent calls' }));
    ws.close();
    return;
  }

  const url = new URL(req.url ?? '', `http://${req.headers.host}`);
  const token = url.searchParams.get('token') || '';
  if (!SECRET) {
    ws.send(JSON.stringify({ type: 'error', message: 'Server misconfigured (VOICE_WS_SECRET missing)' }));
    ws.close();
    return;
  }

  const v = verifyToken(token, SECRET);
  if (!v.ok) {
    ws.send(JSON.stringify({ type: 'error', message: `Unauthorized: ${v.reason || 'invalid token'}` }));
    ws.close();
    return;
  }
  session.userId = v.payload?.sub;
  session.authToken = token;

  sessions.add(session);

  ws.on('message', (data) => {
    if (typeof data === 'string') {
      try {
        const msg = JSON.parse(data);
        if (msg?.type === 'start_call') {
          ws.send(JSON.stringify({ type: 'ack', message: 'call_started' }));
        } else if (msg?.type === 'stop_call') {
          flushAndTranscribe(session, true).catch((e) => {
            ws.send(JSON.stringify({ type: 'error', message: String(e) }));
          });
        }
      } catch {
        // ignore
      }
      return;
    }

    session.chunks.push(Buffer.from(data as any));
    if (!session.timer) {
      session.timer = setTimeout(() => {
        flushAndTranscribe(session, false).catch((e) => {
          ws.send(JSON.stringify({ type: 'error', message: String(e) }));
        });
      }, CHUNK_INTERVAL);
    }
  });

  ws.on('close', () => {
    session.closed = true;
    sessions.delete(session);
    if (session.timer) clearTimeout(session.timer);
  });
});

async function flushAndTranscribe(session: Session, final: boolean) {
  if (session.processing) return;
  if (session.chunks.length === 0) {
    if (final) session.ws.send(JSON.stringify({ type: 'transcript_final', text: '' }));
    return;
  }

  session.processing = true;
  if (session.timer) {
    clearTimeout(session.timer);
    session.timer = null;
  }

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-'));
  try {
    const inWebm = path.join(tmp, 'in.webm');
    const outWav = path.join(tmp, 'out.wav');
    await fs.writeFile(inWebm, Buffer.concat(session.chunks));
    session.chunks = [];

    await convertWebmToWav(inWebm, outWav);
    const text = await transcribeWav(outWav);

    session.ws.send(JSON.stringify({ type: final ? 'transcript_final' : 'transcript_partial', text }));

    // Llamar al agente (Next.js) con identidad verificando el token efímero.
    try {
      const apiUrl = `${NEXT_BASE_URL}/api/ai/voice-chat`;
      const apiRes = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.authToken || ''}`,
        },
        body: JSON.stringify({ query: text }),
      });
      const apiJson: any = await apiRes.json().catch(() => ({}));
      const agentText = String(apiJson?.response || apiJson?.message || '').trim();
      session.ws.send(JSON.stringify({ type: 'agent_text', text: agentText }));
    } catch (e) {
      session.ws.send(JSON.stringify({ type: 'error', message: 'Agent call failed: ' + String(e) }));
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
    session.processing = false;
  }
}

