'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { formatMenuPrice } from '@/lib/menu-board/format';
import type { MenuBoardCategory, MenuBoardItem, MenuBoardItemKind, MenuBoardMode, MenuBoardPlateSection } from '@/lib/menu-board/types';
import { deleteMenuBoardItem, reorderMenuBoardItems, saveMenuBoardItem } from '@/app/master/carta/actions';
import { MenuSheet } from './MenuSheet';
import './menu-board.css';

type Panel = 'manage' | 'preview';

type Draft = {
  id?: string;
  categoryId: string;
  nameCa: string;
  nameEs: string;
  nameEn: string;
  descriptionCa: string;
  descriptionEs: string;
  descriptionEn: string;
  price: string;
  secondaryPrice: string;
  secondaryPriceLabelCa: string;
  secondaryPriceLabelEs: string;
  secondaryPriceLabelEn: string;
  active: boolean;
  itemKind: MenuBoardItemKind;
  plateSection: MenuBoardPlateSection | null;
};

const EMPTY_DRAFT = (categoryId: string): Draft => ({
  categoryId,
  nameCa: '',
  nameEs: '',
  nameEn: '',
  descriptionCa: '',
  descriptionEs: '',
  descriptionEn: '',
  price: '',
  secondaryPrice: '',
  secondaryPriceLabelCa: '',
  secondaryPriceLabelEs: '',
  secondaryPriceLabelEn: '',
  active: true,
  itemKind: 'product',
  plateSection: null,
});

function draftFromItem(item: MenuBoardItem): Draft {
  return {
    id: item.id,
    categoryId: item.categoryId,
    nameCa: item.nameCa,
    nameEs: item.nameEs,
    nameEn: item.nameEn,
    descriptionCa: item.descriptionCa ?? '',
    descriptionEs: item.descriptionEs ?? '',
    descriptionEn: item.descriptionEn ?? '',
    price: item.price.toFixed(2).replace('.', ','),
    secondaryPrice: item.secondaryPrice == null ? '' : item.secondaryPrice.toFixed(2).replace('.', ','),
    secondaryPriceLabelCa: item.secondaryPriceLabelCa ?? '',
    secondaryPriceLabelEs: item.secondaryPriceLabelEs ?? '',
    secondaryPriceLabelEn: item.secondaryPriceLabelEn ?? '',
    active: item.active,
    itemKind: item.itemKind,
    plateSection: item.plateSection,
  };
}

export function MenuBoardClient({
  categories,
  items,
}: {
  categories: MenuBoardCategory[];
  items: MenuBoardItem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [panel, setPanel] = useState<Panel>('manage');
  const [mode, setMode] = useState<MenuBoardMode>('ca');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MenuBoardItem | null>(null);
  const [openSheetId, setOpenSheetId] = useState<string | null>(null);
  const [overflowIds, setOverflowIds] = useState<Record<string, boolean>>({});
  const [printJob, setPrintJob] = useState<{ mode: MenuBoardMode; categoryId?: string } | null>(null);

  const byCategory = useMemo(() => {
    const map = new Map<string, MenuBoardItem[]>();
    for (const category of categories) map.set(category.id, []);
    for (const item of items) map.get(item.categoryId)?.push(item);
    for (const list of map.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
    return map;
  }, [categories, items]);

  useEffect(() => {
    if (!printJob) return;
    const frame = requestAnimationFrame(() => window.print());
    const clear = () => setPrintJob(null);
    window.addEventListener('afterprint', clear);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', clear);
    };
  }, [printJob]);

  const printSheets = categories.filter((category) => !printJob?.categoryId || category.id === printJob.categoryId);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? 'No se ha podido guardar');
        return;
      }
      setDraft(null);
      setPendingDelete(null);
      router.refresh();
    });
  }

  function move(categoryId: string, index: number, direction: -1 | 1) {
    const list = byCategory.get(categoryId) ?? [];
    const next = index + direction;
    if (next < 0 || next >= list.length) return;
    const ordered = list.map((item) => item.id);
    const [moved] = ordered.splice(index, 1);
    ordered.splice(next, 0, moved);
    run(() => reorderMenuBoardItems(categoryId, ordered));
  }

  return (
    <>
      <div className="menu-board-screen space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button instance="carta-gestion" variant={panel === 'manage' ? 'primary' : 'secondary'} onClick={() => setPanel('manage')}>
            Gestión
          </Button>
          <Button instance="carta-preview" variant={panel === 'preview' ? 'primary' : 'secondary'} onClick={() => setPanel('preview')}>
            Vista previa
          </Button>
        </div>
        {error ? <p className="text-sm font-semibold text-[var(--color-negativo)]">{error}</p> : null}

        {panel === 'manage' ? (
          <div className="space-y-6">
            {categories.map((category) => {
              const list = byCategory.get(category.id) ?? [];
              return (
                <section key={category.id} className="space-y-2">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-[var(--color-texto)]">{category.nameCa}</h2>
                      <p className="text-sm text-[var(--color-texto-fuerte)]">
                        {category.nameEs} · {category.nameEn}
                      </p>
                    </div>
                    <Button
                      instance={`carta-add-${category.slug}`}
                      variant="secondary"
                      className="shrink-0"
                      onClick={() => setDraft(EMPTY_DRAFT(category.id))}
                    >
                      + Añadir producto
                    </Button>
                  </div>
                  {overflowIds[category.id] ? (
                    <p className="text-sm font-semibold text-[var(--color-negativo)]">Esta hoja excede un A4.</p>
                  ) : null}
                  {list.length === 0 ? (
                    <p className="text-sm text-[var(--color-texto-fuerte)]">Sin productos</p>
                  ) : (
                    <ul className="divide-y divide-[var(--color-borde-marcado)] border-y border-[var(--color-borde-marcado)]">
                      {list.map((item, index) => (
                        <li key={item.id} className="flex flex-wrap items-center gap-2 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-[var(--color-texto)]">{item.nameCa}</p>
                            <p className="truncate text-xs text-[var(--color-texto-fuerte)]">
                              {[item.nameEs, item.nameEn].filter(Boolean).join(' · ') || 'Sin traducción'}
                            </p>
                          </div>
                          <p className="shrink-0 text-sm font-semibold tabular-nums">{formatMenuPrice(item.price, 'ca')}</p>
                          {item.secondaryPrice != null ? (
                            <p className="shrink-0 text-sm tabular-nums">{formatMenuPrice(item.secondaryPrice, 'ca')}</p>
                          ) : null}
                          <p className="w-16 shrink-0 text-xs">{item.active ? 'activo' : 'oculto'}</p>
                          <Button instance={`carta-up-${item.id}`} variant="tertiary" aria-label="Subir" onClick={() => move(category.id, index, -1)} icon={<span aria-hidden>↑</span>} />
                          <Button instance={`carta-down-${item.id}`} variant="tertiary" aria-label="Bajar" onClick={() => move(category.id, index, 1)} icon={<span aria-hidden>↓</span>} />
                          <Button instance={`carta-edit-${item.id}`} variant="secondary" onClick={() => setDraft(draftFromItem(item))}>
                            Editar
                          </Button>
                          <Button instance={`carta-delete-${item.id}`} variant="destructive" onClick={() => setPendingDelete(item)}>
                            Eliminar
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          <Preview
            categories={categories}
            byCategory={byCategory}
            mode={mode}
            onMode={setMode}
            onOpen={setOpenSheetId}
            onOverflow={(id, overflows) => setOverflowIds((current) => ({ ...current, [id]: overflows }))}
            onPrintAll={() => setPrintJob({ mode })}
            onPrintOne={(categoryId) => setPrintJob({ mode, categoryId })}
          />
        )}
      </div>

      <div className="menu-board-print-root">
        {printJob
          ? printSheets.map((category) => (
              <MenuSheet
                key={`${printJob.mode}-${category.id}`}
                category={category}
                items={byCategory.get(category.id) ?? []}
                mode={printJob.mode}
              />
            ))
          : null}
      </div>

      <Modal open={draft != null} onClose={() => setDraft(null)} title={draft?.id ? 'Editar producto' : 'Añadir producto'} variant="work" scheme="work" layer="base">
        {draft ? (
          <ItemForm
            draft={draft}
            category={categories.find((category) => category.id === draft.categoryId)}
            pending={pending}
            onChange={setDraft}
            onClose={() => setDraft(null)}
            onSave={() =>
              run(() =>
                saveMenuBoardItem(
                  {
                    ...draft,
                    descriptionCa: draft.descriptionCa,
                    descriptionEs: draft.descriptionEs,
                    descriptionEn: draft.descriptionEn,
                    plateSection: draft.itemKind === 'plate_option' ? draft.plateSection : null,
                  },
                  draft.id,
                ),
              )
            }
          />
        ) : null}
      </Modal>

      <Modal
        open={pendingDelete != null}
        onClose={() => setPendingDelete(null)}
        title="Eliminar producto"
        variant="compact"
        scheme="work"
        layer="system"
      >
        <p className="text-sm">Se eliminará {pendingDelete?.nameCa}. Esta acción no se puede deshacer.</p>
        <div className="mt-4 flex gap-2">
          <Button instance="carta-delete-cancel" variant="secondary" onClick={() => setPendingDelete(null)}>
            Cancelar
          </Button>
          <Button
            instance="carta-delete-confirm"
            variant="destructive"
            loading={pending}
            onClick={() => pendingDelete && run(() => deleteMenuBoardItem(pendingDelete.id))}
          >
            Eliminar
          </Button>
        </div>
      </Modal>

      <Modal open={openSheetId != null} onClose={() => setOpenSheetId(null)} title="Hoja" variant="work" scheme="work" layer="base">
        <div className="overflow-auto">
          {categories
            .filter((category) => category.id === openSheetId)
            .map((category) => (
              <MenuSheet
                key={category.id}
                category={category}
                items={byCategory.get(category.id) ?? []}
                mode={mode}
                expanded
              />
            ))}
        </div>
      </Modal>
    </>
  );
}

function Preview({
  categories,
  byCategory,
  mode,
  onMode,
  onOpen,
  onOverflow,
  onPrintAll,
  onPrintOne,
}: {
  categories: MenuBoardCategory[];
  byCategory: Map<string, MenuBoardItem[]>;
  mode: MenuBoardMode;
  onMode: (mode: MenuBoardMode) => void;
  onOpen: (id: string) => void;
  onOverflow: (id: string, overflows: boolean) => void;
  onPrintAll: () => void;
  onPrintOne: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button instance="carta-mode-ca" variant={mode === 'ca' ? 'primary' : 'secondary'} onClick={() => onMode('ca')}>
          Català / Español
        </Button>
        <Button instance="carta-mode-en" variant={mode === 'en' ? 'primary' : 'secondary'} onClick={() => onMode('en')}>
          English
        </Button>
        <Button instance="carta-print-all" variant="primary" onClick={onPrintAll}>
          Imprimir 6 hojas
        </Button>
      </div>
      <div className="overflow-x-auto pb-4">
        <div className="menu-vitrine-slot">
          <div className="menu-vitrine menu-vitrine-scale">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                className="block min-h-12 text-left"
                onClick={() => onOpen(category.id)}
              >
                <MenuSheet
                  category={category}
                  items={byCategory.get(category.id) ?? []}
                  mode={mode}
                  onOverflow={onOverflow}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {categories.map((category) => (
          <Button
            key={category.id}
            instance={`carta-print-${category.slug}`}
            variant="secondary"
            onClick={() => onPrintOne(category.id)}
          >
            {`Imprimir ${category.nameCa}`}
          </Button>
        ))}
      </div>
    </div>
  );
}

function ItemForm({
  draft,
  category,
  pending,
  onChange,
  onClose,
  onSave,
}: {
  draft: Draft;
  category: MenuBoardCategory | undefined;
  pending: boolean;
  onChange: (draft: Draft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const field = 'min-h-12 w-full rounded-md border border-[var(--color-borde-marcado)] bg-[var(--color-superficie)] px-3 text-sm';
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <label className="block text-sm sm:col-span-2">
        Nombre catalán
        <input className={field} value={draft.nameCa} onChange={(event) => onChange({ ...draft, nameCa: event.target.value })} required />
      </label>
      <label className="block text-sm">
        Nombre español
        <input className={field} value={draft.nameEs} onChange={(event) => onChange({ ...draft, nameEs: event.target.value })} />
      </label>
      <label className="block text-sm">
        Nombre inglés
        <input className={field} value={draft.nameEn} onChange={(event) => onChange({ ...draft, nameEn: event.target.value })} />
      </label>
      <label className="block text-sm sm:col-span-2">
        Descripción catalán
        <input className={field} value={draft.descriptionCa} onChange={(event) => onChange({ ...draft, descriptionCa: event.target.value })} />
      </label>
      <label className="block text-sm">
        Descripción español
        <input className={field} value={draft.descriptionEs} onChange={(event) => onChange({ ...draft, descriptionEs: event.target.value })} />
      </label>
      <label className="block text-sm">
        Descripción inglés
        <input className={field} value={draft.descriptionEn} onChange={(event) => onChange({ ...draft, descriptionEn: event.target.value })} />
      </label>
      <label className="block text-sm">
        Precio
        <input className={field} inputMode="decimal" value={draft.price} onChange={(event) => onChange({ ...draft, price: event.target.value })} required />
      </label>
      <label className="block text-sm">
        Segundo precio
        <input className={field} inputMode="decimal" value={draft.secondaryPrice} onChange={(event) => onChange({ ...draft, secondaryPrice: event.target.value })} />
      </label>
      <label className="block text-sm">
        Etiqueta segundo precio (CA)
        <input className={field} value={draft.secondaryPriceLabelCa} onChange={(event) => onChange({ ...draft, secondaryPriceLabelCa: event.target.value })} />
      </label>
      <label className="block text-sm">
        Etiqueta segundo precio (ES)
        <input className={field} value={draft.secondaryPriceLabelEs} onChange={(event) => onChange({ ...draft, secondaryPriceLabelEs: event.target.value })} />
      </label>
      <label className="block text-sm">
        Etiqueta segundo precio (EN)
        <input className={field} value={draft.secondaryPriceLabelEn} onChange={(event) => onChange({ ...draft, secondaryPriceLabelEn: event.target.value })} />
      </label>
      {category?.slug === 'plats' ? (
        <>
          <label className="block text-sm">
            Tipo
            <select
              className={field}
              value={draft.itemKind}
              onChange={(event) =>
                onChange({
                  ...draft,
                  itemKind: event.target.value as MenuBoardItemKind,
                  plateSection: event.target.value === 'plate_option' ? draft.plateSection ?? 'entrants' : null,
                })
              }
            >
              <option value="product">Producto</option>
              <option value="plate">Plat Marbella</option>
              <option value="plate_option">Opción de Plat Marbella</option>
            </select>
          </label>
          {draft.itemKind === 'plate_option' ? (
            <label className="block text-sm">
              Sección
              <select
                className={field}
                value={draft.plateSection ?? 'entrants'}
                onChange={(event) => onChange({ ...draft, plateSection: event.target.value as MenuBoardPlateSection })}
              >
                <option value="entrants">Entrants</option>
                <option value="principals">Principals</option>
                <option value="side">Guarnició</option>
              </select>
            </label>
          ) : null}
        </>
      ) : null}
      <label className="flex min-h-12 items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" checked={draft.active} onChange={(event) => onChange({ ...draft, active: event.target.checked })} />
        Visible en la vitrina
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <Button instance="carta-save" variant="primary" type="submit" loading={pending}>
          Guardar
        </Button>
        <Button instance="carta-cancel" variant="secondary" type="button" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
