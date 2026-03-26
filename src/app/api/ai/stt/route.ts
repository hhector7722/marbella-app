import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

// Configurable max file size for STT in MB (fallback to DEFAULT_MAX_STT_MB)
const DEFAULT_MAX_STT_MB = 10;
const MAX_MB = (() => {
  const env = process.env.MAX_STT_FILE_MB;
  const parsed = env ? parseInt(env, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_STT_MB;
})();

async function runCommand(cmd: string, args: string[], opts: { cwd?: string } = {}) {
  return await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('close', (code) => resolve({ stdout, stderr, exitCode: code ?? 0 }));
    p.on('error', (err) => reject(err));
  });
}

async function runShell(commandStr: string, cwd?: string) {
  return await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve, reject) => {
    const p = spawn(commandStr, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      cwd,
    });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('close', (code) => resolve({ stdout, stderr, exitCode: code ?? 0 }));
    p.on('error', (err) => reject(err));
  });
}

async function safeRm(p: string) {
  try {
    await fs.rm(p, { recursive: true, force: true });
  } catch {}
}

export async function POST(req: Request) {
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  let tmpDir: string | null = null;
  try {
    const formData = await req.formData();
    const file = formData.get('file') as Blob | null;
    if (!file) return NextResponse.json({ error: 'No file uploaded (field "file")' }, { status: 400 });

    const sizeMb = (file.size || 0) / 1024 / 1024;
    if (sizeMb > MAX_MB) return NextResponse.json({ error: `File too large (max ${MAX_MB} MB)` }, { status: 413 });

    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stt-'));
    const inPath = path.join(tmpDir, 'input.webm');
    const wavPath = path.join(tmpDir, 'input.wav');

    const arrayBuf = await file.arrayBuffer();
    await fs.writeFile(inPath, Buffer.from(arrayBuf));

    // Convertir a WAV mono 16kHz
    const ff = await runCommand('ffmpeg', ['-y', '-i', inPath, '-ar', '16000', '-ac', '1', wavPath]);
    if (ff.exitCode !== 0) {
      await safeRm(tmpDir);
      return NextResponse.json(
        { error: `Fallo al convertir audio con ffmpeg. ¿Está instalado? ${ff.stderr || ff.stdout}` },
        { status: 500 },
      );
    }

    const provider = (process.env.STT_PROVIDER || '').trim();

    if (provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        await safeRm(tmpDir);
        return NextResponse.json({ error: 'STT_PROVIDER=openai pero falta OPENAI_API_KEY.' }, { status: 500 });
      }

      const wavBuf = await fs.readFile(wavPath);
      const fd = new FormData();
      fd.append('file', new Blob([wavBuf], { type: 'audio/wav' }), 'input.wav');
      fd.append('model', 'whisper-1');
      fd.append('language', 'es');

      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: fd,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        await safeRm(tmpDir);
        return NextResponse.json({ error: `OpenAI transcription failed: ${text || res.statusText}` }, { status: res.status });
      }

      const json = (await res.json()) as any;
      const text = String(json?.text ?? '').trim();
      await safeRm(tmpDir);
      return NextResponse.json({ text });
    }

    if (provider === 'whisper_local') {
      const template = process.env.WHISPER_COMMAND;
      if (!template) {
        await safeRm(tmpDir);
        return NextResponse.json({ error: 'STT_PROVIDER=whisper_local pero falta WHISPER_COMMAND.' }, { status: 500 });
      }

      const cmdStr = template.includes('{file}') ? template.replaceAll('{file}', wavPath) : `${template} ${wavPath}`;
      const { stdout, stderr, exitCode } = await runShell(cmdStr, tmpDir);
      if (exitCode !== 0) {
        await safeRm(tmpDir);
        return NextResponse.json({ error: `whisper_local failed: ${stderr || stdout}` }, { status: 500 });
      }

      let text = (stdout || '').trim();
      if (!text) {
        // fallback: leer cualquier .txt que haya generado el comando
        const files = await fs.readdir(tmpDir).catch(() => []);
        const txt = files.find((f) => f.toLowerCase().endsWith('.txt'));
        if (txt) {
          text = String(await fs.readFile(path.join(tmpDir, txt)).catch(() => '')).trim();
        }
      }

      await safeRm(tmpDir);
      return NextResponse.json({ text });
    }

    await safeRm(tmpDir);
    return NextResponse.json(
      {
        error:
          'No STT provider configured. Set STT_PROVIDER=openai + OPENAI_API_KEY, o STT_PROVIDER=whisper_local + WHISPER_COMMAND.',
      },
      { status: 500 },
    );
  } catch (e: any) {
    if (tmpDir) await safeRm(tmpDir);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

