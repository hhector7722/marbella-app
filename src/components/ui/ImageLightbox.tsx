'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ImageLightbox({
  open,
  src,
  alt,
  onClose,
  className,
}: {
  open: boolean;
  src: string | null | undefined;
  alt?: string;
  onClose: () => void;
  className?: string;
}) {
  if (!open || !src) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Imagen ampliada"
      className={cn(
        'fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm',
        'flex items-center justify-center p-4',
        className,
      )}
      onClick={onClose}
    >
      <div className="relative w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          className={cn(
            'absolute -top-2 -right-2',
            'w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 transition',
            'flex items-center justify-center text-white shrink-0 active:scale-95',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
          )}
          aria-label="Cerrar imagen"
        >
          <X className="w-6 h-6" strokeWidth={3} />
        </button>

        <div className="rounded-2xl bg-black/40 border border-white/10 shadow-2xl overflow-hidden">
          <img
            src={src}
            alt={alt || ''}
            className="w-full max-h-[85vh] object-contain bg-black"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}

