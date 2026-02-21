import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Usamos el cliente estándar pero con SERVICE_ROLE_KEY para ignorar RLS en borrados masivos
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase Env variables for Cron Backend');
}

const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: NextRequest) {
    // 1. AUTENTICACIÓN DEL CRON (Vercel)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (
        // En desarrollo local omitiremos la comprobación rigurosa si el secret no existe, 
        // pero en VERCEL es OBLIGATORIO que coincida
        cronSecret && authHeader !== `Bearer ${cronSecret}`
    ) {
        console.warn('[AI_CRON_CLEANUP] Unauthorized Cron Request');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // 2. CÁLCULO DE FECHA LÍMITE (7 Días)
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        const cutoffDate = new Date(Date.now() - SEVEN_DAYS_MS);

        console.log(`[AI_CRON_CLEANUP] Iniciando limpieza de audios en ai_assets anteriores a ${cutoffDate.toISOString()}`);

        // Contador de archivos borrados
        let deletedCount = 0;

        // 3. RECUPERAR TODO EL ÁRBOL (Sub-carpetas por user_id)
        // Supabase Storage 'list' no es recursivo por defecto, hay que buscar las carpetas (user_ids) y luego sus archivos
        const { data: folders, error: foldersError } = await supabase.storage.from('ai_assets').list();
        if (foldersError) throw foldersError;

        // 4. ITERAR SOBRE LAS SUBCARPETAS (Cada usuario)
        for (const folder of folders || []) {
            // Si es un archivo en la raíz y no una carpeta (poco probable en nuestra app, pero posible)
            if (folder.id) { continue; } // id is present for files, null for folders (prefix) as per standard supabase list behavior if empty

            const userIdFolder = folder.name;

            // Buscar archivos dentro de la carpeta del usuario
            const { data: files, error: filesError } = await supabase.storage.from('ai_assets').list(userIdFolder);
            if (filesError) {
                console.error(`[AI_CRON_CLEANUP] Error listando carpeta ${userIdFolder}:`, filesError);
                continue; // saltar si hay error
            }

            // 5. FILTRAR POR FECHA Y PURGAR (Solo BINARIOS en MEDIA)
            const filesToDelete = files
                ?.filter(file => {
                    const fileCreated = new Date(file.created_at);
                    return fileCreated < cutoffDate;
                })
                .map(file => `${userIdFolder}/${file.name}`);

            if (filesToDelete && filesToDelete.length > 0) {
                console.log(`[AI_CRON_CLEANUP] Borrando ${filesToDelete.length} archivos obsoletos del usr: ${userIdFolder}`);
                const { error: removeError } = await supabase.storage.from('ai_assets').remove(filesToDelete);

                if (removeError) {
                    console.error(`[AI_CRON_CLEANUP] Error borrando batch:`, removeError);
                } else {
                    deletedCount += filesToDelete.length;
                }
            }
        }

        // 6. RESPUESTA CRON
        // IMPORTANTE: NO TOCAMOS ai_chat_messages (las transcripciones en PGSQL se mantienen intactas como histórico rápido/texto)
        console.log(`[AI_CRON_CLEANUP] Éxito. Borrados: ${deletedCount} archivos`);
        return NextResponse.json({ success: true, count: deletedCount, cutoff_date: cutoffDate.toISOString() });

    } catch (error: any) {
        console.error('[AI_CRON_CLEANUP_ERROR]', error);
        return NextResponse.json({ error: error.message || 'Error Interno de Cron' }, { status: 500 });
    }
}
