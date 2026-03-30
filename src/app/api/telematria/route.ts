import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const getClient = () => createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'mock-url',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-key'
);

export async function POST(request: Request) {
    try {
        const supabase = getClient();
        const body = await request.json();

        // El Agente manda: { sala: [...], total_mesas_vivas: X }
        const mesasVivas = body.sala || [];

        // ALERTA: Cambia 'mesas_activas' por el nombre real de tu tabla en Supabase si es distinto
        const NOMBRE_TABLA_KDS = 'mesas_activas';

        if (mesasVivas.length > 0) {
            // 1. Inserción masiva en un solo viaje
            const { error: upsertError } = await supabase
                .from(NOMBRE_TABLA_KDS)
                .upsert(mesasVivas, { onConflict: 'id_ticket' });

            if (upsertError) throw upsertError;

            // 2. Limpiar mesas fantasma (Las que están en BD pero ya no vienen en el payload del TPV)
            const idsVivos = mesasVivas.map((m: any) => m.id_ticket);
            await supabase
                .from(NOMBRE_TABLA_KDS)
                .delete()
                .not('id_ticket', 'in', `(${idsVivos.join(',')})`);

        } else {
            // Si el array llega vacío, el restaurante está vacío. Borramos todo.
            await supabase.from(NOMBRE_TABLA_KDS).delete().neq('id_ticket', 'MESA_NULA');
        }

        return NextResponse.json({ success: true, actualizadas: mesasVivas.length }, { status: 200 });
    } catch (error: any) {
        console.error('🔥 Error API Telemetría:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}