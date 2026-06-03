'use client';

import { useEffect, useState } from 'react';

const MODAL_SELECTOR =
  '[data-marbella-modal-overlay="true"], [role="dialog"], [aria-modal="true"]';

function computeModalOpen() {
  if (typeof document === 'undefined') return false;
  return document.querySelector(MODAL_SELECTOR) !== null;
}

function isInsideScrollableModal(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return target.closest('[role="dialog"], .overscroll-contain') !== null;
}

export default function ModalChromeWatcher() {
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const root = document.documentElement;

    const update = () => {
      const open = computeModalOpen();
      setModalOpen((prev) => (prev === open ? prev : open));
      if (open) root.dataset.modalOpen = 'true';
      else delete root.dataset.modalOpen;
    };

    update();

    const obs = new MutationObserver(update);
    obs.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['role', 'aria-modal', 'data-marbella-modal-overlay'],
    });

    return () => {
      obs.disconnect();
      delete root.dataset.modalOpen;
      setModalOpen(false);
    };
  }, []);

  useEffect(() => {
    if (!modalOpen) return;

    const onTouchMove = (e: TouchEvent) => {
      if (isInsideScrollableModal(e.target)) return;
      e.preventDefault();
    };

    document.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => document.removeEventListener('touchmove', onTouchMove);
  }, [modalOpen]);

  return null;
}
