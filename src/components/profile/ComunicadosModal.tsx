'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { X, Download, FileText, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { addEmployeeDocumentByTipo, deleteEmployeeDocumentByTipo } from '@/app/actions/profile';

interface ComunicadosModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
    isManager?: boolean;
}

interface DocRow {
    id: string;
    filename: string;
    storage_path: string;
    created_at: string;
}

export default function ComunicadosModal({ isOpen, onClose, userId, isManager = false }: ComunicadosModalProps) {
    const supabase = createClient();
    const [loading, setLoading] = useState(true);
    const [docs, setDocs] = useState<DocRow[]>([]);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);
    const [showUpload, setShowUpload] = useState(false);
    const [uploading, setUploading] = useState(false);

    const fetchDocs = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('employee_documents')
                .select('id, filename, storage_path, created_at')
                .eq('user_id', userId)
                .eq('tipo', 'comunicado')
                .order('created_at', { ascending: false });

            if (error) {
                toast.error('Error al cargar comunicados');
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

    useEffect(() => {
        if (!isOpen) return;
        fetchDocs();
    }, [isOpen, userId]);

    const handleOpen = async (doc: DocRow) => {
        setDownloadingId(doc.id);
        try {
            const { data, error } = await supabase.storage
                .from('employee-documents')
                .createSignedUrl(doc.storage_path, 60);
            if (error) throw error;
            window.open(data.signedUrl, '_blank');
        } catch {
            toast.error('Error al abrir el documento');
        } finally {
            setDownloadingId(null);
        }
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            const ext = file.name.split('.').pop() || 'pdf';
            const fileName = `comunicado_${Date.now()}.${ext}`;
            const filePath = `${userId}/comunicados/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('employee-documents')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const result = await addEmployeeDocumentByTipo(userId, {
                tipo: 'comunicado',
                storage_path: filePath,
                filename: file.name
            });

            if (result.success) {
                toast.success('Comunicado subido correctamente');
                setShowUpload(false);
                fetchDocs();
            } else {
                throw new Error(result.error);
            }
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Error al subir el comunicado');
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    const handleDelete = async (doc: DocRow) => {
        if (!confirm('¿Seguro que quieres borrar este comunicado?')) return;
        const result = await deleteEmployeeDocumentByTipo(doc.id, doc.storage_path);
        if (result.success) {
            toast.success('Comunicado eliminado');
            fetchDocs();
        } else {
            toast.error(result.error || 'Error al eliminar');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[101] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div className={cn('bg-white w-full max-w-lg rounded-3xl shadow-xl border border-zinc-100 overflow-hidden animate-in zoom-in-95 duration-200')} onClick={e => e.stopPropagation()}>
                <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-[#36606F] text-white">
                    <h2 className="text-base font-black uppercase tracking-wider">Comunicados y sanciones</h2>
                    <div className="flex items-center gap-2">
                        {isManager && (
                            <>
                                <input
                                    type="file"
                                    id="comunicado-upload"
                                    className="hidden"
                                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                                    onChange={handleUpload}
                                    disabled={uploading}
                                />
                                <label
                                    htmlFor="comunicado-upload"
                                    className={cn(
                                        'min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl cursor-pointer transition-colors',
                                        uploading ? 'bg-white/20 opacity-60 cursor-wait' : 'bg-white/20 hover:bg-white/30'
                                    )}
                                >
                                    {uploading ? <LoadingSpinner className="w-5 h-5 text-white" /> : <Plus size={22} strokeWidth={2.5} />}
                                </label>
                            </>
                        )}
                        <button type="button" onClick={onClose} className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl text-white/80 hover:bg-white/20" aria-label="Cerrar">
                            <X size={22} strokeWidth={2.5} />
                        </button>
                    </div>
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
                            {isManager && (
                                <div className="mt-4">
                                    <input
                                        type="file"
                                        id="comunicado-upload-empty"
                                        className="hidden"
                                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                                        onChange={handleUpload}
                                        disabled={uploading}
                                    />
                                    <label
                                        htmlFor="comunicado-upload-empty"
                                        className={cn(
                                            'inline-flex items-center gap-2 min-h-[48px] px-6 rounded-2xl bg-[#36606F] text-white font-black text-sm uppercase tracking-wider cursor-pointer transition-all active:scale-95',
                                            uploading && 'opacity-60 cursor-wait'
                                        )}
                                    >
                                        {uploading ? <LoadingSpinner className="w-5 h-5" /> : <Plus size={18} />}
                                        Subir comunicado
                                    </label>
                                </div>
                            )}
                        </div>
                    ) : (
                        <ul className="space-y-2">
                            {docs.map((row) => (
                                <li key={row.id} className="min-h-[60px] flex items-center justify-between gap-3 p-4 rounded-2xl border border-zinc-100 bg-white hover:bg-zinc-50/80">
                                    <p className="font-semibold text-zinc-800 truncate flex-1 min-w-0">{row.filename || 'Comunicado'}</p>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button type="button" onClick={() => handleOpen(row)} disabled={!!downloadingId} className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl bg-[#36606F] text-white hover:bg-[#2d4d59] disabled:opacity-60">
                                            {downloadingId === row.id ? <LoadingSpinner className="w-5 h-5 text-white" /> : <Download size={22} strokeWidth={2.5} />}
                                        </button>
                                        {isManager && (
                                            <button type="button" onClick={() => handleDelete(row)} className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl bg-zinc-100 text-zinc-500 hover:bg-rose-50 hover:text-rose-500 transition-colors">
                                                <Trash2 size={20} strokeWidth={2.5} />
                                            </button>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
