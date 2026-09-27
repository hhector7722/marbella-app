import type { MenuBoardItem, MenuBoardMode, MenuBoardPlateSection } from '@/lib/menu-board/types';

export function primaryName(item: MenuBoardItem, mode: MenuBoardMode): string {
  if (mode === 'en') return item.nameEn.trim() || item.nameCa;
  return item.nameCa;
}

export function secondaryName(item: MenuBoardItem, mode: MenuBoardMode): string {
  if (mode === 'en') return '';
  return item.nameEs.trim();
}

export function descriptionLine(item: MenuBoardItem, mode: MenuBoardMode): string {
  const value = mode === 'en' ? item.descriptionEn : item.descriptionCa;
  return value?.trim() ?? '';
}

const PLATE_SECTIONS: Record<
  MenuBoardPlateSection,
  { ca: string; es: string; en: string }
> = {
  entrants: { ca: 'ENTRANTS', es: 'Entrantes', en: 'Starters' },
  principals: { ca: 'PRINCIPALS', es: 'Principales', en: 'Mains' },
  side: { ca: 'GUARNICIÓ', es: 'Guarnición', en: 'Side' },
};

export function plateSectionLabel(section: MenuBoardPlateSection, mode: MenuBoardMode): string {
  const row = PLATE_SECTIONS[section];
  return mode === 'en' ? row.en : row.ca;
}

export function plateSectionTranslation(section: MenuBoardPlateSection): string {
  return PLATE_SECTIONS[section].es;
}

export const PLATE_SECTION_ORDER: MenuBoardPlateSection[] = ['entrants', 'principals', 'side'];
