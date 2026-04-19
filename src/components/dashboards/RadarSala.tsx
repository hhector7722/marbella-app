"use client";

import { useEffect, useState, useRef } from 'react';
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
      <div className="flex min-w-0 flex-row items-center justify-between gap-2 select-none">
        <span className="shrink-0 text-[11px] md:text-sm font-black text-white tabular-nums tracking-tight">
          M {m.mesa}
        </span>
        <span
          className="min-w-0 flex-1 truncate px-1 text-center text-[10px] font-semibold leading-tight text-white/95 md:text-xs"
          title={(m.nombre_cliente && String(m.nombre_cliente).trim()) || undefined}
        >
          {(m.nombre_cliente && String(m.nombre_cliente).trim()) ? String(m.nombre_cliente).trim() : '\u00a0'}
        </span>
        <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
          <span className="text-[11px] md:text-sm font-bold text-white flex items-center tabular-nums tracking-tight">
            {totalCalculado.toFixed(2)} <Euro size={10} className="ml-0.5 text-white/80" />
          </span>
          <span className="text-[9px] md:text-[10px] font-bold flex items-center text-white/90">
            <Clock size={10} className="mr-0.5 shrink-0" /> {estado.hora}
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
  /** Evita parpadeo: el TPV a veces manda el ticket ganador sin nombre en un ciclo; conservamos el último por id_ticket. */
  const lastNombreByTicketRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const processData = (rawMesas: any[]) => {
      const distinctMesas = (rawMesas || []).map(m => {
        const mesaKey = String(m.mesa || '').trim();
        if (!mesaKey) return null;

        const hasProducts = m.productos?.some((p: any) => parseFloat(p.unidades) > 0);
        if (!hasProducts) return null;

        return { ...m, mesaKey };
      }).filter(Boolean) as Array<any & { mesaKey: string }>;

      const byMesa = new Map<string, typeof distinctMesas>();
      distinctMesas.forEach((m) => {
        if (!byMesa.has(m.mesaKey)) byMesa.set(m.mesaKey, []);
        byMesa.get(m.mesaKey)!.push(m);
      });

      const finalMesas: any[] = [];
      byMesa.forEach((group) => {
        const sorted = [...group].sort(
          (a, b) => parseTPVDate(b.timestamp_tpv).getTime() - parseTPVDate(a.timestamp_tpv).getTime()
        );
        const winner = sorted[0];
        let nombre =
          (winner.nombre_cliente && String(winner.nombre_cliente).trim()) || '';
        if (!nombre) {
          for (const row of sorted) {
            const n = (row.nombre_cliente && String(row.nombre_cliente).trim()) || '';
            if (n) {
              nombre = n;
              break;
            }
          }
        }

        const ticketKey = String(winner.id_ticket ?? winner.numero_documento ?? '').trim();
        if (nombre) {
          if (ticketKey) lastNombreByTicketRef.current[ticketKey] = nombre;
        } else if (ticketKey && lastNombreByTicketRef.current[ticketKey]) {
          nombre = lastNombreByTicketRef.current[ticketKey];
        }

        finalMesas.push({
          ...winner,
          nombre_cliente: nombre,
        });
      });

      const presentTickets = new Set(
        finalMesas.map((m) => String(m.id_ticket ?? m.numero_documento ?? ''))
      );
      Object.keys(lastNombreByTicketRef.current).forEach((k) => {
        if (!presentTickets.has(k)) delete lastNombreByTicketRef.current[k];
      });

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
      <header className="bg-[#36606F] px-3 py-2 md:px-4 md:py-2">
        <div className="flex flex-wrap items-center gap-x-2.5 md:gap-3">
          <h2 className="text-base md:text-lg font-bold tracking-tight text-white shrink-0">
            Mesas Abiertas
          </h2>
          <span className="text-[10px] md:text-xs text-slate-300 tabular-nums">
            {mesas.length} mesas activas • {ultimaAct ? formatLocalTime(ultimaAct) : '...'}
          </span>
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