"use client";

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Clock, Euro, ChevronDown, ChevronUp } from 'lucide-react';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Subcomponente aislado optimizado para alta densidad en móvil (2 columnas)
function TarjetaMesa({ m, estado }: { m: any, estado: any }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className={`p-2.5 md:p-4 rounded-xl border flex flex-col ${estado.color} shadow-md transition-all duration-200`}>
      {/* Tiempo en esquina superior derecha */}
      <div className="flex justify-end mb-1">
        <span className={`text-[9px] md:text-[11px] font-bold flex items-center ${estado.texto}`}>
          <Clock size={10} className="mr-1" /> {estado.min} min
        </span>
      </div>

      {/* Cabecera (Botón de despliegue) */}
      <div
        className="flex justify-between items-center cursor-pointer select-none"
        onClick={() => setAbierto(!abierto)}
      >
        <span className="text-sm md:text-lg font-black text-slate-100 whitespace-nowrap tracking-tight">
          M {m.mesa}
        </span>

        <div className="flex items-center gap-1.5 md:gap-3 ml-2">
          <span className="text-sm md:text-lg font-bold text-white flex items-center tabular-nums tracking-tight">
            {parseFloat(m.total_provisional).toFixed(2)} <Euro size={12} className="ml-0.5 md:ml-1 text-slate-400" />
          </span>
          <div className="text-slate-400 hover:text-white transition-colors">
            {abierto ? <ChevronUp size={18} className="md:w-5 md:h-5" /> : <ChevronDown size={18} className="md:w-5 md:h-5" />}
          </div>
        </div>
      </div>

      {/* Cuerpo Desplegable (Ticket en vivo) */}
      {abierto && (
        <div className="mt-2.5 md:mt-4 pt-2.5 md:pt-4 border-t border-slate-700/50">
          <ul className="space-y-1.5 md:space-y-2 text-[10px] md:text-xs font-medium text-slate-300">
            {m.productos && m.productos.length > 0 ? (
              m.productos.map((p: any, i: number) => (
                <li key={i} className="flex justify-between items-start leading-tight">
                  <span className="flex-1 pr-2 flex items-start">
                    <span className="font-bold text-white mr-1.5 shrink-0">{p.unidades}x</span>
                    <span className="break-words flex-1">{p.nombre}</span>
                  </span>
                  <span className="tabular-nums font-semibold shrink-0 pt-0.5">
                    {(p.unidades * p.precio).toFixed(2)} €
                  </span>
                </li>
              ))
            ) : (
              <li className="text-slate-500 italic">Sin artículos...</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function RadarSala() {
  const [mesas, setMesas] = useState<any[]>([]);
  const [ultimaAct, setUltimaAct] = useState<Date | null>(null);

  useEffect(() => {
    const fetchInicial = async () => {
      const { data, error } = await supabase.from('estado_sala').select('*').eq('id', 1).single();
      if (!error && data) {
        setMesas(data.radiografia_completa || []);
        setUltimaAct(new Date(data.ultima_actualizacion));
      }
    };
    fetchInicial();

    const canal = supabase.channel('radar-sala')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'estado_sala' }, (payload) => {
        setMesas(payload.new.radiografia_completa || []);
        setUltimaAct(new Date(payload.new.ultima_actualizacion));
      })
      .subscribe();

    return () => { supabase.removeChannel(canal); };
  }, []);

  const calcularEstado = (fechaApertura: string) => {
    const minutos = Math.floor((new Date().getTime() - new Date(fechaApertura).getTime()) / 60000);
    if (minutos > 45) return { color: 'bg-red-950/60 border-red-500/80', texto: 'text-red-400', min: minutos };
    if (minutos > 30) return { color: 'bg-yellow-950/60 border-yellow-500/80', texto: 'text-yellow-400', min: minutos };
    return { color: 'bg-emerald-950/40 border-emerald-500/50', texto: 'text-emerald-400', min: minutos };
  };

  const mesasOrdenadas = [...mesas].sort((a, b) => new Date(a.fecha_apertura).getTime() - new Date(b.fecha_apertura).getTime());

  return (
    <div className="p-4 md:p-6 font-sans bg-slate-900 rounded-xl border border-slate-800">
      <header className="mb-4 md:mb-6 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-slate-100">Mesas Abiertas</h2>
          <p className="text-[10px] md:text-xs text-slate-400 mt-1">
            {mesas.length} mesas activas • Motor de sincronización: {ultimaAct ? ultimaAct.toLocaleTimeString() : '...'}
          </p>
        </div>
      </header>

      {/* Grid: 2 columnas en móvil (grid-cols-2), 3 en tablet y PC (md:grid-cols-3) */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-4 xl:gap-6">
        {mesasOrdenadas.map((m) => (
          <TarjetaMesa key={m.id_ticket} m={m} estado={calcularEstado(m.fecha_apertura)} />
        ))}
      </div>
    </div>
  );
}