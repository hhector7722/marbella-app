import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    // Inicialización "Lazy" para evitar errores de compilación estática en Vercel.
    // Durante el 'next build', estas variables pueden no estar cargadas aún.
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    // Si fallan las variables, devolvemos error en tiempo de ejecución, no de compilación.
    if (!supabaseUrl || !supabaseKey) {
        console.error('[AI_CRON_CLEANUP] Error de configuración: Faltan variables de entorno.');
        return NextResponse.json({ error: 'Configuración incompleta en el servidor' }, { status: 500 });
    }

    // 1. AUTENTICACIÓN DEL CRON (Vercel)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        console.warn('[AI_CRON_CLEANUP] Petición Cron no autorizada');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        // 2. CÁLCULO DE FECHA LÍMITE (7 Días)
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        const cutoffDate = new Date(Date.now() - SEVEN_DAYS_MS);

        console.log(`[AI_CRON_CLEANUP] Iniciando limpieza de audios en ai_assets anteriores a ${cutoffDate.toISOString()}`);

        let deletedCount = 0;

        // 3. RECUPERAR TODO EL ÁRBOL (Sub-carpetas por user_id)
        const { data: folders, error: foldersError } = await supabase.storage.from('ai_assets').list();
        if (foldersError) throw foldersError;

        // 4. ITERAR SOBRE LAS SUBCARPETAS (Cada usuario)
        for (const folder of folders || []) {
            if (folder.id) { continue; } // Saltar si es un archivo directo en raíz

            const userIdFolder = folder.name;

            // Buscar archivos dentro de la carpeta del usuario
            const { data: files, error: filesError } = await supabase.storage.from('ai_assets').list(userIdFolder);
            if (filesError) {
                console.error(`[AI_CRON_CLEANUP] Error listando carpeta ${userIdFolder}:`, filesError);
                continue;
            }

            // 5. FILTRAR POR FECHA Y PURGAR
            const filesToDelete = files
                ?.filter(file => {
                    if (!file.created_at) return false;
                    const fileCreated = new Date(file.created_at);
                    return fileCreated < cutoffDate;
                })
                .map(file => `${userIdFolder}/${file.name}`);

            if (filesToDelete && filesToDelete.length > 0) {
                const { error: removeError } = await supabase.storage.from('ai_assets').remove(filesToDelete);
                if (removeError) {
                    console.error(`[AI_CRON_CLEANUP] Error borrando batch:`, removeError);
                } else {
                    deletedCount += filesToDelete.length;
                }
            }
        }

        console.log(`[AI_CRON_CLEANUP] Éxito. Borrados: ${deletedCount} archivos`);
        return NextResponse.json({
            success: true,
            count: deletedCount,
            cutoff_date: cutoffDate.toISOString()
        });

    } catch (error: any) {
        console.error('[AI_CRON_CLEANUP_ERROR]', error);
        return NextResponse.json({
            error: error.message || 'Error Interno de Cron'
        }, { status: 500 });
    }
}
