'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { formatMenuPrice } from '@/lib/menu-board/format';
import type { MenuBoardCatalogProduct, MenuBoardCategory, MenuBoardItem, MenuBoardMode } from '@/lib/menu-board/types';
import { deleteMenuBoardItem, reorderMenuBoardItems, saveMenuBoardItem } from '@/app/master/carta/actions';
import { MenuSheet } from './MenuSheet';
import './menu-board.css';

type Panel = 'manage' | 'preview';

type Draft = {
  id?: string;
  categoryId: string;
  articuloId: number | null;
  active: boolean;
};

const EMPTY_DRAFT = (categoryId: string): Draft => ({
  categoryId,
  articuloId: null,
  active: true,
});

function draftFromItem(item: MenuBoardItem): Draft {
  return {
    id: item.id,
    categoryId: item.categoryId,
    articuloId: item.articuloId,
    active: item.active,
  };
}

export function MenuBoardClient({
  categories,
  items,
  catalog,
  catalogError,
}: {
  categories: MenuBoardCategory[];
  items: MenuBoardItem[];
  catalog: MenuBoardCatalogProduct[];
  catalogError: string | null;
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
        {catalogError ? <p className="text-sm font-semibold text-[var(--color-negativo)]">{catalogError}</p> : null}
        {error ? <p className="text-sm font-semibold text-[var(--color-negativo)]">{error}</p> : null}

        {panel === 'manage' ? (
          <div className="space-y-6">
            {categories.map((category) => {
              const list = byCategory.get(category.id) ?? [];
              return (
                <section key={category.id} className="space-y-2">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">{category.nameCa}</h2>
                      <p className="menu-board-muted text-sm">
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
                    <p className="menu-board-muted text-sm">Sin productos</p>
                  ) : (
                    <ul className="menu-board-list">
                      {list.map((item, index) => (
                        <li key={item.id} className="flex flex-wrap items-center gap-2 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{item.nameCa}</p>
                            <p className="menu-board-muted truncate text-xs">
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
            placedIds={new Set(items.flatMap((item) => (item.articuloId == null ? [] : [item.articuloId])))}
            placedNames={items.filter((item) => item.categoryId === draft.categoryId && item.id !== draft.id).map((item) => item.nameCa)}
            catalog={catalog.filter((product) => product.boardSlug === categories.find((category) => category.id === draft.categoryId)?.slug)}
            current={items.find((item) => item.id === draft.id) ?? null}
            pending={pending}
            onChange={setDraft}
            onClose={() => setDraft(null)}
            onSave={() => {
              if (draft.articuloId == null) {
                setError('Elige un producto de la carta');
                return;
              }
              run(() =>
                saveMenuBoardItem(
                  { categoryId: draft.categoryId, articuloId: draft.articuloId, active: draft.active },
                  draft.id,
                ),
              );
            }}
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
  catalog,
  placedIds,
  placedNames,
  current,
  pending,
  onChange,
  onClose,
  onSave,
}: {
  draft: Draft;
  catalog: MenuBoardCatalogProduct[];
  placedIds: Set<number>;
  placedNames: string[];
  current: MenuBoardItem | null;
  pending: boolean;
  onChange: (draft: Draft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const field =
    'min-h-12 w-full rounded-md border border-[var(--color-borde-marcado)] bg-[var(--color-superficie)] px-3 text-sm text-[var(--color-texto)]';
  const takenNames = new Set(placedNames);
  const available = catalog.filter((product) => {
    if (product.articuloId === draft.articuloId) return true;
    if (placedIds.has(product.articuloId) || takenNames.has(product.nameCa)) return false;
    return true;
  });
  const selected = catalog.find((product) => product.articuloId === draft.articuloId) ?? null;
  const groups = new Map<string, MenuBoardCatalogProduct[]>();
  for (const product of available) {
    const list = groups.get(product.childName) ?? [];
    list.push(product);
    groups.set(product.childName, list);
  }
  const shown = selected ?? current;
  return (
    <form
      className="grid gap-3 text-[var(--color-texto)]"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <label className="block text-sm">
        Producto de la carta
        <select
          className={field}
          value={draft.articuloId ?? ''}
          required
          disabled={draft.id != null && draft.articuloId != null}
          onChange={(event) => onChange({ ...draft, articuloId: event.target.value ? Number(event.target.value) : null })}
        >
          <option value="">Elige un producto</option>
          {[...groups.entries()].map(([name, products]) => (
            <optgroup key={name} label={name}>
              {products.map((product) => (
                <option key={product.articuloId} value={product.articuloId}>
                  {`${product.nameCa} — ${formatMenuPrice(product.price, 'ca')}`}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      {shown && (draft.articuloId != null || draft.id) ? (
        <div className="space-y-1 text-sm">
          <p className="font-semibold">{shown.nameCa}</p>
          {shown.nameEs ? <p className="menu-board-muted">{shown.nameEs}</p> : null}
          {shown.nameEn ? <p className="menu-board-muted">{shown.nameEn}</p> : null}
          <p className="tabular-nums">
            {formatMenuPrice(shown.price, 'ca')}
            {shown.secondaryPrice != null ? ` · ${formatMenuPrice(shown.secondaryPrice, 'ca')}` : ''}
          </p>
          <p className="menu-board-muted">El precio sale de la carta virtual. No se edita aquí.</p>
        </div>
      ) : (
        <p className="menu-board-muted text-sm">Elige un producto; el precio se rellena solo.</p>
      )}
      {draft.id == null && available.length === 0 ? (
        <p className="text-sm text-[var(--color-negativo)]">No quedan productos de esta hoja en la carta virtual.</p>
      ) : null}
      <label className="flex min-h-12 items-center gap-2 text-sm">
        <input type="checkbox" checked={draft.active} onChange={(event) => onChange({ ...draft, active: event.target.checked })} />
        Visible en la vitrina
      </label>
      <div className="flex gap-2">
        <Button instance="carta-save" variant="primary" type="submit" loading={pending} disabled={draft.id == null && draft.articuloId == null}>
          Guardar
        </Button>
        <Button instance="carta-cancel" variant="secondary" type="button" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
