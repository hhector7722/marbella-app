'use client';

import { useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/modal';

type RecordRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  source: 'reolink' | 'marbella_app';
  viewer: string;
};

function duration(start: string, end: string | null) {
  if (!end) return 'En curso';
  const seconds = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h) return `${h} h ${m} min`;
  if (m) return `${m} min ${s} s`;
  return `${s} s`;
}

export default function CameraRecordsButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<RecordRow[]>([]);

  const show = async () => {
    setOpen(true);
    setLoading(true);
    try {
      const response = await fetch('/api/cameras/records', { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        setRecords(data.records ?? []);
      }
    } finally {
      setLoading(false);
    }
  };

  const fmt = (value: string) => new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));

  return <>
    <button type="button" onClick={show} className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm backdrop-blur transition hover:bg-white/15 active:scale-[.98]">Registros</button>
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Registros de conexiones"
      variant="standard"
      layer="base"
      scheme="dark"
      instance="camera-records"
      usageId="camera-records"
      usageLabel="Registros de conexiones"
    >
      {loading && records.length === 0 ? (
        <p className="py-8 text-center text-white/65">Cargando…</p>
      ) : records.length === 0 ? (
        <EmptyState
          instance="camera-records-none"
          variant="none"
          title="Todavía no hay conexiones registradas"
        />
      ) : (
        <div className="space-y-2">
          {records.map((r) => (
            <div key={r.id} className="rounded-ds-superficie border border-white/15 bg-white/[0.06] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{r.viewer}</div>
                  <div className="mt-0.5 text-xs text-white/60">{r.source === 'marbella_app' ? 'Marbella App' : 'Reolink'}</div>
                </div>
                <div className="text-right text-xs font-medium text-white/75">{fmt(r.started_at)}</div>
              </div>
              <div className="mt-2 text-white/70">{r.ended_at ? `Fin: ${fmt(r.ended_at)}` : 'Conexión activa'}</div>
              <div className="mt-1 font-medium">Duración: {duration(r.started_at, r.ended_at)}</div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  </>;
}
