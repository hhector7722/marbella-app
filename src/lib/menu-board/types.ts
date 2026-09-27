export const MENU_BOARD_SLUGS = [
  'entrepans',
  'tapes',
  'plats',
  'cafeteria',
  'vermut',
  'begudes',
] as const;

export type MenuBoardSlug = (typeof MENU_BOARD_SLUGS)[number];

export type MenuBoardMode = 'ca' | 'en';

export type MenuBoardItemKind = 'product' | 'plate' | 'plate_option';

export type MenuBoardPlateSection = 'entrants' | 'principals' | 'side';

export type MenuBoardCategory = {
  id: string;
  slug: MenuBoardSlug;
  nameCa: string;
  nameEs: string;
  nameEn: string;
  position: number;
  active: boolean;
};

export type MenuBoardCatalogProduct = {
  articuloId: number;
  boardSlug: MenuBoardSlug;
  childName: string;
  nameCa: string;
  nameEs: string;
  nameEn: string;
  descriptionCa: string | null;
  descriptionEs: string | null;
  descriptionEn: string | null;
  price: number;
  secondaryPrice: number | null;
  secondaryPriceLabelCa: string | null;
  secondaryPriceLabelEs: string | null;
  secondaryPriceLabelEn: string | null;
  sortOrder: number;
  itemKind: MenuBoardItemKind;
  plateSection: MenuBoardPlateSection | null;
};

export type MenuBoardItem = {
  id: string;
  categoryId: string;
  articuloId: number | null;
  nameCa: string;
  nameEs: string;
  nameEn: string;
  descriptionCa: string | null;
  descriptionEs: string | null;
  descriptionEn: string | null;
  price: number;
  secondaryPrice: number | null;
  secondaryPriceLabelCa: string | null;
  secondaryPriceLabelEs: string | null;
  secondaryPriceLabelEn: string | null;
  sortOrder: number;
  active: boolean;
  itemKind: MenuBoardItemKind;
  plateSection: MenuBoardPlateSection | null;
};

export type MenuBoardSheet = {
  category: MenuBoardCategory;
  items: MenuBoardItem[];
};
