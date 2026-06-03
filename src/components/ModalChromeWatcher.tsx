'use client';

import { useEffect } from 'react';

function hasClassToken(el: Element, token: string) {
  return (el as HTMLElement).classList?.contains(token) ?? false;
}

function hasSemiTransparentBackdrop(el: Element) {
  const className = (el as HTMLElement).className;
  if (typeof className !== 'string') return false;

  return /bg-(?:black|zinc-900|gray-900|\[#36606F\])\//.test(className);
}

function looksLikeOverlay(el: Element) {
  if (!hasClassToken(el, 'fixed')) return false;
  if (!hasClassToken(el, 'inset-0')) return false;

  if (hasSemiTransparentBackdrop(el)) return true;

  for (const child of el.children) {
    const childEl = child as HTMLElement;
    if (
      childEl.classList?.contains('absolute') &&
      childEl.classList?.contains('inset-0') &&
      hasSemiTransparentBackdrop(childEl)
    ) {
      return true;
    }
  }

  return false;
}

type SavedScrollState = {
  bodyOverflow: string;
  bodyPaddingRight: string;
  bodyPosition: string;
  bodyTop: string;
  bodyWidth: string;
  htmlOverflow: string;
};

let scrollLocked = false;
let savedScrollY = 0;
let savedStyles: SavedScrollState | null = null;

function getScrollbarWidth() {
  return Math.max(0, window.innerWidth - document.documentElement.clientWidth);
}

function setBackgroundScrollLock(locked: boolean) {
  if (typeof document === 'undefined' || locked === scrollLocked) return;

  scrollLocked = locked;
  const { body, documentElement: html } = document;

  if (locked) {
    savedScrollY = window.scrollY;

    savedStyles = {
      bodyOverflow: body.style.overflow,
      bodyPaddingRight: body.style.paddingRight,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
      htmlOverflow: html.style.overflow,
    };

    const scrollbarWidth = getScrollbarWidth();

    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';

    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    body.style.position = 'fixed';
    body.style.top = `-${savedScrollY}px`;
    body.style.width = '100%';
    return;
  }

  if (!savedStyles) return;

  body.style.overflow = savedStyles.bodyOverflow;
  body.style.paddingRight = savedStyles.bodyPaddingRight;
  body.style.position = savedStyles.bodyPosition;
  body.style.top = savedStyles.bodyTop;
  body.style.width = savedStyles.bodyWidth;
  html.style.overflow = savedStyles.htmlOverflow;
  savedStyles = null;

  window.scrollTo(0, savedScrollY);
}

function computeModalOpen() {
  if (document.querySelector('[data-marbella-modal-overlay="true"]')) return true;
  if (document.querySelector('[role="dialog"]')) return true;
  if (document.querySelector('[aria-modal="true"]')) return true;

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
      setBackgroundScrollLock(open);
    };

    update();

    const obs = new MutationObserver(() => update());
    obs.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'role', 'aria-modal', 'data-marbella-modal-overlay'],
    });

    return () => {
      obs.disconnect();
      setBackgroundScrollLock(false);
    };
  }, []);

  return null;
}
