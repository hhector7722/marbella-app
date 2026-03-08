'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { X, Download, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface NominasModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface NominaRow {
    id: string;
    user_id: string;
    tipo: string;
    mes: string;
    year: number;
    filename: string;
    storage_path: string;
    created_at?: string;
}

export default function NominasModal({ isOpen, onClose }: NominasModalProps) {
    const supabase = createClient();
    const [loading, setLoading] = useState(true);
    const [nominas, setNominas] = useState<NominaRow[]>([]);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;

        const fetchNominas = async () => {
            setLoading(true);
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    toast.error('Debes iniciar sesión para ver tus nóminas');
                    onClose();
                    setLoading(false);
                    return;
                }

                const { data, error } = await supabase
                    .from('employee_documents')
                    .select('id, user_id, tipo, mes, year, filename, storage_path, created_at')
                    .eq('user_id', user.id)
                    .eq('tipo', 'nomina')
                    .order('created_at', { ascending: false });

                if (error) {
                    console.error('Error fetching nominas:', error);
                    toast.error('Error al cargar las nóminas');
                    setNominas([]);
                    setLoading(false);
                    return;
                }

                setNominas(data ?? []);
            } catch (err) {
                console.error('NominasModal fetch error:', err);
                toast.error('Error al cargar las nóminas');
                setNominas([]);
            } finally {
                setLoading(false);
            }
        };

        fetchNominas();
    }, [isOpen, onClose]);

    const handleDownload = async (row: NominaRow) => {
        if (!row.storage_path) {
            toast.error('No se puede descargar este documento');
            return;
        }
        setDownloadingId(row.id);
        try {
            // 1. Descarga silenciosa del archivo a la memoria local (Blob)
            const { data, error } = await supabase.storage
                .from('nominas')
                .download(row.storage_path);

            if (error) throw error;

            // 2. Crear una URL local invisible (tipo blob:...)
            const blobUrl = URL.createObjectURL(data);

            // 3. Abrir en el visor nativo del dispositivo (Previsualización limpia)
            window.open(blobUrl, '_blank');

            // 4. Limpiar la memoria del dispositivo tras 10 segundos
            setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        } catch (err) {
            console.error('Error previsualizando nómina:', err);
            toast.error('No se pudo cargar el documento.');
        } finally {
            setDownloadingId(null);
        }
    };

    if (!isOpen) return null;

    const labelPeriod = (row: NominaRow) => {
        const m = row.mes ?? '';
        const y = row.year ?? '';
        if (m || y) return `${m} ${y}`.trim();
        return row.filename || 'Nómina';
    };

    return (
        <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className={cn(
                    'bg-white w-full max-w-lg rounded-3xl shadow-xl border border-zinc-100 overflow-hidden',
                    'animate-in zoom-in-95 duration-200'
                )}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-zinc-50/50">
                    <h2 className="text-base font-black text-[#36606F] uppercase tracking-wider">
                        Mis nóminas
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl text-zinc-500 hover:bg-zinc-200/80 hover:text-zinc-800 transition-colors active:scale-95"
                        aria-label="Cerrar"
                    >
                        <X size={22} strokeWidth={2.5} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto max-h-[70vh] p-4">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12">
                            <LoadingSpinner className="w-10 h-10 text-[#36606F]" />
                            <p className="mt-3 text-sm text-zinc-500 font-medium">Cargando nóminas…</p>
                        </div>
                    ) : nominas.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                            <div className="bg-zinc-100 p-4 rounded-2xl text-zinc-400 mb-3">
                                <FileText size={32} strokeWidth={1.5} />
                            </div>
                            <p className="text-zinc-500 font-medium">No tienes nóminas disponibles</p>
                        </div>
                    ) : (
                        <ul className="space-y-2">
                            {nominas.map((row) => (
                                <li
                                    key={row.id}
                                    className="min-h-[60px] flex items-center justify-between gap-3 p-4 rounded-2xl border border-zinc-100 bg-white hover:bg-zinc-50/80 transition-colors"
                                >
                                    <div className="flex-1 min-w-0 flex items-center gap-3">
                                        <div className="shrink-0 bg-[#36606F]/10 p-3 rounded-xl text-[#36606F]">
                                            <FileText size={20} strokeWidth={2.5} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-semibold text-zinc-800 truncate">
                                                {labelPeriod(row)}
                                            </p>
                                            {row.filename ? (
                                                <p className="text-xs text-zinc-400 truncate">
                                                    {row.filename}
                                                </p>
                                            ) : null}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleDownload(row)}
                                        disabled={!!downloadingId}
                                        className="shrink-0 min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl bg-[#36606F] text-white hover:bg-[#2d4d59] disabled:opacity-60 transition-all active:scale-95"
                                        aria-label="Descargar"
                                    >
                                        {downloadingId === row.id ? (
                                            <LoadingSpinner className="w-5 h-5 text-white" />
                                        ) : (
                                            <Download size={22} strokeWidth={2.5} />
                                        )}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
