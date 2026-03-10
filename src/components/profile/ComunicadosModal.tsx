'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { X, Download, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface ComunicadosModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
}

interface DocRow {
    id: string;
    file_name: string;
    file_path: string;
    created_at: string;
}

export default function ComunicadosModal({ isOpen, onClose, userId }: ComunicadosModalProps) {
    const supabase = createClient();
    const [loading, setLoading] = useState(true);
    const [docs, setDocs] = useState<DocRow[]>([]);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        const fetchDocs = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('employee_documents')
                    .select('id, file_name, file_path, created_at')
                    .eq('user_id', userId)
                    .eq('tipo', 'comunicado')
                    .order('created_at', { ascending: false });

                if (error) {
                    setDocs([]);
                } else {
                    setDocs((data as DocRow[]) ?? []);
                }
            } catch {
                setDocs([]);
            } finally {
                setLoading(false);
            }
        };
        fetchDocs();
    }, [isOpen, userId]);

    const handleOpen = async (doc: DocRow) => {
        setDownloadingId(doc.id);
        try {
            const { data, error } = await supabase.storage
                .from('employee-documents')
                .createSignedUrl(doc.file_path, 60);
            if (error) throw error;
            window.open(data.signedUrl, '_blank');
        } catch {
            toast.error('Error al abrir el documento');
        } finally {
            setDownloadingId(null);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[101] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div className={cn('bg-white w-full max-w-lg rounded-3xl shadow-xl border border-zinc-100 overflow-hidden animate-in zoom-in-95 duration-200')} onClick={e => e.stopPropagation()}>
                <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-[#36606F] text-white">
                    <h2 className="text-base font-black uppercase tracking-wider">Comunicados y sanciones</h2>
                    <button type="button" onClick={onClose} className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl text-white/80 hover:bg-white/20" aria-label="Cerrar">
                        <X size={22} strokeWidth={2.5} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto max-h-[70vh] p-4">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12">
                            <LoadingSpinner className="w-10 h-10 text-[#36606F]" />
                            <p className="mt-3 text-sm text-zinc-500">Cargando…</p>
                        </div>
                    ) : docs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                            <div className="bg-zinc-100 p-4 rounded-2xl text-zinc-400 mb-3">
                                <FileText size={32} strokeWidth={1.5} />
                            </div>
                            <p className="text-zinc-500 font-medium">No hay comunicados disponibles</p>
                        </div>
                    ) : (
                        <ul className="space-y-2">
                            {docs.map((row) => (
                                <li key={row.id} className="min-h-[60px] flex items-center justify-between gap-3 p-4 rounded-2xl border border-zinc-100 bg-white hover:bg-zinc-50/80">
                                    <p className="font-semibold text-zinc-800 truncate flex-1 min-w-0">{row.file_name || 'Comunicado'}</p>
                                    <button type="button" onClick={() => handleOpen(row)} disabled={!!downloadingId} className="shrink-0 min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl bg-[#36606F] text-white hover:bg-[#2d4d59] disabled:opacity-60">
                                        {downloadingId === row.id ? <LoadingSpinner className="w-5 h-5 text-white" /> : <Download size={22} strokeWidth={2.5} />}
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
