import type {
  MenuBoardCategory,
  MenuBoardItem,
  MenuBoardItemKind,
  MenuBoardPlateSection,
  MenuBoardSlug,
} from './types';
import { MENU_BOARD_SLUGS } from './types';

type CategoryRow = {
  id: string;
  slug: string;
  name_ca: string;
  name_es: string;
  name_en: string;
  position: number;
  active: boolean;
};

type ItemRow = {
  id: string;
  category_id: string;
  name_ca: string;
  name_es: string;
  name_en: string;
  description_ca: string | null;
  description_es: string | null;
  description_en: string | null;
  price: number | string;
  secondary_price: number | string | null;
  secondary_price_label_ca: string | null;
  secondary_price_label_es: string | null;
  secondary_price_label_en: string | null;
  sort_order: number;
  active: boolean;
  item_kind: string;
  plate_section: string | null;
};

function asSlug(value: string): MenuBoardSlug {
  if ((MENU_BOARD_SLUGS as readonly string[]).includes(value)) return value as MenuBoardSlug;
  throw new Error(`Categoría de vitrina desconocida: ${value}`);
}

function asKind(value: string): MenuBoardItemKind {
  if (value === 'product' || value === 'plate' || value === 'plate_option') return value;
  throw new Error(`Tipo de producto de vitrina desconocido: ${value}`);
}

function asSection(value: string | null): MenuBoardPlateSection | null {
  if (value == null) return null;
  if (value === 'entrants' || value === 'principals' || value === 'side') return value;
  throw new Error(`Sección de Plat Marbella desconocida: ${value}`);
}

function asMoney(value: number | string): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) throw new Error('Precio de vitrina ilegible');
  return n;
}

export function mapCategory(row: CategoryRow): MenuBoardCategory {
  return {
    id: row.id,
    slug: asSlug(row.slug),
    nameCa: row.name_ca,
    nameEs: row.name_es,
    nameEn: row.name_en,
    position: row.position,
    active: row.active,
  };
}

export function mapItem(row: ItemRow): MenuBoardItem {
  return {
    id: row.id,
    categoryId: row.category_id,
    nameCa: row.name_ca,
    nameEs: row.name_es,
    nameEn: row.name_en,
    descriptionCa: row.description_ca,
    descriptionEs: row.description_es,
    descriptionEn: row.description_en,
    price: asMoney(row.price),
    secondaryPrice: row.secondary_price == null ? null : asMoney(row.secondary_price),
    secondaryPriceLabelCa: row.secondary_price_label_ca,
    secondaryPriceLabelEs: row.secondary_price_label_es,
    secondaryPriceLabelEn: row.secondary_price_label_en,
    sortOrder: row.sort_order,
    active: row.active,
    itemKind: asKind(row.item_kind),
    plateSection: asSection(row.plate_section),
  };
}
