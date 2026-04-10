"use client";

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Clock, Euro } from 'lucide-react';
import { parseTPVDate, parseDBDate, formatLocalTime } from '@/utils/date-utils';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function TarjetaMesa({ m, estado }: { m: any, estado: any }) {
  const productosValidos = m.productos?.filter((p: any) => parseFloat(p.unidades) > 0) || [];

  // ✨ AQUÍ ESTÁ LA MAGIA: Calculamos el total sumando (unidades * precio)
  const totalCalculado = productosValidos.reduce((suma: number, p: any) => {
    return suma + (parseFloat(p.unidades) * parseFloat(p.precio || 0));
  }, 0);

  return (
    <div className={`p-2 md:p-3 rounded-xl flex flex-col transition-all duration-300 h-fit ${estado.color} shadow-md`}>
      <div className="flex justify-between items-center select-none gap-2">
        <span className="text-[11px] md:text-sm font-black text-white whitespace-nowrap tracking-tight">
          M {m.mesa}
        </span>

        <div className="flex items-center gap-1.5 md:gap-2 flex-1 justify-end">
          {/* ✨ Y AQUÍ PINTAMOS EL TOTAL CALCULADO */}
          <span className="text-[11px] md:text-sm font-bold text-white flex items-center tabular-nums tracking-tight">
            {totalCalculado.toFixed(2)} <Euro size={10} className="ml-0.5 text-white/80" />
          </span>
          <span className="text-[9px] md:text-[10px] font-bold flex items-center shrink-0 text-white/90">
            <Clock size={10} className="mr-0.5" /> {estado.hora}
          </span>
        </div>
      </div>

      <div className="mt-2 pt-2 bg-white -mx-2 md:-mx-3 -mb-2 md:-mb-3 px-2 md:px-3 pb-2 md:pb-3 rounded-b-xl shadow-[inner_0_1px_4px_rgba(0,0,0,0.06)]">
        <ul className="space-y-1.5 text-[10px] md:text-xs font-medium text-slate-600">
          {productosValidos.length > 0 ? (
            productosValidos.map((p: any, i: number) => (
              <li key={i} className="flex justify-between items-start leading-tight">
                <span className="flex-1 pr-2 flex items-start">
                  <span className="font-bold text-slate-900 mr-1.5 shrink-0">{p.unidades}x</span>
                  <span className="break-words flex-1">{p.nombre}</span>
                </span>
                <span className="tabular-nums font-semibold shrink-0 pt-0.5 text-slate-700">
                  {(parseFloat(p.unidades) * parseFloat(p.precio || 0)).toFixed(2)} €
                </span>
              </li>
            ))
          ) : (
            <li className="text-slate-400 italic">Mesa vacía...</li>
          )}
        </ul>
      </div>
    </div>
  );
}

export default function RadarSala() {
  const [mesas, setMesas] = useState<any[]>([]);
  const [ultimaAct, setUltimaAct] = useState<Date | null>(null);

  useEffect(() => {
    const processData = (rawMesas: any[]) => {
      // Deduplicar mesas: si hay varios tickets para la misma mesa, nos quedamos con el más reciente
      const mesaMap = new Map();
      
      const distinctMesas = (rawMesas || []).map(m => {
        // Normalizamos el número de mesa para evitar duplicados por formato (99 vs "99 ")
        const mesaKey = String(m.mesa || '').trim();
        if (!mesaKey) return null;

        // Filtrar mesas que no tienen productos con unidades > 0
        const hasProducts = m.productos?.some((p: any) => parseFloat(p.unidades) > 0);
        if (!hasProducts) return null;

        return { ...m, mesaKey };
      }).filter(Boolean);

      distinctMesas.forEach(m => {
        const existing = mesaMap.get(m.mesaKey);
        const currentTS = parseTPVDate(m.timestamp_tpv).getTime();
        
        // Si no existe o el actual es más reciente, sobreescribimos
        if (!existing || currentTS > parseTPVDate(existing.timestamp_tpv).getTime()) {
          mesaMap.set(m.mesaKey, m);
        }
      });
      
      const finalMesas = Array.from(mesaMap.values());
      console.log(`[RadarSala] Data sync: ${rawMesas?.length || 0} raw entries -> ${finalMesas.length} unique tables.`);
      return finalMesas;
    };

    const fetchInicial = async () => {
      const { data, error } = await supabase.from('estado_sala').select('*').eq('id', 1).single();
      if (!error && data) {
        setMesas(processData(data.radiografia_completa));
        setUltimaAct(data.ultima_actualizacion ? parseDBDate(data.ultima_actualizacion) : new Date());
      }
    };
    fetchInicial();

    const canal = supabase.channel('radar-sala')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'estado_sala' }, (payload) => {
        setMesas(processData(payload.new.radiografia_completa));
        setUltimaAct(payload.new.ultima_actualizacion ? parseDBDate(payload.new.ultima_actualizacion) : new Date());
      })
      .subscribe();

    return () => { supabase.removeChannel(canal); };
  }, []);

  const calcularEstado = (fechaString: string) => {
    if (!fechaString) return { color: 'bg-[#407080]', texto: 'text-white', min: 0, hora: "--:--:--" };

    // Usamos el parseador seguro que limpia el falso UTC (Z) del TPV
    const fecha = parseTPVDate(fechaString);
    const minutos = Math.floor((new Date().getTime() - fecha.getTime()) / 60000);
    const horaFormatted = formatLocalTime(fecha);

    if (minutos > 45) return { color: 'bg-[#D64D5D]', texto: 'text-white', min: minutos, hora: horaFormatted };
    if (minutos > 30) return { color: 'bg-amber-500', texto: 'text-white', min: minutos, hora: horaFormatted };
    return { color: 'bg-[#407080]', texto: 'text-white', min: minutos, hora: horaFormatted };
  };

  const mesasOrdenadas = [...mesas].sort((a, b) => {
    const timeA = parseTPVDate(a.timestamp_tpv || a.fecha_apertura || 0).getTime();
    const timeB = parseTPVDate(b.timestamp_tpv || b.fecha_apertura || 0).getTime();
    return timeA - timeB;
  });

  return (
    <div className="font-sans bg-white rounded-xl shadow-sm overflow-hidden">
      <header className="bg-[#36606F] p-3 md:p-4">
        <div>
          <h2 className="text-lg md:text-xl font-bold tracking-tight text-white">Mesas Abiertas</h2>
          <p className="text-[10px] md:text-xs text-slate-300 mt-0.5">
            {mesas.length} mesas activas • {ultimaAct ? formatLocalTime(ultimaAct) : '...'}
          </p>
        </div>
      </header>

      <div className="p-3 md:p-6 lg:p-8 grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-5 xl:gap-10">
        {mesasOrdenadas.map((m) => (
          <TarjetaMesa key={m.id_ticket} m={m} estado={calcularEstado(m.timestamp_tpv || m.fecha_apertura)} />
        ))}
        {mesas.length === 0 && (
          <div className="col-span-full text-center py-10 text-gray-400 italic">
            No hay mesas abiertas en este momento.
          </div>
        )}
      </div>
    </div>
  );
}