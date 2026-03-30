'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { X, Download, FileText, Plus, Trash2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { addEmployeeDocumentByTipo, deleteEmployeeDocumentByTipo } from '@/app/actions/profile';
import DocumentPreviewModal from '@/components/profile/DocumentPreviewModal';

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
    bucket: 'nominas' | 'employee-documents';
}

export default function ComunicadosModal({ isOpen, onClose, userId, isManager = false }: ComunicadosModalProps) {
    const supabase = createClient();
    const [loading, setLoading] = useState(true);
    const [docs, setDocs] = useState<DocRow[]>([]);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);
    const [showUpload, setShowUpload] = useState(false);
    const [uploading, setUploading] = useState(false);

    // Estado previsualización
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewFileName, setPreviewFileName] = useState('');
    const [previewIsPDF, setPreviewIsPDF] = useState(true);
    const [isPreparingPreview, setIsPreparingPreview] = useState<string | null>(null);

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
                const mapped = (data || []).map(row => ({
                    ...row,
                    bucket: /^\d{2}\/\d{4}\//.test(row.storage_path) ? 'nominas' : 'employee-documents'
                })) as DocRow[];
                setDocs(mapped);
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

    const handleDownload = async (doc: DocRow) => {
        setDownloadingId(doc.id);
        try {
            const { data, error } = await supabase.storage
                .from(doc.bucket)
                .download(doc.storage_path);
            if (error) throw error;
            const blobUrl = URL.createObjectURL(data);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = doc.filename || 'comunicado.pdf';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        } catch {
            toast.error('Error al descargar el documento');
        } finally {
            setDownloadingId(null);
        }
    };

    const handleView = async (doc: DocRow) => {
        setIsPreparingPreview(doc.id);
        try {
            const { data, error } = await supabase.storage
                .from(doc.bucket)
                .download(doc.storage_path);
            if (error) throw error;

            if (data.size === 0) {
                toast.error('El archivo está vacío o corrupto. Se ha eliminado el residuo.');
                await deleteEmployeeDocumentByTipo(doc.id, doc.storage_path);
                fetchDocs();
                return;
            }

            // URL firmada para máxima compatibilidad
            const { data: signedData, error: signedError } = await supabase.storage
                .from(doc.bucket)
                .createSignedUrl(doc.storage_path, 3600);
            
            if (signedError) throw signedError;

            const isPdf = doc.filename.toLowerCase().endsWith('.pdf') || doc.storage_path.toLowerCase().endsWith('.pdf');

            setPreviewUrl(signedData.signedUrl);
            setPreviewFileName(doc.filename || 'Comunicado');
            setPreviewIsPDF(isPdf);
            setIsPreviewOpen(true);
        } catch {
            toast.error('Error al previsualizar el documento');
        } finally {
            setIsPreparingPreview(null);
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
                .upload(filePath, file, { upsert: true });

            if (uploadError) {
                console.error('Storage upload error:', uploadError);
                throw new Error(uploadError.message || 'Error al subir el archivo');
            }

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
            const msg = err instanceof Error ? err.message : 'Error al subir el comunicado';
            toast.error(msg);
            console.error('ComunicadosModal upload error:', err);
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
                        <ul className="space-y-1">
                            {docs.map((row) => (
                                <li key={row.id} className="min-h-[56px] flex items-center justify-between gap-3 px-4 py-2 rounded-xl transition-colors hover:bg-zinc-50 border border-transparent hover:border-zinc-100">
                                    <div className="flex-1 min-w-0 pr-4">
                                        <p className="font-semibold text-zinc-700 truncate uppercase text-[11px] tracking-wide">{row.filename.replace('.pdf', '') || 'Comunicado'}</p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button 
                                            type="button" 
                                            onClick={() => handleView(row)} 
                                            disabled={!!isPreparingPreview || !!downloadingId} 
                                            className="p-2.5 flex items-center justify-center rounded-lg text-zinc-400 hover:text-[#36606F] hover:bg-[#36606F]/5 transition-colors disabled:opacity-50"
                                            title="Ver documento"
                                        >
                                            {isPreparingPreview === row.id ? <LoadingSpinner size="sm" className="text-[#36606F]" /> : <Eye size={18} strokeWidth={2} />}
                                        </button>
                                        <button 
                                            type="button" 
                                            onClick={() => handleDownload(row)} 
                                            disabled={!!downloadingId || !!isPreparingPreview} 
                                            className="p-2.5 flex items-center justify-center rounded-lg text-zinc-400 hover:text-[#36606F] hover:bg-[#36606F]/5 transition-colors disabled:opacity-50"
                                            title="Descargar"
                                        >
                                            {downloadingId === row.id ? <LoadingSpinner size="sm" className="text-[#36606F]" /> : <Download size={18} strokeWidth={2} />}
                                        </button>
                                        {isManager && (
                                            <button 
                                                type="button" 
                                                onClick={() => handleDelete(row)} 
                                                className="p-2.5 flex items-center justify-center rounded-lg text-zinc-300 hover:text-rose-500 hover:bg-rose-50 transition-colors ml-1"
                                                title="Eliminar"
                                            >
                                                <Trash2 size={16} strokeWidth={2} />
                                            </button>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            <DocumentPreviewModal 
                isOpen={isPreviewOpen} 
                onClose={() => {
                    setIsPreviewOpen(false);
                    // Ya no revocamos porque usamos Signed URLs no Blobs
                }}
                fileUrl={previewUrl}
                fileName={previewFileName}
                isPDF={previewIsPDF}
            />
        </div>
    );
}
