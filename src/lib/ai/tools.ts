import { createClient } from '@/utils/supabase/server';
import { verifyUserAction, UserRole } from './rbac';

// Helpers para fechas
function getMonDayStr(date: Date = new Date()) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  if (day !== 1) d.setHours(-24 * (day - 1));
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

export const UnifiedToolset = {
  /**
   * Consulta información laboral (horas trabajadas, extras, deuda)
   */
  async getLaborSummary(providedUserId?: string, targetEmployeeName?: string) {
    const supabase = await createClient();
    const { userId, role } = await verifyUserAction('view_own_labor', providedUserId);

    let tId = userId;
    let label = 'Tus';

    if (targetEmployeeName && (role === 'manager' || role === 'supervisor')) {
      const { data: p } = await supabase
        .from('profiles')
        .select('id, first_name')
        .ilike('first_name', `%${targetEmployeeName}%`)
        .maybeSingle();

      if (p) {
        tId = p.id;
        label = `Las de ${p.first_name}`;
      } else {
        return `No encontré a ningún empleado llamado "${targetEmployeeName}".`;
      }
    }

    const mondayStr = getMonDayStr();
    
    const [snapshot, lastSnapshot] = await Promise.all([
      supabase.from('weekly_snapshots').select('*').eq('user_id', tId).eq('week_start', mondayStr).maybeSingle(),
      supabase.from('weekly_snapshots').select('final_balance').eq('user_id', tId).order('week_start', { ascending: false }).limit(1).maybeSingle()
    ]);

    const snap = snapshot.data;
    const last = lastSnapshot.data;

    return JSON.stringify({
      contexto: label,
      semana_actual: mondayStr,
      horas_extra_semana: snap?.extra_hours || 0,
      balance_semanal: snap?.balance_hours || 0,
      deuda_acumulada_total: last?.final_balance || 0,
      nota: "Diferencia estricta entre realidad (fichajes) y contrato."
    });
  },

  /**
   * Consulta métricas financieras (Ventas, Cierres)
   */
  async getFinancials(providedUserId: string | undefined, startDate: string, endDate: string) {
    try {
      const { role } = await verifyUserAction('view_financials', providedUserId);
      const supabase = await createClient();

      const { data: cls, error } = await supabase
        .from('cash_closings')
        .select('net_sales, closing_date')
        .gte('closing_date', startDate)
        .lte('closing_date', endDate);

      if (error) throw error;

      const totalSales = cls?.reduce((sum, c) => sum + (Number(c.net_sales) || 0), 0) || 0;

      return JSON.stringify({
        periodo: `${startDate} al ${endDate}`,
        ventas_totales_cierres: totalSales.toFixed(2),
        numero_cierres: cls?.length || 0,
        fuente: 'Cierres de Caja oficiales'
      });
    } catch (e: any) {
      return `Error: ${e.message}`;
    }
  },

  /**
   * Consulta detalles de una receta
   */
  async getRecipeInfo(providedUserId: string | undefined, recipeName: string) {
    try {
      await verifyUserAction('view_recipes', providedUserId);
      const supabase = await createClient();

      const { data: recipe } = await supabase
        .from('recipes')
        .select('id, name, elaboration, presentation')
        .ilike('name', `%${recipeName}%`)
        .limit(1)
        .maybeSingle();

      if (!recipe) return `No se encontró la receta de "${recipeName}".`;

      const { data: ingredientsData } = await supabase
        .from('recipe_ingredients')
        .select('quantity, unit, ingredients(name)')
        .eq('recipe_id', recipe.id);

      const ingredients = ingredientsData?.map((ing: any) => 
        `${ing.quantity} ${ing.unit} de ${ing.ingredients?.name}`
      ) || [];

      return JSON.stringify({
        plato: recipe.name,
        ingredientes: ingredients,
        elaboracion: recipe.elaboration || 'Sin instrucciones.',
        presentacion: recipe.presentation || 'Sin notas.'
      });
    } catch (e: any) {
      return `Error: ${e.message}`;
    }
  },

  /**
   * Actualiza el borrador de pedido (el carrito)
   */
  async updateOrderDraft(providedUserId: string | undefined, productName: string, quantity: number, action: 'add' | 'set' | 'remove') {
    try {
      const { userId } = await verifyUserAction('manage_orders', providedUserId);
      const supabase = await createClient();

      const { data: ingredient, error: ingError } = await supabase
        .from('ingredients')
        .select('id, name, order_unit, purchase_unit')
        .ilike('name', `%${productName}%`)
        .limit(1)
        .maybeSingle();

      if (ingError || !ingredient) return `Producto "${productName}" no encontrado.`;

      if (action === 'remove') {
        await supabase.from('order_drafts').delete().eq('user_id', userId).eq('ingredient_id', ingredient.id);
        return `Eliminado ${ingredient.name} del borrador.`;
      }

      const { data: current } = await supabase
        .from('order_drafts')
        .select('quantity')
        .eq('user_id', userId)
        .eq('ingredient_id', ingredient.id)
        .maybeSingle();

      let finalQty = quantity;
      if (action === 'add') {
        finalQty = (Number(current?.quantity) || 0) + quantity;
      }

      if (finalQty <= 0) {
        await supabase.from('order_drafts').delete().eq('user_id', userId).eq('ingredient_id', ingredient.id);
        return `${ingredient.name} eliminado (cantidad 0).`;
      }

      const { error: upsertError } = await supabase.from('order_drafts').upsert({
        user_id: userId,
        ingredient_id: ingredient.id,
        quantity: finalQty,
        unit: ingredient.order_unit || ingredient.purchase_unit || 'ud'
      }, { onConflict: 'user_id, ingredient_id' });

      if (upsertError) throw upsertError;

      return `Borrador actualizado: ${ingredient.name} x${finalQty}.`;
    } catch (e: any) {
      return `Error: ${e.message}`;
    }
  }
};
