"use client";

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Clock, Euro } from 'lucide-react';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

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
    if (minutos > 45) return { color: 'bg-red-900/50 border-red-500', texto: 'text-red-400', min: minutos };
    if (minutos > 30) return { color: 'bg-yellow-900/50 border-yellow-500', texto: 'text-yellow-400', min: minutos };
    return { color: 'bg-emerald-900/50 border-emerald-500', texto: 'text-emerald-400', min: minutos };
  };

  const mesasOrdenadas = [...mesas].sort((a, b) => new Date(a.fecha_apertura).getTime() - new Date(b.fecha_apertura).getTime());

  return (
    <div className="p-6 font-sans bg-slate-900 rounded-xl border border-slate-800">
      <header className="mb-6 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-100">Mesas</h2>
          <p className="text-xs text-slate-400 mt-1">
            {mesas.length} mesas activas • Latido: {ultimaAct ? ultimaAct.toLocaleTimeString() : '...'}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {mesasOrdenadas.map((m) => {
          const estado = calcularEstado(m.fecha_apertura);
          return (
            <div key={m.id_ticket} className={`p-3 rounded-lg border flex flex-col justify-between h-28 ${estado.color} shadow-md`}>
              <div className="flex justify-between items-start">
                <span className="text-lg font-black text-slate-100">M. {m.mesa}</span>
                <span className={`text-xs font-bold flex items-center ${estado.texto}`}>
                  <Clock size={12} className="mr-1" /> {estado.min}m
                </span>
              </div>
              <div className="mt-auto">
                <span className="text-xl font-bold text-white flex items-center">
                  {parseFloat(m.total_provisional).toFixed(2)} <Euro size={14} className="ml-1 text-slate-400" />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}