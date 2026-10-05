'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronRight, Search, X } from 'lucide-react';
import Image from 'next/image';
import { sendUsageEvent } from '@/lib/usage/client';
import { searchFunctions, type SearchIdentity, type SearchResult } from '@/lib/global-search/catalog';
import { navigateInsideSandbox } from '@/lib/sandbox/client';

const GROUP_LABELS: Record<SearchResult['type'], string> = {
  function: 'Funciones',
  ingredient: 'Ingredientes',
  recipe: 'Recetas',
  supplier: 'Proveedores',
  employee: 'Plantilla',
  invoice: 'Albaranes',
};
export function GlobalSearch({
  identity,
  onOpenChange,
}: {
  identity: SearchIdentity;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestSerial = useRef(0);
  const [open, setOpenState] = useState(false);
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<{ query: string; results: SearchResult[]; failed: boolean } | null>(null);
  const [showWaiting, setShowWaiting] = useState(false);

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  }, [onOpenChange]);

  const trimmed = query.trim();
  const local = useMemo(() => searchFunctions(query, identity), [query, identity]);
  const remoteCurrent = remote?.query === trimmed ? remote : null;
  const waiting = open && trimmed.length >= 2 && !remoteCurrent;
  const results = useMemo(() => [...local, ...(remoteCurrent?.results ?? [])]
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'es'))
    .slice(0, 10), [local, remoteCurrent]);
  const groups = Array.from(new Set(results.map((row) => row.type)));

  const closeExplicitly = useCallback(() => {
    setOpen(false);
    setQuery('');
    setRemote(null);
    setShowWaiting(false);
    inputRef.current?.blur();
  }, [setOpen]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      closeExplicitly();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, closeExplicitly]);

  useEffect(() => {
    if (!open || trimmed.length < 2) return;
    const serial = ++requestSerial.current;
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      void sendUsageEvent({
        eventType: 'action',
        path: pathname,
        label: 'Búsqueda global ejecutada',
        metadata: { action: 'global_search', resultType: 'query' },
      });
      try {
        const response = await fetch('/api/global-search?q=' + encodeURIComponent(trimmed), { signal: controller.signal });
        if (!response.ok) throw new Error('search unavailable');
        const payload = (await response.json()) as { results: SearchResult[] };
        if (active && serial === requestSerial.current) {
          setRemote({ query: trimmed, results: payload.results, failed: false });
          setShowWaiting(false);
        }
      } catch {
        if (active && !controller.signal.aborted && serial === requestSerial.current) {
          setRemote({ query: trimmed, results: [], failed: true });
          setShowWaiting(false);
        }
      }
    }, 180);
    const skeletonTimer = window.setTimeout(() => setShowWaiting(true), 380);
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
      window.clearTimeout(skeletonTimer);
    };
  }, [open, trimmed, pathname]);

  function openResult(result: SearchResult) {
    void sendUsageEvent({
      eventType: 'action',
      path: pathname,
      label: 'Resultado de búsqueda abierto',
      metadata: { action: 'global_search_result', resultType: result.type },
    });

    if (
      result.type === 'function'
      && result.href.split('?')[0] === pathname
      && (result.id === 'closing' || result.id === 'team' || result.id === 'orders')
    ) {
      closeExplicitly();
      window.setTimeout(() => window.dispatchEvent(new Event(
        result.id === 'closing'
          ? 'marbella:open-closing'
          : result.id === 'orders'
            ? 'marbella:open-orders'
            : 'marbella:open-plantilla'
      )), 0);
      return;
    }

    closeExplicitly();
    if (!navigateInsideSandbox(result.href)) router.push(result.href);
  }

  const showPanel = Boolean(open && trimmed.length > 0);

  return (
    <div
      ref={rootRef}
      data-component="GlobalSearch"
      data-open={open ? 'true' : undefined}
      className="relative flex min-h-12 min-w-0 flex-1 items-center px-1"
    >
      <div className="relative w-full min-w-0">
      <div
        data-element="pill"
        className={
          showPanel
            ? "relative z-[131] flex h-[18px] min-w-0 w-full items-center gap-1 rounded-t-[10px] rounded-b-none border border-b-0 px-1.5 text-white/60"
            : "flex h-[18px] min-w-0 w-full items-center gap-1 rounded-full border px-1.5 text-white/60"
        }
      >
        <Search aria-hidden size={8} strokeWidth={1.8} className="shrink-0" />
        <div className="flex h-full min-w-0 flex-1 items-center overflow-hidden">
          <input
            ref={inputRef}
            value={query}
            onFocus={() => {
              if (!open) {
                setOpen(true);
                void sendUsageEvent({
                  eventType: 'action',
                  path: pathname,
                  label: 'Búsqueda global abierta',
                  metadata: { action: 'global_search', resultType: 'open' },
                });
              }
            }}
            onChange={(event) => {
              setQuery(event.target.value);
              setShowWaiting(false);
              if (!open) setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                closeExplicitly();
                return;
              }
              if (event.key === 'Enter' && !event.nativeEvent.isComposing && results[0]) {
                event.preventDefault();
                openResult(results[0]);
              }
            }}
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            aria-label="Buscar funciones y datos"
            placeholder="Buscar…"
            className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-white/80 outline-none placeholder:text-white/45"
            style={{
              fontSize: '16px',
              lineHeight: 1,
              transform: 'scale(0.56)',
              transformOrigin: 'left center',
              width: '179%',
            }}
          />
        </div>
        {open ? (
          <button
            type="button"
            aria-label="Cerrar búsqueda"
            onClick={closeExplicitly}
            className="grid size-[14px] shrink-0 place-items-center text-white/55 active:opacity-70"
          >
            <X aria-hidden size={9} strokeWidth={2} />
          </button>
        ) : null}
      </div>

      {showPanel ? (
        <div
          data-element="results"
          className="absolute left-0 right-0 top-full z-[130] max-h-[min(55dvh,360px)] overflow-x-hidden overflow-y-auto overscroll-contain rounded-b-2xl rounded-t-none border border-t-0 border-white/15 bg-[#102b4f]/95 p-2 pt-1 shadow-[0_18px_48px_rgba(0,0,0,0.32)] backdrop-blur-xl"
        >
          {results.length === 0 && !waiting && !remoteCurrent?.failed ? (
            <p className="px-2 py-4 text-center text-[11px] text-white/50">Sin resultados.</p>
          ) : null}

          {groups.map((group) => (
            <section key={group} className="first:mt-0 mt-2">
              <h3 className="px-2 pb-1 text-[10px] font-semibold text-white/45">{GROUP_LABELS[group]}</h3>
              <div className="divide-y divide-white/10">
                {results.filter((row) => row.type === group).map((result) => (
                  <button
                    key={result.type + ':' + result.id}
                    type="button"
                    onClick={() => openResult(result)}
                    className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-white/5 active:bg-white/10"
                  >
                    {result.icon ? (
                      <Image src={result.icon} alt="" width={22} height={22} className="size-[22px] shrink-0 object-contain" />
                    ) : (
                      <Search aria-hidden size={12} className="shrink-0 text-white/45" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium text-white">{result.title}</span>
                      <span className="block truncate text-[10px] text-white/50">{result.subtitle}</span>
                    </span>
                    <ChevronRight aria-hidden size={13} className="shrink-0 text-white/40" />
                  </button>
                ))}
              </div>
            </section>
          ))}

          {waiting && showWaiting ? (
            <div aria-label="Buscando datos" className="space-y-1.5 p-1">
              <div className="h-10 animate-pulse rounded-lg bg-white/5" />
              <div className="h-10 animate-pulse rounded-lg bg-white/5" />
            </div>
          ) : null}

          {remoteCurrent?.failed ? (
            <p className="px-2 py-3 text-[10px] text-white/50">No se pueden consultar datos en este momento.</p>
          ) : null}
        </div>
      ) : null}
      </div>
    </div>
  );
}
