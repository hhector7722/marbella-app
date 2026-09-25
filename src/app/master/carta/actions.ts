'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { parseEuroInput } from '@/lib/menu-board/format';
import { menuBoardItemInputSchema, type MenuBoardItemInput } from '@/lib/menu-board/schema';

type ActionResult = { ok: true } | { ok: false; error: string };

async function requireMaster() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isMasterDashboardUser(user.email)) {
    return { supabase: null, error: 'Acceso denegado' as const };
  }
  return { supabase, error: null };
}

function moneyOrNull(raw: string): number | null {
  return parseEuroInput(raw);
}

function toRow(input: MenuBoardItemInput, sortOrder?: number) {
  const price = moneyOrNull(input.price);
  if (price == null) return { error: 'Precio no válido' as const, row: null };
  const secondary = moneyOrNull(input.secondaryPrice);
  if (input.secondaryPrice.trim() !== '' && secondary == null) {
    return { error: 'Segundo precio no válido' as const, row: null };
  }
  return {
    error: null,
    row: {
      category_id: input.categoryId,
      name_ca: input.nameCa,
      name_es: input.nameEs,
      name_en: input.nameEn,
      description_ca: input.descriptionCa,
      description_es: input.descriptionEs,
      description_en: input.descriptionEn,
      price,
      secondary_price: secondary,
      secondary_price_label_ca: input.secondaryPriceLabelCa,
      secondary_price_label_es: input.secondaryPriceLabelEs,
      secondary_price_label_en: input.secondaryPriceLabelEn,
      active: input.active,
      item_kind: input.itemKind === 'plate_option' ? 'plate_option' : input.itemKind,
      plate_section: input.itemKind === 'plate_option' ? input.plateSection : null,
      ...(sortOrder == null ? {} : { sort_order: sortOrder }),
    },
  };
}

export async function saveMenuBoardItem(raw: unknown, itemId?: string): Promise<ActionResult> {
  const gate = await requireMaster();
  if (!gate.supabase) return { ok: false, error: gate.error ?? 'Acceso denegado' };

  const parsed = menuBoardItemInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  if (itemId) {
    const mapped = toRow(parsed.data);
    if (!mapped.row) return { ok: false, error: mapped.error ?? 'Datos no válidos' };
    const { error } = await gate.supabase.from('menu_board_items').update(mapped.row).eq('id', itemId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data: last, error: lastError } = await gate.supabase
      .from('menu_board_items')
      .select('sort_order')
      .eq('category_id', parsed.data.categoryId)
      .order('sort_order', { ascending: false })
      .limit(1);
    if (lastError) return { ok: false, error: lastError.message };
    const nextOrder = ((last?.[0] as { sort_order: number } | undefined)?.sort_order ?? 0) + 1;
    const mapped = toRow(parsed.data, nextOrder);
    if (!mapped.row) return { ok: false, error: mapped.error ?? 'Datos no válidos' };
    const { error } = await gate.supabase.from('menu_board_items').insert(mapped.row);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath('/master/carta');
  return { ok: true };
}

export async function deleteMenuBoardItem(itemId: string): Promise<ActionResult> {
  const gate = await requireMaster();
  if (!gate.supabase) return { ok: false, error: gate.error ?? 'Acceso denegado' };
  const { error } = await gate.supabase.from('menu_board_items').delete().eq('id', itemId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/master/carta');
  return { ok: true };
}

export async function reorderMenuBoardItems(categoryId: string, orderedIds: string[]): Promise<ActionResult> {
  const gate = await requireMaster();
  if (!gate.supabase) return { ok: false, error: gate.error ?? 'Acceso denegado' };
  if (orderedIds.length === 0) return { ok: true };

  const { data, error } = await gate.supabase
    .from('menu_board_items')
    .select('id')
    .eq('category_id', categoryId);
  if (error) return { ok: false, error: error.message };

  const existing = new Set((data ?? []).map((row) => (row as { id: string }).id));
  if (orderedIds.length !== existing.size || orderedIds.some((id) => !existing.has(id))) {
    return { ok: false, error: 'El orden no coincide con los productos de la categoría' };
  }

  for (let index = 0; index < orderedIds.length; index += 1) {
    const { error: updateError } = await gate.supabase
      .from('menu_board_items')
      .update({ sort_order: index + 1 })
      .eq('id', orderedIds[index])
      .eq('category_id', categoryId);
    if (updateError) return { ok: false, error: updateError.message };
  }

  revalidatePath('/master/carta');
  return { ok: true };
}
