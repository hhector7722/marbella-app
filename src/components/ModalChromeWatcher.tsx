'use client';

import { useEffect } from 'react';

function hasClassToken(el: Element, token: string) {
  // classList.contains es O(1) y más fiable que substring
  return (el as HTMLElement).classList?.contains(token) ?? false;
}

function looksLikeOverlay(el: Element) {
  // Heurística deliberadamente simple y alineada a este repo:
  // overlays suelen ser `fixed inset-0 ... bg-black/... ...` y a veces `backdrop-blur-*`.
  if (!hasClassToken(el, 'fixed')) return false;
  if (!hasClassToken(el, 'inset-0')) return false;

  const className = (el as HTMLElement).className;
  if (typeof className !== 'string') return false;

  // `bg-black/..` o `bg-zinc-900/..` (TimeFilterModal usa zinc)
  if (className.includes('bg-black/')) return true;
  if (className.includes('bg-zinc-900/')) return true;

  return false;
}

function computeModalOpen() {
  // 1) selector explícito (para el futuro, si queremos marcar overlays)
  if (document.querySelector('[data-marbella-modal-overlay="true"]')) return true;

  // 2) Radix / semánticos (si aparecen)
  if (document.querySelector('[role="dialog"][aria-modal="true"]')) return true;

  // 3) Heurística repo: overlays "fixed inset-0 bg-black/.."
  const candidates = document.querySelectorAll('div.fixed.inset-0');
  for (const el of candidates) {
    if (looksLikeOverlay(el)) return true;
  }

  return false;
}

export default function ModalChromeWatcher() {
  useEffect(() => {
    const root = document.documentElement;

    const update = () => {
      const open = computeModalOpen();
      if (open) root.dataset.modalOpen = 'true';
      else delete root.dataset.modalOpen;
    };

    update();

    const obs = new MutationObserver(() => update());
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'role', 'aria-modal', 'data-marbella-modal-overlay'] });

    return () => obs.disconnect();
  }, []);

  return null;
}

