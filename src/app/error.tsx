'use client';

import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Home, RefreshCw } from 'lucide-react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Error boundary:', error);
  }, [error]);

  return (
    <div
      className={cn(
        'fixed inset-0 z-[9999] flex flex-col items-center justify-center',
        'min-h-screen'
      )}
    >
      {/* Tu foto exacta: public/icons/bar.png sin optimización */}
      <div className="absolute inset-0">
        <img
          src="/icons/bar.png"
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      </div>

      {/* Contenido centrado */}
      <div className="relative z-10 flex flex-col items-center justify-center gap-6 px-6 max-w-md text-center">
        <div className="rounded-2xl bg-white/95 shadow-xl border border-zinc-100 px-8 py-10 w-full">
          <p className="text-5xl font-black text-rose-500 mb-2">Error</p>
          <h1 className="text-xl font-bold text-zinc-800 mb-2">
            Algo ha fallado
          </h1>
          <p className="text-sm text-zinc-600 mb-8">
            Ha ocurrido un error inesperado. Puedes intentar de nuevo o volver al
            inicio.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={reset}
              className={cn(
                'inline-flex items-center justify-center gap-2',
                'min-h-[48px] px-6 rounded-xl shrink-0',
                'bg-zinc-700 text-white font-semibold',
                'hover:bg-zinc-600 active:scale-[0.98]',
                'transition-all duration-200'
              )}
            >
              <RefreshCw className="w-5 h-5 shrink-0" />
              Reintentar
            </button>
            <Link
              href="/"
              className={cn(
                'inline-flex items-center justify-center gap-2',
                'min-h-[48px] px-6 rounded-xl shrink-0',
                'bg-[#36606F] text-white font-semibold',
                'hover:bg-[#2d4f5c] active:scale-[0.98]',
                'transition-all duration-200'
              )}
            >
              <Home className="w-5 h-5 shrink-0" />
              Volver al inicio
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
