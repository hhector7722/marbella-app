'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

const MODAL_ROOT_SELECTOR = '[data-marbella-modal-root]';

type ModalLockContextValue = {
  isLocked: boolean;
};

const ModalLockContext = createContext<ModalLockContextValue>({ isLocked: false });

function isInsideModalRoot(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest(MODAL_ROOT_SELECTOR);
}

function lockBodyScroll(): () => void {
  const scrollY = window.scrollY;
  const { style } = document.body;
  const prev = {
    position: style.position,
    top: style.top,
    left: style.left,
    right: style.right,
    width: style.width,
    overflow: style.overflow,
  };

  style.position = 'fixed';
  style.top = `-${scrollY}px`;
  style.left = '0';
  style.right = '0';
  style.width = '100%';
  style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';

  return () => {
    style.position = prev.position;
    style.top = prev.top;
    style.left = prev.left;
    style.right = prev.right;
    style.width = prev.width;
    style.overflow = prev.overflow;
    document.documentElement.style.overflow = '';
    window.scrollTo(0, scrollY);
  };
}

export function ModalLockProvider({ children }: { children: ReactNode }) {
  const [isLocked, setIsLocked] = useState(false);
  const unlockBodyRef = useRef<(() => void) | null>(null);

  const syncLockState = useCallback(() => {
    const hasModal = document.querySelector(MODAL_ROOT_SELECTOR) !== null;
    setIsLocked(hasModal);

    if (hasModal && !unlockBodyRef.current) {
      unlockBodyRef.current = lockBodyScroll();
    }
    if (!hasModal && unlockBodyRef.current) {
      unlockBodyRef.current();
      unlockBodyRef.current = null;
    }
  }, []);

  useEffect(() => {
    syncLockState();

    const observer = new MutationObserver(syncLockState);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-marbella-modal-root'] });

    return () => {
      observer.disconnect();
      if (unlockBodyRef.current) {
        unlockBodyRef.current();
        unlockBodyRef.current = null;
      }
    };
  }, [syncLockState]);

  useEffect(() => {
    if (!isLocked) return;

    const blockBackgroundGesture = (event: TouchEvent) => {
      if (isInsideModalRoot(event.target)) return;
      if (event.cancelable) event.preventDefault();
    };

    const blockBackgroundTouchStart = (event: TouchEvent) => {
      if (isInsideModalRoot(event.target)) return;
      if (event.cancelable) event.preventDefault();
    };

    const blockBackgroundWheel = (event: WheelEvent) => {
      if (isInsideModalRoot(event.target)) return;
      event.preventDefault();
    };

    document.addEventListener('touchstart', blockBackgroundTouchStart, { passive: false, capture: true });
    document.addEventListener('touchmove', blockBackgroundGesture, { passive: false, capture: true });
    document.addEventListener('wheel', blockBackgroundWheel, { passive: false, capture: true });

    return () => {
      document.removeEventListener('touchstart', blockBackgroundTouchStart, { capture: true });
      document.removeEventListener('touchmove', blockBackgroundGesture, { capture: true });
      document.removeEventListener('wheel', blockBackgroundWheel, { capture: true });
    };
  }, [isLocked]);

  return (
    <ModalLockContext.Provider value={{ isLocked }}>{children}</ModalLockContext.Provider>
  );
}

export function useModalLockState(): ModalLockContextValue {
  return useContext(ModalLockContext);
}

/** Atributo para el contenedor `fixed inset-0` del modal. */
export const MODAL_ROOT_DATA_ATTR = 'data-marbella-modal-root';
