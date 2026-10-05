'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronRight, Search } from 'lucide-react';
import Image from 'next/image';
import { Modal } from '@/components/ui/modal';
import { SearchField } from '@/components/ui/SearchField';
import { sendUsageEvent } from '@/lib/usage/client';
import { searchFunctions, type SearchIdentity, type SearchResult } from '@/lib/global-search/catalog';
import { navigateInsideSandbox } from '@/lib/sandbox/client';

const GROUP_LABELS: Record<SearchResult['type'], string> = {
  function: 'Funciones', ingredient: 'Ingredientes', recipe: 'Recetas', supplier: 'Proveedores',
  employee: 'Plantilla', invoice: 'Albaranes',
};

export function GlobalSearch({ identity }: { identity: SearchIdentity }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<{ query: string; results: SearchResult[]; failed: boolean } | null>(null);
  const [invoiceRemote, setInvoiceRemote] = useState<{ query: string; results: SearchResult[]; failed: boolean } | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceRequestedFor, setInvoiceRequestedFor] = useState<string | null>(null);
  const [showWaiting, setShowWaiting] = useState(false);
  const requestSerial = useRef(0);
  const invoiceRequestSerial = useRef(0);
  const returnTo = useRef<string | null>(null);
  const leftOrigin = useRef(false);
  const local = useMemo(() => searchFunctions(query, identity), [query, identity]);
  const trimmed = query.trim();
  const remoteCurrent = remote?.query === trimmed ? remote : null;
  const invoiceCurrent = invoiceRemote?.query === trimmed ? invoiceRemote : null;
  const waiting = open && trimmed.length >= 2 && !remoteCurrent;
  const results = useMemo(() => [...local, ...(remoteCurrent?.results ?? [])]
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'es')).slice(0, 10), [local, remoteCurrent]);
  const invoiceResults = invoiceCurrent?.results ?? [];
  const invoiceRelated = trimmed.length >= 2 && Boolean(
    local.some((row) => row.id === 'invoices')
    || remoteCurrent?.results.some((row) => row.type === 'ingredient' || row.type === 'supplier')
    || (remoteCurrent && remoteCurrent.results.length === 0 && local.length === 0)
  );

  useEffect(() => {
    if (!returnTo.current) return;
    if (pathname !== returnTo.current.split('?')[0]) leftOrigin.current = true;
    else if (leftOrigin.current) { returnTo.current = null; leftOrigin.current = false; setOpen(true); }
  }, [pathname]);
  useEffect(() => {
    const restoreOnBack = () => {
      if (!returnTo.current || !leftOrigin.current || `${window.location.pathname}${window.location.search}` !== returnTo.current) return;
      returnTo.current = null; leftOrigin.current = false; setOpen(true);
    };
    window.addEventListener('popstate', restoreOnBack);
    return () => window.removeEventListener('popstate', restoreOnBack);
  }, []);
  useEffect(() => {
    if (!open || trimmed.length < 2) return;
    const serial = ++requestSerial.current;
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      void sendUsageEvent({ eventType: 'action', path: pathname, label: 'Búsqueda global ejecutada', metadata: { action: 'global_search', resultType: 'query' } });
      try {
        const response = await fetch(`/api/global-search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal });
        if (!response.ok) throw new Error('search unavailable');
        const payload = (await response.json()) as { results: SearchResult[] };
        if (active && serial === requestSerial.current) { setRemote({ query: trimmed, results: payload.results, failed: false }); setShowWaiting(false); }
      } catch {
        if (active && !controller.signal.aborted && serial === requestSerial.current) { setRemote({ query: trimmed, results: [], failed: true }); setShowWaiting(false); }
      }
    }, 180);
    const skeletonTimer = window.setTimeout(() => setShowWaiting(true), 380);
    return () => { active = false; controller.abort(); window.clearTimeout(timer); window.clearTimeout(skeletonTimer); };
  }, [open, trimmed, pathname]);

  function closeExplicitly() {
    returnTo.current = null; leftOrigin.current = false; setOpen(false); setQuery(''); setRemote(null);
    invoiceRequestSerial.current += 1; setInvoiceRemote(null); setInvoiceLoading(false); setInvoiceRequestedFor(null); setShowWaiting(false);
  }
  async function searchInvoices() {
    if (trimmed.length < 2 || invoiceLoading) return;
    const requestedQuery = trimmed;
    const serial = ++invoiceRequestSerial.current;
    setInvoiceRequestedFor(requestedQuery); setInvoiceLoading(true); setInvoiceRemote(null);
    void sendUsageEvent({ eventType: 'action', path: pathname, label: 'Búsqueda en albaranes solicitada', metadata: { action: 'global_search', resultType: 'invoice' } });
    try {
      const response = await fetch(`/api/global-search?q=${encodeURIComponent(requestedQuery)}&scope=invoices`);
      if (!response.ok) throw new Error('invoice search unavailable');
      const payload = (await response.json()) as { results: SearchResult[] };
      if (serial === invoiceRequestSerial.current) setInvoiceRemote({ query: requestedQuery, results: payload.results, failed: false });
    } catch {
      if (serial === invoiceRequestSerial.current) setInvoiceRemote({ query: requestedQuery, results: [], failed: true });
    } finally {
      if (serial === invoiceRequestSerial.current) setInvoiceLoading(false);
    }
  }
  function openResult(result: SearchResult) {
    void sendUsageEvent({ eventType: 'action', path: pathname, label: 'Resultado de búsqueda abierto', metadata: { action: 'global_search_result', resultType: result.type } });
    if (result.type === 'function' && result.href.split('?')[0] === pathname && ['closing', 'team', 'orders'].includes(result.id)) {
      setOpen(false); setQuery('');
      window.setTimeout(() => window.dispatchEvent(new Event(result.id === 'closing' ? 'marbella:open-closing' : result.id === 'orders' ? 'marbella:open-orders' : 'marbella:open-plantilla')), 0);
      return;
    }
    returnTo.current = `${window.location.pathname}${window.location.search}`;
    leftOrigin.current = true; setOpen(false);
    if (!navigateInsideSandbox(result.href)) router.push(result.href);
  }
  const groups = Array.from(new Set(results.map((row) => row.type)));

  return <>
    <button type="button" data-component="GlobalSearchTrigger" aria-label="Abrir búsqueda global" onClick={() => setOpen(true)} className="relative flex min-h-12 min-w-0 flex-[1_1_0%] items-center px-0 text-left">
      <span data-element="pill" className="flex min-w-0 w-full items-center gap-2 rounded-full border px-2 text-white/60"><Search aria-hidden size={14} className="shrink-0" /><span className="truncate text-xs">Buscar…</span></span>
    </button>
    <Modal open={open} onClose={closeExplicitly} title="Buscar" variant="work" scheme="dark" hideHeaderDivider instance="global-search" usageId="global-search" usageLabel="Búsqueda global">
      <div className="min-w-0" onKeyDown={(event) => { if (event.key === 'Enter' && event.target instanceof HTMLInputElement && !event.nativeEvent.isComposing && results[0]) openResult(results[0]); }}>
        <SearchField instance="global-search-input" value={query} onChange={(value) => {
          setQuery(value); invoiceRequestSerial.current += 1; setInvoiceRemote(null); setInvoiceLoading(false);
          setInvoiceRequestedFor(null); setShowWaiting(false);
        }} placeholder="Buscar…" ariaLabel="Buscar funciones y datos" autoFocus />
        {trimmed.length === 0 ? <p className="py-8 text-center text-xs text-white/50">Busca una función o un dato.</p> : results.length === 0 && !waiting && !remoteCurrent?.failed ? <p className="py-8 text-center text-xs text-white/50">Sin resultados.</p> : null}
        {groups.map((group) => <section key={group} className="mt-3"><h3 className="px-1 pb-1 text-xs font-semibold text-white/50">{GROUP_LABELS[group]}</h3><div className="divide-y divide-white/10">
          {results.filter((row) => row.type === group).map((result) => <button key={`${result.type}:${result.id}`} type="button" onClick={() => openResult(result)} className="flex min-h-12 w-full items-center gap-3 py-1 text-left hover:bg-white/5">
            {result.icon ? <Image src={result.icon} alt="" width={24} height={24} className="size-6 shrink-0 object-contain" /> : <Search aria-hidden size={14} className="shrink-0 text-white/45" />}
            <span className="min-w-0 flex-1"><span className="block truncate text-sm text-white">{result.title}</span><span className="block truncate text-xs text-white/50">{result.subtitle}</span></span><ChevronRight aria-hidden size={16} className="shrink-0 text-white/45" />
          </button>)}</div></section>)}
        {invoiceRequestedFor === trimmed && invoiceResults.length > 0 ? <section className="mt-3 border-t border-white/10 pt-3">
          <h3 className="px-1 pb-1 text-xs font-semibold text-white/50">Albaranes</h3><div className="divide-y divide-white/10">
            {invoiceResults.map((result) => <button key={`invoice:${result.id}`} type="button" onClick={() => openResult(result)} className="flex min-h-12 w-full items-center gap-3 py-1 text-left hover:bg-white/5">
              {result.icon ? <Image src={result.icon} alt="" width={24} height={24} className="size-6 shrink-0 object-contain" /> : null}
              <span className="min-w-0 flex-1"><span className="block truncate text-sm text-white">{result.title}</span><span className="block truncate text-xs text-white/50">{result.subtitle}</span></span><ChevronRight aria-hidden size={16} className="shrink-0 text-white/45" />
            </button>)}
          </div>
        </section> : null}
        {invoiceRelated && invoiceRequestedFor !== trimmed ? <button type="button" onClick={() => void searchInvoices()} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 border-t border-white/10 pt-3 text-sm font-semibold text-white/70 hover:text-white active:opacity-70"><Search aria-hidden size={14} />Buscar en albaranes</button> : null}
        {invoiceRequestedFor === trimmed && invoiceLoading ? <p className="mt-3 border-t border-white/10 py-3 text-center text-xs text-white/50">Buscando en albaranes…</p> : null}
        {invoiceRequestedFor === trimmed && invoiceCurrent && invoiceResults.length === 0 && !invoiceCurrent.failed ? <p className="mt-3 border-t border-white/10 py-3 text-center text-xs text-white/50">No hay coincidencias en albaranes.</p> : null}
        {invoiceRequestedFor === trimmed && invoiceCurrent?.failed ? <p className="mt-3 border-t border-white/10 py-3 text-center text-xs text-white/50">No se pudieron consultar los albaranes.</p> : null}
        {waiting && showWaiting ? <div aria-label="Buscando datos" className="mt-3 space-y-2"><div className="h-12 animate-pulse rounded-ds-control bg-white/5" /><div className="h-12 animate-pulse rounded-ds-control bg-white/5" /></div> : null}
        {remoteCurrent?.failed ? <p className="py-3 text-xs text-white/50">No se pueden consultar datos en este momento.</p> : null}
      </div>
    </Modal>
  </>;
}
