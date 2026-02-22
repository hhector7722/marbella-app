import { createClient } from '@supabase/supabase-js';

// Usar SERVICE_ROLE_KEY para que la IA (administradora transversal) salte el RLS y modifique datos a nombre del usuario
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const supabase = createClient(supabaseUrl, supabaseKey);

interface TurnoParams {
    empleado_id: string;
    tipo_consulta: 'horario_semanal' | 'horas_extra' | 'turno_hoy';
}

interface RecetaParams {
    nombre_plato: string;
    dato_requerido: 'ingredientes' | 'alergenos' | 'preparacion';
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
    auditor_horas_nominas: async ({ empleado_id, tipo_consulta }: TurnoParams) => {
        try {
            if (tipo_consulta === 'horario_semanal') {
                const { data, error } = await supabase.from('time_logs')
                    .select('clock_in, clock_out, shift_type')
                    .eq('user_id', empleado_id)
                    .order('clock_in', { ascending: false })
                    .limit(7);
                if (error) throw error;
                return JSON.stringify(data || []);
            } else if (tipo_consulta === 'horas_extra') {
                const { data, error } = await supabase.from('user_balances')
                    .select('horas_banco, acumula_horas')
                    .eq('user_id', empleado_id)
                    .single();
                if (error) throw error;
                return JSON.stringify(data);
            } else {
                // turno hoy
                const today = new Date().toISOString().split('T')[0];
                const { data, error } = await supabase.from('time_logs')
                    .select('clock_in, clock_out, shift_type')
                    .eq('user_id', empleado_id)
                    .gte('clock_in', today)
                    .single();
                if (error && error.code !== 'PGRST116') throw error; // Ignorar not found
                return JSON.stringify(data || { message: "El empleado no tiene turno hoy" });
            }
        } catch (e: any) {
            return `Error al consultar turnos: ${e.message}`;
        }
    },

    consultar_receta: async ({ nombre_plato, dato_requerido }: RecetaParams) => {
        try {
            const { data, error } = await supabase.from('recipes')
                .select(`
                name, allergens, procedure,
                recipe_ingredients (
                    quantity, unit,
                    ingredients ( name )
                )
            `)
                .ilike('name', `%${nombre_plato}%`)
                .single();

            if (error || !data) return "Dato no disponible. No se encontró la receta.";

            if (dato_requerido === 'ingredientes') {
                return JSON.stringify(data.recipe_ingredients);
            } else if (dato_requerido === 'alergenos') {
                return JSON.stringify(data.allergens);
            } else {
                return JSON.stringify(data.procedure);
            }
        } catch (e: any) {
            return `Error al consultar receta: ${e.message}`;
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
