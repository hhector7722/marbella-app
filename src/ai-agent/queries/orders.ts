import { createClient } from '@/utils/supabase/server';
import { verifyUserAction } from '@/lib/ai/rbac';

export type OrderDraftAction = 'add' | 'set' | 'remove';

export async function updateOrderDraft(params: {
  productName: string;
  quantity: number;
  action: OrderDraftAction;
}): Promise<{
  ok: boolean;
  productName: string;
  ingredientId?: string;
  newQuantity?: number;
  message: string;
}> {
  const { userId } = await verifyUserAction('manage_orders');
  const supabase = await createClient();

  const { productName, quantity, action } = params;
  if (!productName.trim()) {
    return { ok: false, productName, message: 'Producto vacío: no hay a qué añadir al pedido.' };
  }

  const { data: ingredient, error: ingError } = await supabase
    .from('ingredients')
    .select('id, name, order_unit, purchase_unit')
    .ilike('name', `%${productName}%`)
    .limit(1)
    .maybeSingle();

  if (ingError) throw new Error(`Error buscando ingrediente: ${ingError.message}`);
  if (!ingredient) {
    return { ok: false, productName, message: `Producto "${productName}" no encontrado.` };
  }

  if (action === 'remove') {
    const { error: delError } = await supabase
      .from('order_drafts')
      .delete()
      .eq('user_id', userId)
      .eq('ingredient_id', ingredient.id);

    if (delError) throw new Error(`Error eliminando del borrador: ${delError.message}`);
    return { ok: true, productName: ingredient.name, ingredientId: ingredient.id, message: `Eliminado ${ingredient.name} del pedido.` };
  }

  const { data: current, error: currError } = await supabase
    .from('order_drafts')
    .select('quantity')
    .eq('user_id', userId)
    .eq('ingredient_id', ingredient.id)
    .maybeSingle();

  if (currError) throw new Error(`Error consultando cantidad actual: ${currError.message}`);

  const currentQty = Number((current as any)?.quantity) || 0;
  const finalQty = action === 'set' ? quantity : currentQty + quantity;

  if (finalQty <= 0) {
    const { error: delError } = await supabase
      .from('order_drafts')
      .delete()
      .eq('user_id', userId)
      .eq('ingredient_id', ingredient.id);

    if (delError) throw new Error(`Error borrando cuando cantidad <= 0: ${delError.message}`);
    return { ok: true, productName: ingredient.name, ingredientId: ingredient.id, newQuantity: 0, message: `${ingredient.name} eliminado (cantidad 0).` };
  }

  const unit = ingredient.order_unit || ingredient.purchase_unit || 'ud';

  const { error: upsertError } = await supabase.from('order_drafts').upsert(
    {
      user_id: userId,
      ingredient_id: ingredient.id,
      quantity: finalQty,
      unit,
    },
    { onConflict: 'user_id, ingredient_id' },
  );

  if (upsertError) throw new Error(`Error guardando borrador: ${upsertError.message}`);

  return {
    ok: true,
    productName: ingredient.name,
    ingredientId: ingredient.id,
    newQuantity: finalQty,
    message: `Borrador actualizado: ${ingredient.name} x${finalQty}.`,
  };
}

