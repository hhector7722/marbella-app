'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { X, Download, FileText, Plus, Trash2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import DocumentPreviewModal from '@/components/profile/DocumentPreviewModal';

interface NominasModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** ID del perfil cuyas nóminas mostrar. Si no se pasa, usa el usuario logueado (propio perfil). */
    targetUserId?: string;
    isManager?: boolean;
}

interface NominaRow {
    id: string;
    user_id: string;
    mes: string;
    year: number;
    filename: string;
    storage_path: string;
    created_at?: string;
    bucket: 'nominas' | 'employee-documents';
    sourceTable: 'nominas' | 'employee_documents';
}

export default function NominasModal({ isOpen, onClose, targetUserId, isManager = false }: NominasModalProps) {
    const supabase = createClient();
    const [loading, setLoading] = useState(true);
    const [nominas, setNominas] = useState<NominaRow[]>([]);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);

    // Estado previsualización
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewFileName, setPreviewFileName] = useState('');
    const [previewIsPDF, setPreviewIsPDF] = useState(true);
    const [isPreparingPreview, setIsPreparingPreview] = useState<string | null>(null);

    // Estados para el formulario de subida
    const [uploadMonth, setUploadMonth] = useState<string>(new Date().toLocaleString('es-ES', { month: 'long' }).toLowerCase());
    const [uploadYear, setUploadYear] = useState<number>(new Date().getFullYear());

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
            const effectiveUserId = targetUserId ?? user.id;

            const { data: edData, error: edError } = await supabase
                .from('employee_documents')
                .select('id, user_id, mes, year, filename, storage_path, created_at')
                .eq('user_id', effectiveUserId)
                .eq('tipo', 'nomina')
                .order('created_at', { ascending: false });

            if (edError) console.error('Error fetching employee_documents nominas:', edError);

            const { data: nomData, error: nomError } = await supabase
                .from('nominas')
                .select('id, empleado_id, mes_anio, file_path, created_at')
                .eq('empleado_id', effectiveUserId)
                .order('created_at', { ascending: false });

            if (nomError) console.error('Error fetching nominas legacy:', nomError);

            const seen = new Set<string>();
            const merged: NominaRow[] = [];

            for (const row of edData ?? []) {
                if (row.storage_path && !seen.has(row.storage_path)) {
                    seen.add(row.storage_path);
                    
                    // Los documentos antiguos de nóminas se guardaban en el bucket 'nominas' con rutas como '01/2026/febrero_...'
                    const isLegacyBucket = /^\d{2}\/\d{4}\//.test(row.storage_path);
                    
                    merged.push({
                        id: row.id,
                        user_id: row.user_id,
                        mes: row.mes ?? '',
                        year: row.year ?? 0,
                        filename: row.filename ?? '',
                        storage_path: row.storage_path,
                        created_at: row.created_at,
                        bucket: isLegacyBucket ? 'nominas' : 'employee-documents',
                        sourceTable: 'employee_documents'
                    });
                }
            }

            for (const row of nomData ?? []) {
                if (row.file_path && !seen.has(row.file_path)) {
                    seen.add(row.file_path);
                    const parts = (row.mes_anio ?? '').split('-');
                    const [a, b] = parts;
                    const isYearFirst = a?.length === 4;
                    const year = parseInt(isYearFirst ? a : b ?? '0', 10) || 0;
                    const mes = isYearFirst ? (b ?? '') : (a ?? '');
                    merged.push({
                        id: row.id,
                        user_id: row.empleado_id,
                        mes,
                        year,
                        filename: `Nómina ${row.mes_anio ?? ''}`,
                        storage_path: row.file_path,
                        created_at: row.created_at,
                        bucket: 'nominas',
                        sourceTable: 'nominas'
                    });
                }
            }

            merged.sort((a, b) => {
                const da = a.created_at ? new Date(a.created_at).getTime() : 0;
                const db = b.created_at ? new Date(b.created_at).getTime() : 0;
                return db - da;
            });

            setNominas(merged);
        } catch (err) {
            console.error('NominasModal fetch error:', err);
            toast.error('Error al cargar las nóminas');
            setNominas([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) fetchNominas();
    }, [isOpen, targetUserId]);

    const handleDownload = async (row: NominaRow) => {
        if (!row.storage_path) {
            toast.error('No se puede descargar este documento');
            return;
        }
        setDownloadingId(row.id);
        try {
            const { data, error } = await supabase.storage
                .from(row.bucket)
                .download(row.storage_path);

            if (error) throw error;
            const blobUrl = URL.createObjectURL(data);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = row.filename || 'nomina.pdf';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        } catch (err) {
            console.error('Error descargando nómina:', err);
            toast.error('No se pudo descargar el documento.');
        } finally {
            setDownloadingId(null);
        }
    };

    const handleView = async (row: NominaRow) => {
        if (!row.storage_path) {
            toast.error('No se puede previsualizar este documento');
            return;
        }
        setIsPreparingPreview(row.id);
        try {
            const { data, error } = await supabase.storage
                .from(row.bucket)
                .download(row.storage_path);

            if (error) throw error;
            
            if (data.size === 0) {
                toast.error('El archivo está vacío o corrupto. Se ha eliminado el residuo.');
                if (row.bucket === 'employee-documents') {
                    const { deleteEmployeeDocumentByTipo } = await import('@/app/actions/profile');
                    await deleteEmployeeDocumentByTipo(row.id, row.storage_path);
                    fetchNominas();
                }
                return;
            }

            // Generar una URL firmada en lugar de un Blob para máxima compatibilidad con navegadores móviles
            const { data: signedData, error: signedError } = await supabase.storage
                .from(row.bucket)
                .createSignedUrl(row.storage_path, 3600); // 1 hora de validez

            if (signedError) throw signedError;
            
            const isPdf = row.filename.toLowerCase().endsWith('.pdf') || row.storage_path.toLowerCase().endsWith('.pdf');
            
            setPreviewUrl(signedData.signedUrl);
            setPreviewFileName(row.filename || labelPeriod(row));
            setPreviewIsPDF(isPdf);
            setIsPreviewOpen(true);
        } catch (err) {
            console.error('Error previsualizando nómina:', err);
            toast.error('No se pudo cargar la previsualización.');
        } finally {
            setIsPreparingPreview(null);
        }
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !targetUserId) return;

        setUploading(true);
        try {
            const ext = file.name.split('.').pop() || 'pdf';
            const fileName = `nomina_${uploadMonth}_${uploadYear}_${Date.now()}.${ext}`;
            const filePath = `${targetUserId}/nominas/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('employee-documents')
                .upload(filePath, file, { upsert: true });

            if (uploadError) throw new Error(uploadError.message);

            const { addEmployeeDocumentByTipo } = await import('@/app/actions/profile');
            const result = await addEmployeeDocumentByTipo(targetUserId, {
                tipo: 'nomina',
                storage_path: filePath,
                filename: file.name,
                mes: uploadMonth,
                year: uploadYear
            });

            if (result.success) {
                toast.success('Nómina subida correctamente');
                fetchNominas();
            } else {
                throw new Error(result.error);
            }
        } catch (err: any) {
            toast.error(err.message || 'Error al subir la nómina');
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    const handleDelete = async (row: NominaRow) => {
        if (!confirm(`¿Seguro que quieres borrar la nómina de ${row.mes} ${row.year}?`)) return;
        
        try {
            const { deleteEmployeeDocumentByTipo, deleteLegacyNomina } = await import('@/app/actions/profile');
            
            let result;
            if (row.sourceTable === 'nominas') {
                result = await deleteLegacyNomina(row.id, row.storage_path);
            } else {
                result = await deleteEmployeeDocumentByTipo(row.id, row.storage_path, row.bucket);
            }
            
            if (result.success) {
                toast.success('Nómina eliminada');
                fetchNominas();
            } else {
                toast.error(result.error || 'Error al eliminar');
            }
        } catch (err) {
            toast.error('Error al eliminar');
        }
    };

    if (!isOpen) return null;

    const labelPeriod = (row: NominaRow) => {
        const m = row.mes ?? '';
        const y = row.year ?? '';
        if (m || y) return `${m} ${y}`.trim();
        return row.filename || 'Nómina';
    };

    const MESES = [
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
    ];

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div className={cn('bg-white w-full max-w-lg rounded-3xl shadow-xl border border-zinc-100 overflow-hidden animate-in zoom-in-95 duration-200')} onClick={e => e.stopPropagation()}>
                <div className="shrink-0 flex items-center justify-between px-6 py-4 bg-[#36606F] text-white">
                    <h2 className="text-base font-black uppercase tracking-wider">
                        {targetUserId ? 'Nóminas del empleado' : 'Mis nóminas'}
                    </h2>
                    <div className="flex items-center gap-2">
                        {isManager && targetUserId && (
                            <>
                                <input type="file" id="nomina-upload" className="hidden" accept=".pdf" onChange={handleUpload} disabled={uploading} />
                                <label htmlFor="nomina-upload" className={cn('min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl cursor-pointer transition-colors bg-white/20 hover:bg-white/30', uploading && 'opacity-60 cursor-wait')}>
                                    {uploading ? <LoadingSpinner size="sm" className="text-white" /> : <Plus size={22} strokeWidth={2.5} />}
                                </label>
                            </>
                        )}
                        <button type="button" onClick={onClose} className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl text-white hover:bg-white/20 transition-colors" aria-label="Cerrar">
                            <X size={22} strokeWidth={2.5} />
                        </button>
                    </div>
                </div>

                {isManager && targetUserId && (
                    <div className="px-6 py-3 bg-zinc-50 border-b border-zinc-100 flex items-center gap-3">
                        <select 
                            value={uploadMonth} 
                            onChange={(e) => setUploadMonth(e.target.value)}
                            className="flex-1 bg-white border border-zinc-200 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider outline-none focus:ring-2 focus:ring-[#36606F]/20"
                        >
                            {MESES.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <select 
                            value={uploadYear} 
                            onChange={(e) => setUploadYear(parseInt(e.target.value))}
                            className="w-24 bg-white border border-zinc-200 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider outline-none focus:ring-2 focus:ring-[#36606F]/20"
                        >
                            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto max-h-[60vh] p-4">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12">
                            <LoadingSpinner size="lg" className="text-[#36606F]" />
                            <p className="mt-3 text-sm text-zinc-500 font-medium">Cargando nóminas…</p>
                        </div>
                    ) : nominas.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                            <div className="bg-zinc-100 p-4 rounded-2xl text-zinc-400 mb-3">
                                <FileText size={32} strokeWidth={1.5} />
                            </div>
                            <p className="text-zinc-500 font-medium">
                                {targetUserId ? 'Este empleado no tiene nóminas disponibles' : 'No tienes nóminas disponibles'}
                            </p>
                        </div>
                    ) : (
                        <ul className="space-y-1">
                            {nominas.map((row) => (
                                <li key={row.id} className="min-h-[56px] flex items-center justify-between gap-3 px-4 py-2 rounded-xl transition-colors hover:bg-zinc-50 border border-transparent hover:border-zinc-100">
                                    <div className="flex-1 min-w-0 pr-4">
                                        <p className="font-semibold text-zinc-700 truncate uppercase text-[11px] tracking-wide">{labelPeriod(row)}</p>
                                        <p className="text-[10px] text-zinc-400 truncate">{row.filename.replace('.pdf', '')}</p>
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
                onDownload={() => {
                    // Podemos reusar la URL del blob si existe
                }}
            />
        </div>
    );
}
