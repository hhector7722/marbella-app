/**
 * Archiva el aviso del campo de visión de la cámara como comunicado.
 * Genera el PNG del modal (sin Cancelar/Confirmar) y lo registra en
 * employee_documents de cada persona, carpeta comunicados.
 *
 *   node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
 *     scripts/seed-camera-fov-comunicado.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage, registerFont, type SKRSContext2D } from 'canvas';
import { createClient } from '@supabase/supabase-js';
import {
    CAMERA_FOV_NOTICE_BODY,
    CAMERA_FOV_NOTICE_IMAGE_SRC,
    CAMERA_FOV_NOTICE_TITLE,
} from '../src/lib/staff/camera-fov-notice.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCALE = 3;
const LOGICAL_WIDTH = 360;
const OUT_PNG = path.join(ROOT, 'public/docs/manuals/comunicado-campo-vision-camara.png');
const STORAGE_BASENAME = 'actualizacion-campo-vision-camara.png';
const DISPLAY_FILENAME = `${CAMERA_FOV_NOTICE_TITLE}.png`;

const COLOR_ENVOLVENTE_BAJO = '#0b1c36';
const COLOR_SUPERFICIE = '#ffffff';
const COLOR_TEXTO = '#18181b';
const COLOR_TEXTO_INVERTIDO = '#ffffff';
const RADIO_SUPERFICIE = 16;
const RADIO_CONTROL = 12;

const FONT_REG = '/usr/share/fonts/liberation-sans-fonts/LiberationSans-Regular.ttf';
const FONT_BOLD = '/usr/share/fonts/liberation-sans-fonts/LiberationSans-Bold.ttf';

function loadEnvLocal() {
    const envPath = path.join(ROOT, '.env.local');
    if (!existsSync(envPath)) {
        throw new Error('Falta .env.local');
    }
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx === -1) continue;
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
        ) {
            val = val.slice(1, -1);
        }
        process.env[key] ??= val;
    }
}

function px(n: number): number {
    return n * SCALE;
}

function roundRect(
    ctx: SKRSContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
}

function wrapText(
    ctx: SKRSContext2D,
    text: string,
    maxWidth: number,
): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        if (ctx.measureText(test).width <= maxWidth) {
            current = test;
        } else {
            if (current) lines.push(current);
            current = word;
        }
    }
    if (current) lines.push(current);
    return lines;
}

async function renderNoticePng(): Promise<Buffer> {
    registerFont(FONT_REG, { family: 'Liberation Sans', weight: 'normal' });
    registerFont(FONT_BOLD, { family: 'Liberation Sans', weight: 'bold' });

    const photoPath = path.join(ROOT, 'public', CAMERA_FOV_NOTICE_IMAGE_SRC.replace(/^\//, ''));
    const photo = await loadImage(photoPath);

    const pad = px(20);
    const gap = px(16);
    const innerW = px(LOGICAL_WIDTH);
    const photoH = Math.round((innerW * photo.height) / photo.width);
    const titleSize = px(20);
    const bodySize = px(14);
    const cardPad = px(16);
    const titleLine = titleSize * 1.25;
    const bodyLine = bodySize * 1.4;

    const measure = createCanvas(1, 1).getContext('2d');
    measure.font = `bold ${titleSize}px "Liberation Sans"`;
    const titleLines = wrapText(measure, CAMERA_FOV_NOTICE_TITLE, innerW);
    measure.font = `${bodySize}px "Liberation Sans"`;
    const bodyLines = wrapText(measure, CAMERA_FOV_NOTICE_BODY, innerW - cardPad * 2);

    const titleBlockH = titleLines.length * titleLine;
    const cardH = cardPad * 2 + bodyLines.length * bodyLine;
    const panelH = pad + photoH + gap + titleBlockH + gap + cardH + pad;
    const canvasW = innerW + pad * 2;
    const canvasH = panelH;

    const canvas = createCanvas(canvasW, canvasH);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = COLOR_ENVOLVENTE_BAJO;
    roundRect(ctx, 0, 0, canvasW, canvasH, px(RADIO_SUPERFICIE));
    ctx.fill();

    const x = pad;
    let y = pad;

    ctx.save();
    roundRect(ctx, x, y, innerW, photoH, px(RADIO_CONTROL));
    ctx.clip();
    ctx.drawImage(photo, x, y, innerW, photoH);
    ctx.restore();
    ctx.strokeStyle = COLOR_TEXTO_INVERTIDO;
    ctx.lineWidth = Math.max(1, SCALE);
    roundRect(ctx, x, y, innerW, photoH, px(RADIO_CONTROL));
    ctx.stroke();
    y += photoH + gap;

    ctx.fillStyle = COLOR_TEXTO_INVERTIDO;
    ctx.font = `bold ${titleSize}px "Liberation Sans"`;
    ctx.textBaseline = 'top';
    for (const line of titleLines) {
        ctx.fillText(line, x, y);
        y += titleLine;
    }
    y += gap;

    ctx.fillStyle = COLOR_SUPERFICIE;
    roundRect(ctx, x, y, innerW, cardH, px(RADIO_CONTROL));
    ctx.fill();

    ctx.fillStyle = COLOR_TEXTO;
    ctx.font = `${bodySize}px "Liberation Sans"`;
    let textY = y + cardPad;
    for (const line of bodyLines) {
        ctx.fillText(line, x + cardPad, textY);
        textY += bodyLine;
    }

    return canvas.toBuffer('image/png');
}

async function seedComunicado(png: Buffer) {
    loadEnvLocal();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    }

    const admin = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: profiles, error: profilesErr } = await admin
        .from('profiles')
        .select('id, first_name, codigo_empleado, role');
    if (profilesErr) throw profilesErr;

    const targets = (profiles ?? []).filter(
        (p) => p.role !== 'admin' && (p.first_name ?? '').toLowerCase() !== 'test',
    );

    let uploaded = 0;
    let skipped = 0;
    for (const profile of targets) {
        const storagePath = `${profile.id}/comunicados/${STORAGE_BASENAME}`;
        const { data: existing } = await admin
            .from('employee_documents')
            .select('id')
            .eq('user_id', profile.id)
            .eq('storage_path', storagePath)
            .maybeSingle();

        const { error: upErr } = await admin.storage
            .from('employee-documents')
            .upload(storagePath, png, {
                contentType: 'image/png',
                upsert: true,
            });
        if (upErr) {
            throw new Error(`${profile.first_name}: ${upErr.message}`);
        }

        if (existing) {
            skipped += 1;
            continue;
        }

        const { error: insErr } = await admin.from('employee_documents').insert({
            user_id: profile.id,
            codigo_empleado: profile.codigo_empleado ?? profile.id,
            tipo: 'comunicado',
            filename: DISPLAY_FILENAME,
            storage_path: storagePath,
        });
        if (insErr) {
            throw new Error(`${profile.first_name}: ${insErr.message}`);
        }
        uploaded += 1;
        console.log(`OK ${profile.first_name}`);
    }

    console.log(`Insertados ${uploaded}, ya existían ${skipped}, total ${targets.length}`);
}

async function main() {
    const png = await renderNoticePng();
    writeFileSync(OUT_PNG, png);
    console.log(`PNG ${OUT_PNG} (${png.length} bytes)`);
    await seedComunicado(png);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
