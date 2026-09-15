'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

type RecordRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  source: 'reolink' | 'marbella_app';
};

function duration(start: string, end: string | null) {
  if (!end) return 'En curso';
  const seconds = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); const s = seconds % 60;
  if (h) return `${h} h ${m} min`;
  if (m) return `${m} min ${s} s`;
  return `${s} s`;
}

export default function CameraRecordsButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<RecordRow[]>([]);

  const show = async () => {
    setOpen(true); setLoading(true);
    try {
      const response = await fetch('/api/cameras/records', { cache: 'no-store' });
      if (response.ok) { const data = await response.json(); setRecords(data.records ?? []); }
    } finally { setLoading(false); }
  };

  const fmt = (value: string) => new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value));

  return <>
    <button type="button" onClick={show} className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm backdrop-blur transition hover:bg-white/15 active:scale-[.98]">Registros</button>
    {open ? <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="flex max-h-[78vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between bg-[#123f46] px-5 py-4 text-white"><h2 className="text-base font-bold">Registros de conexiones</h2><button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10"><X size={20}/></button></div>
        <div className="overflow-y-auto p-4 text-sm text-slate-800">
          {loading ? <p className="py-8 text-center text-slate-500">Cargando…</p> : records.length === 0 ? <p className="py-8 text-center text-slate-500">Todavía no hay conexiones registradas.</p> : <div className="space-y-2">{records.map((r) => <div key={r.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between gap-3"><div className="font-semibold">{fmt(r.started_at)}</div><div className="text-xs font-medium text-slate-500">{r.source === 'marbella_app' ? 'Marbella App' : 'Reolink'}</div></div><div className="mt-1 text-slate-500">{r.ended_at ? `Fin: ${fmt(r.ended_at)}` : 'Conexión activa'}</div><div className="mt-1 font-medium">Duración: {duration(r.started_at, r.ended_at)}</div></div>)}</div>}
        </div>
      </div>
    </div> : null}
  </>;
}
