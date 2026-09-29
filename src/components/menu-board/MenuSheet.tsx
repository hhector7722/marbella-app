'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatMenuAmount, formatMenuPrice } from '@/lib/menu-board/format';
import type { MenuBoardCategory, MenuBoardItem, MenuBoardMode } from '@/lib/menu-board/types';
import {
  PLATE_SECTION_ORDER,
  descriptionLine,
  plateSectionLabel,
  plateSectionTranslation,
  primaryName,
  secondaryName,
} from './sheet-copy';

type MenuSheetProps = {
  category: MenuBoardCategory;
  items: MenuBoardItem[];
  mode: MenuBoardMode;
  expanded?: boolean;
  onOverflow?: (categoryId: string, overflows: boolean) => void;
};

function visibleItems(items: MenuBoardItem[]): MenuBoardItem[] {
  return items
    .filter((item) => item.active)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.nameCa.localeCompare(b.nameCa, 'ca'));
}

export function MenuSheet({ category, items, mode, expanded = false, onOverflow }: MenuSheetProps) {
  const frameRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const active = useMemo(() => visibleItems(items), [items]);
  const title = mode === 'en' ? category.nameEn : category.nameCa;
  const subtitle = mode === 'en' ? null : category.nameEs;

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const head = headRef.current;
    const content = contentRef.current;
    if (!frame || !head || !content || !onOverflow) return;
    const style = getComputedStyle(frame);
    const pad = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
    const a4Content = frame.clientWidth * (297 / 210) - pad;
    const used = head.offsetHeight + content.scrollHeight;
    const next = used > a4Content + 1;
    setOverflows((current) => (current === next ? current : next));
    onOverflow(category.id, next);
  }, [category.id, active, mode, onOverflow, title, subtitle, expanded]);

  return (
    <article
      ref={frameRef}
      className={expanded ? 'menu-sheet is-expanded' : 'menu-sheet'}
      data-overflow={overflows ? 'true' : 'false'}
      data-sheet={category.slug}
      data-mode={mode}
      lang={mode === 'en' ? 'en' : 'ca'}
    >
      <header ref={headRef}>
        <h2 className="menu-sheet-title">{title}</h2>
        {subtitle ? <p className="menu-sheet-subtitle">{subtitle}</p> : null}
        <div className="menu-sheet-rule" />
        {overflows ? <p className="menu-sheet-warning">Esta hoja excede un A4</p> : null}
      </header>
      <div ref={contentRef} className="menu-sheet-body">
        {category.slug === 'entrepans' ? (
          <SandwichSheet items={active} mode={mode} />
        ) : category.slug === 'plats' ? (
          <PlatsSheet items={active} mode={mode} />
        ) : (
          <StandardSheet items={active} mode={mode} />
        )}
      </div>
    </article>
  );
}

function StandardSheet({ items, mode }: { items: MenuBoardItem[]; mode: MenuBoardMode }) {
  return (
    <>
      {items.map((item) => (
        <ProductRow key={item.id} item={item} mode={mode} />
      ))}
    </>
  );
}

function ProductRow({ item, mode }: { item: MenuBoardItem; mode: MenuBoardMode }) {
  const translation = secondaryName(item, mode);
  const description = descriptionLine(item, mode);
  return (
    <div className="menu-row">
      <div>
        <p className="menu-name">{primaryName(item, mode)}</p>
        {translation ? <p className="menu-translation">{translation}</p> : null}
        {description ? <p className="menu-description">{description}</p> : null}
      </div>
      <p className="menu-price">{formatMenuPrice(item.price, mode)}</p>
    </div>
  );
}

function secondaryLabel(item: MenuBoardItem, mode: MenuBoardMode): string {
  const value = mode === 'en' ? item.secondaryPriceLabelEn : item.secondaryPriceLabelCa;
  return value?.trim() ?? '';
}

function SandwichSheet({ items, mode }: { items: MenuBoardItem[]; mode: MenuBoardMode }) {
  const whole = mode === 'en' ? 'Whole' : 'SENCER';
  const half = mode === 'en' ? 'Half' : 'MIG';
  return (
    <>
      <div className="menu-dual-head">
        <span />
        <div>
          <p>{whole}</p>
          {mode === 'ca' ? <p className="is-secondary">Entero</p> : null}
        </div>
        <div>
          <p>{half}</p>
          {mode === 'ca' ? <p className="is-secondary">Medio</p> : null}
        </div>
      </div>
      {items.map((item) => {
        const translation = secondaryName(item, mode);
        return (
          <div key={item.id} className="menu-dual-row">
            <div>
              <p className="menu-name">{primaryName(item, mode)}</p>
              {translation ? <p className="menu-translation">{translation}</p> : null}
            </div>
            <p className="menu-price">{formatMenuAmount(item.price, mode)}</p>
            <p className="menu-price">
              {item.secondaryPrice == null ? '—' : formatMenuAmount(item.secondaryPrice, mode)}
              {item.secondaryPrice != null && secondaryLabel(item, mode) ? (
                <span className="menu-translation">{secondaryLabel(item, mode)}</span>
              ) : null}
            </p>
          </div>
        );
      })}
    </>
  );
}

function PlatsSheet({ items, mode }: { items: MenuBoardItem[]; mode: MenuBoardMode }) {
  const regular = items.filter((item) => item.itemKind === 'product');
  const plate = items.find((item) => item.itemKind === 'plate');
  const options = items.filter((item) => item.itemKind === 'plate_option');
  return (
    <>
      <StandardSheet items={regular} mode={mode} />
      {plate ? (
        <div className="menu-plate">
          <ProductRow item={plate} mode={mode} />
          <p className="menu-plate-lead">
            {mode === 'en' ? 'Choose one option from each section' : 'Tria una opció de cada secció'}
          </p>
          {mode === 'ca' ? <p className="menu-plate-lead">Escoge una opción de cada sección</p> : null}
          {PLATE_SECTION_ORDER.map((section) => {
            const sectionItems = options.filter((item) => item.plateSection === section);
            if (sectionItems.length === 0) return null;
            return (
              <section key={section}>
                <h3 className="menu-plate-section">{plateSectionLabel(section, mode)}</h3>
                {mode === 'ca' ? (
                  <p className="menu-translation">{plateSectionTranslation(section)}</p>
                ) : null}
                {sectionItems.map((item) => (
                  <p key={item.id} className="menu-plate-option">
                    {primaryName(item, mode)}
                    {secondaryName(item, mode) ? <span>{secondaryName(item, mode)}</span> : null}
                  </p>
                ))}
              </section>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
