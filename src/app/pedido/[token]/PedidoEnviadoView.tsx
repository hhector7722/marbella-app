import Image from 'next/image'
import { CheckCircle2 } from 'lucide-react'

import { buildWhatsAppUrl, resolvePedidoContactWhatsAppPhone } from '@/lib/client-pedido-link'
import { cn } from '@/lib/utils'

/** Pantalla informativa tras envío one-shot (sin carta ni botones de edición). */
export function PedidoEnviadoView({
  contactWhatsAppPhone = null,
}: {
  /** Teléfono del contacto (perfil Héctor). Si falta, se resuelve con fallback. */
  contactWhatsAppPhone?: string | null
}) {
  const phone = resolvePedidoContactWhatsAppPhone(contactWhatsAppPhone)
  const waUrl = buildWhatsAppUrl(
    phone,
    'Hola, soy el cliente del pedido. Necesito ayuda o realizar un cambio. ¡Gracias!'
  )

  return (
    <main className="flex min-h-[100dvh] flex-col bg-white text-zinc-900">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 pb-safe pt-safe">
        <div className="flex flex-col items-center">
          <Image
            src="/icons/logo-white.png"
            alt="Bar La Marbella"
            width={240}
            height={64}
            className="h-12 w-auto max-w-[200px] object-contain"
            priority
          />
        </div>

        <section className="mt-8 rounded-xl border border-zinc-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col items-center text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle2 className="h-9 w-9 text-emerald-600" strokeWidth={2.25} />
            </span>
            <h1 className="mt-4 text-xl font-black tracking-tight text-zinc-900">Pedido enviado</h1>
            <p className="mt-3 text-[15px] font-bold leading-relaxed text-zinc-700">
              Hemos recibido vuestro pedido correctamente.
            </p>
            <p className="mt-2 text-[15px] font-black text-zinc-900">Muchas gracias.</p>
            <p className="mt-4 text-[14px] font-semibold leading-relaxed text-zinc-600">
              Si necesitáis realizar cualquier cambio, podéis contactar con nosotros directamente
              por WhatsApp o por teléfono y estaremos encantados de ayudaros.
            </p>
          </div>

          {waUrl ? (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'mt-6 flex w-full min-h-14 items-center justify-center gap-2 rounded-xl',
                'bg-emerald-500 text-[13px] font-black uppercase tracking-wider text-white',
                'active:opacity-90 hover:bg-emerald-600'
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/whatsapp.png" alt="" className="h-5 w-5 object-contain" />
              Contactar por WhatsApp
            </a>
          ) : null}
        </section>
      </div>
    </main>
  )
}
