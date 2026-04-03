'use client';



import { useRouter } from 'next/navigation';

import { ArrowLeft, Monitor } from 'lucide-react';

import RadarSala from '@/components/dashboards/RadarSala';

import { SubNavVentas } from '@/components/dashboards/SubNavVentas';



/**

 * /dashboard/sala — Vista de Tiempo Real (LIVE)

 *

 * Arquitectura desacoplada:

 * - Este componente es el único dueño de <RadarSala /> y sus WebSockets.

 * - Visualmente es el "cascarón" idéntico a VentasPage pero sin selectores de fecha.

 * - La navegación a pestañas históricas delega en SubNavVentas → router.push('/dashboard/ventas?tab=X')

 */

export default function SalaPage() {

  const router = useRouter();



  return (

    <div className="min-h-screen bg-[#5B8FB9] p-4 md:p-8 pb-24 text-zinc-900">

      <div className="max-w-4xl mx-auto space-y-6">

        <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden">



          {/* CABECERA — sin selectores de fecha (contexto Live no los necesita) */}

          <div className="bg-[#36606F] p-4 md:p-5 pb-3 md:pb-4 space-y-3">

            <div className="flex items-center justify-between gap-2">

              <div className="flex items-center gap-2 md:gap-3 shrink-0">

                <button

                  onClick={() => router.back()}

                  className="flex items-center justify-center text-white bg-white/10 rounded-full border border-white/10 w-7 h-7 md:w-10 md:h-10 hover:bg-white/20 transition-all active:scale-95 shrink-0"

                >

                  <ArrowLeft className="w-3.5 h-3.5 md:w-5 md:h-5" strokeWidth={3} />

                </button>

                <h1 className="text-lg md:text-3xl font-black text-white uppercase tracking-tight italic shrink-0">

                  Sala

                </h1>

              </div>



              {/* Botón Monitor & Indicador LIVE */}

              <div className="flex items-center gap-4 md:gap-6">

                <button

                  onClick={() => router.push('/dashboard/kds')}

                  className="flex items-center gap-1.5 px-2 py-1 text-white/70 hover:text-white transition-colors active:scale-95 group shrink-0"

                >

                  <Monitor className="w-3.5 h-3.5 md:w-4 md:h-4 group-hover:scale-110 transition-transform" strokeWidth={3} />

                  <span className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.1em] pt-0.5">

                    Monitor

                  </span>

                </button>



                <div className="flex items-center gap-1.5 px-1 shrink-0">

                  <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-red-400 animate-pulse" />

                  <span className="text-white text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] leading-none pt-0.5">

                    Live

                  </span>

                </div>

              </div>

            </div>

          </div>



          {/* SUB-NAV: Tickets | LIVE (activo) | Productos | Horas */}

          {/* onTabChange no se pasa → SubNavVentas usará router.push para pestañas históricas */}

          <SubNavVentas activeTab="LIVE" />



          {/* CONTENIDO PRINCIPAL — sólo RadarSala */}

          <div className="p-4 md:p-6 bg-zinc-50/50">

            <RadarSala />

          </div>



        </div>

      </div>

    </div>

  );

}

