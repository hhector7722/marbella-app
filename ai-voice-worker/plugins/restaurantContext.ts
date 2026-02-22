import { createClient } from '@supabase/supabase-js';

// Usar SERVICE_ROLE_KEY para que la IA (administradora transversal) salte el RLS y modifique datos a nombre del usuario
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const supabase = createClient(supabaseUrl, supabaseKey);

interface InfoLaboralParams {
    empleado_nombre_o_id: string;
    semana_iso?: string;
}

interface RecetaParams {
    nombre_plato: string;
}

interface VentasParams {
    metrica: 'caja_actual' | 'ticket_medio' | 'facturacion_dia';
}

interface BorradorParams {
    producto_normalizado: string;
    cantidad: number;
    accion: 'añadir' | 'establecer' | 'eliminar';
    user_id: string; // ID del usuario actual de la sesión
}

export const restaurantTools = {
    supabase,
    consultar_info_laboral: async ({ empleado_nombre_o_id, semana_iso }: InfoLaboralParams) => {
        try {
            let targetUserId = empleado_nombre_o_id;

            // Detectar si NO es un UUID para intentar resolverlo por nombre
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(empleado_nombre_o_id);
            if (!isUUID) {
                const { data: profileMatch } = await supabase
                    .from('profiles')
                    .select('id, first_name')
                    .ilike('first_name', `%${empleado_nombre_o_id}%`)
                    .limit(1)
                    .maybeSingle();

                if (profileMatch) {
                    targetUserId = profileMatch.id;
                    console.log(`[AI Voice] Resuelto el nombre '${empleado_nombre_o_id}' al ID: ${targetUserId}`);
                } else {
                    return JSON.stringify({ error: `No encontré a ningún empleado llamado "${empleado_nombre_o_id}".` });
                }
            }

            // Lógica de fecha (Lunes de la semana)
            const date = semana_iso ? new Date(semana_iso) : new Date();
            const day = date.getDay() || 7;
            if (day !== 1) date.setHours(-24 * (day - 1));
            date.setHours(0, 0, 0, 0);
            const mondayStr = date.toISOString().split('T')[0];
            const sunday = new Date(date);
            sunday.setDate(date.getDate() + 7);
            const sundayStr = sunday.toISOString().split('T')[0];

            const [logs, snapshot] = await Promise.all([
                supabase.from('time_logs').select('total_hours, clock_in').eq('user_id', targetUserId).gte('clock_in', mondayStr).lt('clock_in', sundayStr).not('total_hours', 'is', null),
                supabase.from('weekly_snapshots').select('*').eq('user_id', targetUserId).eq('week_start', mondayStr).maybeSingle()
            ]);

            const totalHoursReal = logs.data?.reduce((sum, l) => sum + (l.total_hours || 0), 0) || 0;
            const overtime = snapshot.data?.overtime_hours || 0;
            const pendingDebt = snapshot.data?.pending_debt_hours || 0;

            return JSON.stringify({
                semana_consultada: mondayStr,
                horas_trabajadas_reales: totalHoursReal.toFixed(2),
                horas_extras_a_pagar: overtime.toFixed(2),
                deuda_horas_pendientes: pendingDebt.toFixed(2),
                estado_pago: snapshot.data?.is_paid ? 'Pagado' : 'Pendiente o No aplica'
            });
        } catch (e: any) {
            return JSON.stringify({ error: `Error al consultar info laboral: ${e.message}` });
        }
    },

    consultar_receta: async ({ nombre_plato }: RecetaParams) => {
        try {
            const { data: recipe } = await supabase.from('recipes').select('id, name, elaboration, presentation').ilike('name', `%${nombre_plato}%`).limit(1).maybeSingle();
            if (!recipe) return JSON.stringify({ error: `No se encontró la receta de ${nombre_plato}.` });

            const { data: ingredientsData } = await supabase
                .from('recipe_ingredients')
                .select(`
                    quantity,
                    unit,
                    ingredients ( name )
                `)
                .eq('recipe_id', recipe.id);

            const ingredients = ingredientsData?.map((ing: any) => `${ing.quantity} ${ing.unit} de ${ing.ingredients?.name}`) || [];

            return JSON.stringify({
                plato: recipe.name,
                ingredientes: ingredients.length > 0 ? ingredients : 'No hay ingredientes listados.',
                elaboracion: recipe.elaboration || 'Sin instrucciones especificas.'
            });
        } catch (e: any) {
            return JSON.stringify({ error: `Error al consultar receta: ${e.message}` });
        }
    },

    consultar_ventas: async ({ metrica }: VentasParams) => {
        try {
            if (metrica === 'caja_actual') {
                const { data, error } = await supabase.rpc('get_theoretical_balance', { p_box_id: 'default' });
                if (error) throw error;
                return JSON.stringify({ saldo_teorico: data });
            } else {
                // Para simplificar, devolvemos dato no disponible si no está codificado
                return 'Dato no disponible';
            }
        } catch (e: any) {
            return `Error al consultar ventas: ${e.message}`;
        }
    },

    modificar_borrador_pedido: async ({ producto_normalizado, cantidad, accion, user_id }: BorradorParams) => {
        try {
            // 1. Encontrar el ingredient_id real basado en el producto normalizado
            const { data: ingredient, error: ingError } = await supabase.from('ingredients')
                .select('id, name, order_unit, purchase_unit')
                .ilike('name', `%${producto_normalizado}%`)
                .limit(1)
                .single();

            if (ingError || !ingredient) {
                return `No se encontró el ingrediente: ${producto_normalizado} en el catálogo.`;
            }

            const ingredient_id = ingredient.id;

            // 2. Obtener borrador actual si lo hay
            const { data: currentDraft } = await supabase.from('order_drafts')
                .select('quantity')
                .eq('user_id', user_id)
                .eq('ingredient_id', ingredient_id)
                .maybeSingle();

            let finalQuantity = cantidad;
            let finalUnit = ingredient.order_unit || ingredient.purchase_unit || 'unidad';

            if (accion === 'eliminar') {
                await supabase.from('order_drafts').delete()
                    .eq('user_id', user_id)
                    .eq('ingredient_id', ingredient_id);
                return `Producto eliminado del borrador.`;
            } else if (accion === 'añadir') {
                const currentQty = currentDraft ? Number(currentDraft.quantity) : 0;
                finalQuantity = currentQty + cantidad;
            } // Si es 'establecer', usamos 'cantidad' directamente

            if (finalQuantity <= 0) {
                await supabase.from('order_drafts').delete()
                    .eq('user_id', user_id)
                    .eq('ingredient_id', ingredient_id);
                return `Producto eliminado del borrador (cantidad 0).`;
            }

            // 3. Upsert
            const { error: upsertError } = await supabase.from('order_drafts').upsert({
                user_id: user_id,
                ingredient_id: ingredient_id,
                quantity: finalQuantity,
                unit: finalUnit,
                // updated_at: new Date().toISOString() // Nota: Asegúrate de que order_drafts soporte esto
            }, { onConflict: 'user_id, ingredient_id' });

            if (upsertError) throw upsertError;

            return `Borrador actualizado exitosamente. Producto: ${ingredient.name}, Cantidad total: ${finalQuantity} ${finalUnit}.`;
        } catch (e: any) {
            return `Error crítico al modificar borrador: ${e.message}`;
        }
    }
};
