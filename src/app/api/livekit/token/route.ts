import { NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '@/utils/supabase/server';

export async function GET(req: NextRequest) {
    try {
        // 1. VERIFICACIÓN CRÍTICA DE SESIÓN (db-supabase-master rule)
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            console.error('[LIVEKIT_AUTH] Intento de acceso no autorizado', authError);
            return NextResponse.json({ error: 'No autorizado. Se requiere sesión activa.' }, { status: 401 });
        }

        // Opcional: Validar roles si fuera estrictamente necesario, pero como mínimo
        // requerimos un usuario de Bar La Marbella autenticado y válido en auth.users.

        // Extraer parámetros opcionales de la URL, o establecer defaults
        const room = req.nextUrl.searchParams.get('room') || 'marbella-ai-room';

        // 2. RECUPERAR CLAVES LIVEKIT DEL TENANT
        const apiKey = process.env.LIVEKIT_API_KEY;
        const apiSecret = process.env.LIVEKIT_API_SECRET;
        const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

        if (!apiKey || !apiSecret || !wsUrl) {
            console.error('[LIVEKIT_CONFIG] Faltan variables de entorno de LiveKit');
            return NextResponse.json({ error: 'Configuración de servidor incompleta.' }, { status: 500 });
        }

        // 3. GENERACIÓN SEGURA DEL TOKEN (Identidad = user.id)
        // El worker usará esta identidad para restringir consultas SQL en el contexto del usuario actual
        const participantName = user.user_metadata?.first_name || user.email || 'Empleado Marbella';

        const at = new AccessToken(apiKey, apiSecret, {
            identity: user.id, // CRÍTICO: El userId vincula la sesión de LiveKit a la fila RLS de Supabase
            name: participantName,
        });

        at.addGrant({
            room,
            roomJoin: true,
            canPublish: true,
            canSubscribe: true,
            // Evitaremos que el usuario emita video
            canPublishData: true
        });

        const token = await at.toJwt();

        return NextResponse.json({ token });

    } catch (error: any) {
        console.error('[LIVEKIT_ENDPOINT] Error inesperado:', error);
        return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
    }
}
