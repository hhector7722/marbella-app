'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { MENU_BOARD_CATALOG_COLUMNS, mapCatalog, type DigitalMenuSource } from '@/lib/menu-board/catalog';
import { menuBoardPlaceSchema } from '@/lib/menu-board/schema';
import type { MenuBoardCatalogProduct } from '@/lib/menu-board/types';

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

function snapshot(product: MenuBoardCatalogProduct, active: boolean, sortOrder?: number) {
  return {
    articulo_id: product.articuloId,
    name_ca: product.nameCa,
    name_es: product.nameEs,
    name_en: product.nameEn,
    description_ca: product.descriptionCa,
    description_es: product.descriptionEs,
    description_en: product.descriptionEn,
    price: product.price,
    secondary_price: product.secondaryPrice,
    secondary_price_label_ca: product.secondaryPriceLabelCa,
    secondary_price_label_es: product.secondaryPriceLabelEs,
    secondary_price_label_en: product.secondaryPriceLabelEn,
    active,
    item_kind: product.itemKind,
    plate_section: product.plateSection,
    ...(sortOrder == null ? {} : { sort_order: sortOrder }),
  };
}

async function loadCatalog(supabase: NonNullable<Awaited<ReturnType<typeof requireMaster>>['supabase']>) {
  const { data, error } = await supabase.from('v_digital_menu_items').select(MENU_BOARD_CATALOG_COLUMNS);
  if (error) return { catalog: null, error: error.message };
  return { catalog: mapCatalog((data ?? []) as DigitalMenuSource[]), error: null };
}

export async function saveMenuBoardItem(raw: unknown, itemId?: string): Promise<ActionResult> {
  const gate = await requireMaster();
  if (!gate.supabase) return { ok: false, error: gate.error ?? 'Acceso denegado' };

  const parsed = menuBoardPlaceSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const loaded = await loadCatalog(gate.supabase);
  if (!loaded.catalog) return { ok: false, error: loaded.error ?? 'No se ha podido leer la carta virtual' };

  const product = loaded.catalog.find((row) => row.articuloId === parsed.data.articuloId);
  if (!product) {
    return { ok: false, error: 'Ese producto no está en la carta virtual' };
  }

  const { data: category, error: categoryError } = await gate.supabase
    .from('menu_board_categories')
    .select('slug')
    .eq('id', parsed.data.categoryId)
    .maybeSingle();
  if (categoryError) return { ok: false, error: categoryError.message };
  if (!category || (category as { slug: string }).slug !== product.boardSlug) {
    return { ok: false, error: 'Ese producto no pertenece a esta hoja' };
  }

  if (itemId) {
    const { error } = await gate.supabase
      .from('menu_board_items')
      .update(snapshot(product, parsed.data.active))
      .eq('id', itemId)
      .eq('category_id', parsed.data.categoryId);
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
    const { error } = await gate.supabase.from('menu_board_items').insert({
      ...snapshot(product, parsed.data.active, nextOrder),
      category_id: parsed.data.categoryId,
    });
    if (error) {
      if (error.message.toLowerCase().includes('articulo_id')) {
        return { ok: false, error: 'Falta aplicar la migración de la vitrina (articulo_id).' };
      }
      if (error.message.toLowerCase().includes('duplicate') || error.message.toLowerCase().includes('unique')) {
        return { ok: false, error: 'Ese producto ya está en la vitrina' };
      }
      return { ok: false, error: error.message };
    }
  }

  revalidatePath('/master/carta');
  return { ok: true };
}

/** Inserta en la vitrina los productos de la carta virtual que aún no están. */
export async function seedMenuBoardFromVirtualMenu(): Promise<ActionResult> {
  const gate = await requireMaster();
  if (!gate.supabase) return { ok: false, error: gate.error ?? 'Acceso denegado' };

  const [{ data: categories, error: categoriesError }, { data: existing, error: existingError }, loaded] =
    await Promise.all([
      gate.supabase.from('menu_board_categories').select('id, slug'),
      gate.supabase.from('menu_board_items').select('id, articulo_id, category_id, name_ca, sort_order'),
      loadCatalog(gate.supabase),
    ]);
  if (categoriesError) return { ok: false, error: categoriesError.message };
  if (existingError) return { ok: false, error: existingError.message };
  if (!loaded.catalog) return { ok: false, error: loaded.error ?? 'No se ha podido leer la carta virtual' };

  const categoryId = new Map(
    (categories ?? []).map((row) => [(row as { slug: string }).slug, (row as { id: string }).id]),
  );
  const takenArticles = new Set(
    (existing ?? [])
      .map((row) => (row as { articulo_id: number | null }).articulo_id)
      .filter((id): id is number => id != null),
  );
  const takenNames = new Set(
    (existing ?? []).map((row) => {
      const r = row as { category_id: string; name_ca: string };
      return `${r.category_id}::${r.name_ca.trim().toLowerCase()}`;
    }),
  );
  const orderByCategory = new Map<string, number>();
  for (const row of existing ?? []) {
    const r = row as { category_id: string; sort_order: number };
    orderByCategory.set(r.category_id, Math.max(orderByCategory.get(r.category_id) ?? 0, r.sort_order));
  }

  const rows = loaded.catalog.flatMap((product) => {
    const id = categoryId.get(product.boardSlug);
    if (!id) return [];
    if (takenArticles.has(product.articuloId)) return [];
    if (takenNames.has(`${id}::${product.nameCa.trim().toLowerCase()}`)) return [];
    const next = (orderByCategory.get(id) ?? 0) + 1;
    orderByCategory.set(id, next);
    takenArticles.add(product.articuloId);
    takenNames.add(`${id}::${product.nameCa.trim().toLowerCase()}`);
    return [{ ...snapshot(product, true, next), category_id: id }];
  });
  if (rows.length === 0) {
    return { ok: true };
  }

  const inserted = await gate.supabase.from('menu_board_items').insert(rows);
  if (inserted.error) {
    if (inserted.error.message.toLowerCase().includes('articulo_id')) {
      return {
        ok: false,
        error: 'Falta aplicar la migración de la vitrina (articulo_id). Sin ella no se pueden cargar productos de la carta.',
      };
    }
    return { ok: false, error: inserted.error.message };
  }
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
