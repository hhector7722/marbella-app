import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';

export async function runCmd(cmd: string, args: string[], cwd?: string) {
  return await new Promise<{ stdout: string; stderr: string; code: number }>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], cwd, env: process.env });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('close', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
    p.on('error', (err) => reject(err));
  });
}

export async function convertWebmToWav(inPath: string, outPath: string) {
  const { code, stderr } = await runCmd('ffmpeg', ['-y', '-i', inPath, '-ar', '16000', '-ac', '1', outPath]);
  if (code !== 0) throw new Error(`ffmpeg failed: ${stderr}`);
}

export async function callOpenAITranscription(wavPath: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const form = new FormData();
  const fileBuf = await fs.readFile(wavPath);
  form.append('file', new Blob([fileBuf], { type: 'audio/wav' }), 'input.wav');
  form.append('model', 'whisper-1');
  form.append('language', 'es');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`OpenAI transcription failed: ${txt}`);
  }
  const json: any = await res.json();
  return String(json?.text ?? '').trim();
}

export async function callWhisperLocal(wavPath: string) {
  const cmdTemplate = process.env.WHISPER_COMMAND;
  if (!cmdTemplate) throw new Error('WHISPER_COMMAND not set');

  const cmdStr = cmdTemplate.includes('{file}') ? cmdTemplate.split('{file}').join(wavPath) : `${cmdTemplate} ${wavPath}`;
  const p = spawn(cmdStr, { shell: true, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  let stdout = '';
  let stderr = '';
  p.stdout.on('data', (d) => (stdout += d.toString()));
  p.stderr.on('data', (d) => (stderr += d.toString()));
  const code = await new Promise<number>((resolve) => p.on('close', (c) => resolve(c ?? 0)));
  if (code !== 0) throw new Error(`whisper_local failed: ${stderr || stdout}`);
  return stdout.trim();
}

export async function transcribeWav(wavPath: string) {
  const provider = (process.env.STT_PROVIDER || 'openai').toLowerCase();
  if (provider === 'openai') return await callOpenAITranscription(wavPath);
  if (provider === 'whisper_local') return await callWhisperLocal(wavPath);
  throw new Error('Unsupported STT_PROVIDER');
}

