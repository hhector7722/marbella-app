"use client";

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Clock, Euro, ChevronDown, ChevronUp } from 'lucide-react';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Subcomponente aislado: Evita repintar toda la sala al desplegar una mesa
function TarjetaMesa({ m, estado }: { m: any, estado: any }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className={`p-4 rounded-xl border flex flex-col ${estado.color} shadow-md transition-all duration-200`}>
      {/* Cabecera (Botón de despliegue) */}
      <div
        className="flex justify-between items-center cursor-pointer select-none"
        onClick={() => setAbierto(!abierto)}
      >
        <div className="flex flex-col">
          <span className="text-2xl font-black text-slate-100">M. {m.mesa}</span>
          <span className={`text-xs font-bold flex items-center mt-1 ${estado.texto}`}>
            <Clock size={12} className="mr-1" /> {estado.min} min
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-white flex items-center">
            {parseFloat(m.total_provisional).toFixed(2)} <Euro size={16} className="ml-1 text-slate-400" />
          </span>
          <div className="text-slate-400 hover:text-white transition-colors">
            {abierto ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
          </div>
        </div>
      </div>

      {/* Cuerpo Desplegable (Ticket en vivo) */}
      {abierto && (
        <div className="mt-4 pt-4 border-t border-slate-700/50">
          <ul className="space-y-2 text-sm font-medium text-slate-300">
            {m.productos && m.productos.length > 0 ? (
              m.productos.map((p: any, i: number) => (
                <li key={i} className="flex justify-between items-start">
                  <span className="flex-1">
                    <span className="font-bold text-white mr-2">{p.unidades}x</span>
                    {p.nombre}
                  </span>
                  <span className="ml-4 tabular-nums">
                    {(p.unidades * p.precio).toFixed(2)} €
                  </span>
                </li>
              ))
            ) : (
              <li className="text-slate-500 italic">Sin artículos registrados...</li>
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
    <div className="p-6 font-sans bg-slate-900 rounded-xl border border-slate-800">
      <header className="mb-6 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-100">Visor Táctico de Sala</h2>
          <p className="text-xs text-slate-400 mt-1">
            {mesas.length} mesas activas • Motor de sincronización: {ultimaAct ? ultimaAct.toLocaleTimeString() : '...'}
          </p>
        </div>
      </header>

      {/* Grid adaptativo: 1 columna en móvil, 2 en tablet, 3 estricto en PC */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 xl:gap-6">
        {mesasOrdenadas.map((m) => (
          <TarjetaMesa key={m.id_ticket} m={m} estado={calcularEstado(m.fecha_apertura)} />
        ))}
      </div>
    </div>
  );
}