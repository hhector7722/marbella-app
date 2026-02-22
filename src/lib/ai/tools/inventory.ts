import { tool } from 'ai';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

/**
 * Herramienta de Inventario con Delegación de RLS.
 * Esta función es un factory que recibe el access token del usuario logueado
 * para que Supabase aplique las políticas RLS correspondientes.
 */
export const getInventoryTool = (supabaseAccessToken: string) => tool({
    description: 'Consulta el inventario, stock y precos de compra de ingredientes del restaurante.',
    parameters: z.object({
        search: z.string().optional().describe('Nombre del ingrediente o producto a buscar.')
    }),
    execute: async ({ search }) => {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

        // Instanciamos el cliente inyectando el token del usuario en el header de Auth
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            global: {
                headers: {
                    Authorization: `Bearer ${supabaseAccessToken}`
                }
            }
        });

        console.log(`[AI Tool] Consultando inventario con RLS delegado. Búsqueda: ${search || 'todo'}`);

        let query = supabase
            .from('ingredients')
            .select('name, current_price, purchase_unit, order_unit');

        if (search) {
            query = query.ilike('name', `%${search}%`);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[AI Tool] Error en consulta RLS:', error.message);
            throw new Error(`Error de base de datos: ${error.message}`);
        }

        return data;
    }
});
