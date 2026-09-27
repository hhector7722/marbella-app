import type {
  MenuBoardCatalogProduct,
  MenuBoardCategory,
  MenuBoardItem,
  MenuBoardItemKind,
  MenuBoardPlateSection,
  MenuBoardSlug,
} from './types';

export const MENU_BOARD_CATALOG_COLUMNS =
  'articulo_id, articulo_nombre, carta_nombre, carta_nombre_ca, carta_nombre_es, carta_nombre_en, descripcion, precio, override_precio_medio, carta_dual_racion_enabled, carta_racion_medio_ca, carta_racion_medio_es, carta_racion_medio_en, category_parent_name, category_child_slug, category_child_name, sort_order, plato_marbella_slot, plato_marbella_is_menu_price';

export type DigitalMenuSource = {
  articulo_id: number | null;
  articulo_nombre: string | null;
  carta_nombre: string | null;
  carta_nombre_ca: string | null;
  carta_nombre_es: string | null;
  carta_nombre_en: string | null;
  descripcion: string | null;
  precio: number | string | null;
  override_precio_medio: number | string | null;
  carta_dual_racion_enabled: boolean | null;
  carta_racion_medio_ca: string | null;
  carta_racion_medio_es: string | null;
  carta_racion_medio_en: string | null;
  category_parent_name: string | null;
  category_child_slug: string | null;
  category_child_name: string | null;
  sort_order: number | null;
  plato_marbella_slot: string | null;
  plato_marbella_is_menu_price: boolean | null;
};

function clean(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function money(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** Hoja fija de la vitrina a partir de la categoría de la carta virtual. */
export function boardSlugForCatalog(row: Pick<DigitalMenuSource, 'category_parent_name' | 'category_child_slug'>): MenuBoardSlug | null {
  const child = clean(row.category_child_slug).toLowerCase();
  if (child === 'bebidas-aperitivos' || child === 'bebidas-vinos' || child === 'bebidas-cervezas') {
    return 'vermut';
  }
  const parent = clean(row.category_parent_name).toLowerCase();
  if (parent === 'tapas') return 'tapes';
  if (parent === 'bocadillos') return 'entrepans';
  if (parent === 'platos') return 'plats';
  if (parent === 'cafetería' || parent === 'cafeteria') return 'cafeteria';
  if (parent === 'bebidas' || parent === 'snacks') return 'begudes';
  return null;
}

function plateSectionFor(slot: string | null): MenuBoardPlateSection | null {
  if (slot === 'entrante') return 'entrants';
  if (slot === 'principal') return 'principals';
  if (slot === 'guarnicion') return 'side';
  return null;
}

function kindFor(
  row: DigitalMenuSource,
  slug: MenuBoardSlug,
  plateTaken: boolean,
): { itemKind: MenuBoardItemKind; plateSection: MenuBoardPlateSection | null; takesPlate: boolean } {
  if (slug !== 'plats') return { itemKind: 'product', plateSection: null, takesPlate: false };
  if (row.plato_marbella_is_menu_price && !plateTaken) {
    return { itemKind: 'plate', plateSection: null, takesPlate: true };
  }
  const section = plateSectionFor(clean(row.plato_marbella_slot) || null);
  if (section && !row.plato_marbella_is_menu_price) {
    return { itemKind: 'plate_option', plateSection: section, takesPlate: false };
  }
  return { itemKind: 'product', plateSection: null, takesPlate: false };
}

export function mapCatalog(rows: DigitalMenuSource[]): MenuBoardCatalogProduct[] {
  const drafted = rows.flatMap((row) => {
    const articuloId = row.articulo_id;
    const boardSlug = boardSlugForCatalog(row);
    const price = money(row.precio);
    const nameCa = clean(row.carta_nombre_ca) || clean(row.carta_nombre) || clean(row.articulo_nombre) || clean(row.carta_nombre_es);
    if (articuloId == null || boardSlug == null || price == null || !nameCa) return [];
    const dual = row.carta_dual_racion_enabled === true;
    const secondary = dual ? money(row.override_precio_medio) : null;
    const description = clean(row.descripcion) || null;
    return [
      {
        articuloId,
        boardSlug,
        childName: clean(row.category_child_name) || clean(row.category_parent_name) || 'Carta',
        nameCa,
        nameEs: clean(row.carta_nombre_es) || clean(row.carta_nombre) || clean(row.articulo_nombre),
        nameEn: clean(row.carta_nombre_en),
        descriptionCa: description,
        descriptionEs: description,
        descriptionEn: description,
        price,
        secondaryPrice: secondary,
        secondaryPriceLabelCa: secondary ? clean(row.carta_racion_medio_ca) || null : null,
        secondaryPriceLabelEs: secondary ? clean(row.carta_racion_medio_es) || null : null,
        secondaryPriceLabelEn: secondary ? clean(row.carta_racion_medio_en) || null : null,
        sortOrder: row.sort_order ?? 0,
        isMenuPrice: row.plato_marbella_is_menu_price === true,
        slot: clean(row.plato_marbella_slot) || null,
        source: row,
      },
    ];
  });

  drafted.sort((a, b) => a.sortOrder - b.sortOrder || a.articuloId - b.articuloId);

  let plateTaken = false;
  return drafted.map((row) => {
    const kind = kindFor(row.source, row.boardSlug, plateTaken);
    if (kind.takesPlate) plateTaken = true;
    return {
      articuloId: row.articuloId,
      boardSlug: row.boardSlug,
      childName: row.childName,
      nameCa: row.nameCa,
      nameEs: row.nameEs,
      nameEn: row.nameEn,
      descriptionCa: row.descriptionCa,
      descriptionEs: row.descriptionEs,
      descriptionEn: row.descriptionEn,
      price: row.price,
      secondaryPrice: row.secondaryPrice,
      secondaryPriceLabelCa: row.secondaryPriceLabelCa,
      secondaryPriceLabelEs: row.secondaryPriceLabelEs,
      secondaryPriceLabelEn: row.secondaryPriceLabelEn,
      sortOrder: row.sortOrder,
      itemKind: kind.itemKind,
      plateSection: kind.plateSection,
    };
  });
}

export function applyLiveCatalog(
  items: MenuBoardItem[],
  categories: MenuBoardCategory[],
  catalog: MenuBoardCatalogProduct[],
): MenuBoardItem[] {
  const byArticle = new Map(catalog.map((product) => [product.articuloId, product]));
  const slugByCategory = new Map(categories.map((category) => [category.id, category.slug]));
  return items.map((item) => {
    if (item.articuloId == null) return item;
    const product = byArticle.get(item.articuloId);
    if (!product) return item;
    const onPlats = slugByCategory.get(item.categoryId) === 'plats';
    return {
      ...item,
      nameCa: product.nameCa,
      nameEs: product.nameEs,
      nameEn: product.nameEn,
      descriptionCa: product.descriptionCa,
      descriptionEs: product.descriptionEs,
      descriptionEn: product.descriptionEn,
      price: product.price,
      secondaryPrice: product.secondaryPrice,
      secondaryPriceLabelCa: product.secondaryPriceLabelCa,
      secondaryPriceLabelEs: product.secondaryPriceLabelEs,
      secondaryPriceLabelEn: product.secondaryPriceLabelEn,
      itemKind: onPlats ? product.itemKind : 'product',
      plateSection: onPlats ? product.plateSection : null,
    };
  });
}
