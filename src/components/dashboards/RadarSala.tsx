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
    <div className={`p-2 md:p-3 rounded-xl border flex flex-col ${estado.color} shadow-sm transition-all duration-200 h-fit`}>
      {/* Cabecera en una sola fila */}
      <div
        className="flex justify-between items-center cursor-pointer select-none gap-2"
        onClick={() => setAbierto(!abierto)}
      >
        <span className="text-[11px] md:text-sm font-black text-slate-900 whitespace-nowrap tracking-tight">
          M {m.mesa}
        </span>

        <div className="flex items-center gap-1.5 md:gap-2 flex-1 justify-end">
          <span className="text-[11px] md:text-sm font-bold text-slate-800 flex items-center tabular-nums tracking-tight">
            {parseFloat(m.total_provisional).toFixed(2)} <Euro size={10} className="ml-0.5 text-slate-500" />
          </span>
          <span className={`text-[9px] md:text-[10px] font-bold flex items-center shrink-0 ${estado.texto}`}>
            <Clock size={10} className="mr-0.5" /> {estado.hora}
          </span>
          <div className="text-slate-400">
            {abierto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>
      </div>

      {/* Cuerpo Desplegable (Ticket en vivo) */}
      {abierto && (
        <div className="mt-2 pt-2 border-t border-slate-200/60 bg-white -mx-2 md:-mx-3 -mb-2 md:-mb-3 px-2 md:px-3 pb-2 md:pb-3 rounded-b-xl shadow-[inner_0_1px_2px_rgba(0,0,0,0.05)]">
          <ul className="space-y-1.5 text-[10px] md:text-xs font-medium text-slate-600">
            {m.productos && m.productos.length > 0 ? (
              m.productos.map((p: any, i: number) => (
                <li key={i} className="flex justify-between items-start leading-tight">
                  <span className="flex-1 pr-2 flex items-start">
                    <span className="font-bold text-slate-900 mr-1.5 shrink-0">{p.unidades}x</span>
                    <span className="break-words flex-1">{p.nombre}</span>
                  </span>
                  <span className="tabular-nums font-semibold shrink-0 pt-0.5 text-slate-700">
                    {(p.unidades * p.precio).toFixed(2)} €
                  </span>
                </li>
              ))
            ) : (
              <li className="text-slate-400 italic">Sin artículos...</li>
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
    const fecha = new Date(fechaApertura);
    const minutos = Math.floor((new Date().getTime() - fecha.getTime()) / 60000);
    const hora = fecha.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (minutos > 45) return { 
      color: 'bg-red-50 border-red-100', 
      texto: 'text-red-600', 
      min: minutos, hora 
    };
    if (minutos > 30) return { 
      color: 'bg-yellow-50 border-yellow-100', 
      texto: 'text-yellow-600', 
      min: minutos, hora 
    };
    return { 
      color: 'bg-[#36606F]/10 border-[#36606F]/20', 
      texto: 'text-[#36606F]', 
      min: minutos, hora 
    };
  };

  const mesasOrdenadas = [...mesas].sort((a, b) => new Date(a.fecha_apertura).getTime() - new Date(b.fecha_apertura).getTime());

  return (
    <div className="font-sans bg-white rounded-xl border border-zinc-100 shadow-sm overflow-hidden">
      <header className="bg-[#36606F] p-3 md:p-4">
        <div>
          <h2 className="text-lg md:text-xl font-bold tracking-tight text-white">Mesas Abiertas</h2>
          <p className="text-[10px] md:text-xs text-slate-300 mt-0.5">
            {mesas.length} mesas activas • {ultimaAct ? ultimaAct.toLocaleTimeString() : '...'}
          </p>
        </div>
      </header>

      {/* Grid: 2 columnas en móvil (grid-cols-2), 3 en tablet y PC (md:grid-cols-3) */}
      <div className="p-3 md:p-6 lg:p-8 grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-4 xl:gap-8">
        {mesasOrdenadas.map((m) => (
          <TarjetaMesa key={m.id_ticket} m={m} estado={calcularEstado(m.fecha_apertura)} />
        ))}
      </div>
    </div>
  );
}