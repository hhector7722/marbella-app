'use client'

import { useEffect } from 'react'
import { cn } from '@/lib/utils'

export default function StaffError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Mantener en consola para debugging (no UI)
    console.error('Staff route error:', error)
  }, [error])

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className={cn('w-full max-w-lg rounded-2xl border border-zinc-100 bg-white shadow-sm p-6')}>
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-black tracking-tight text-zinc-900">Ha ocurrido un error</h2>
          <p className="text-sm font-semibold text-zinc-700">
            Si ha pasado al fichar salida, suele ser un problema de permisos (RLS) o una regla de base de datos.
          </p>

          <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs font-mono text-zinc-800 break-all">
            <div>
              <span className="font-bold">Digest:</span> {error.digest ?? '—'}
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => reset()}
              className="min-h-12 flex-1 rounded-xl bg-[#36606F] px-4 font-black text-white hover:bg-[#2A4C58] active:scale-[0.99] transition-all"
            >
              Reintentar
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-12 flex-1 rounded-xl border border-zinc-200 bg-white px-4 font-black text-zinc-900 hover:bg-zinc-50 active:scale-[0.99] transition-all"
            >
              Recargar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

