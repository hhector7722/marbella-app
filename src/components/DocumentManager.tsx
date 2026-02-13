'use client';

import { useState, useEffect } from 'react';
import { FileText, Euro, Plus, X, Download, Trash2, Calendar } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { addEmployeeDocument, getEmployeeDocuments, deleteEmployeeDocument } from '@/app/actions/profile';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface DocumentManagerProps {
    userId: string;
    isManager: boolean;
    initialType?: 'contract' | 'payroll';
}

export default function DocumentManager({ userId, isManager, initialType = 'contract' }: DocumentManagerProps) {
    const supabase = createClient();
    const [docs, setDocs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showUpload, setShowUpload] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [docType, setDocType] = useState<'contract' | 'payroll'>(initialType);
    const [period, setPeriod] = useState(format(new Date(), 'yyyy-MM'));

    useEffect(() => {
        fetchDocs();
    }, [userId]);

    const fetchDocs = async () => {
        setLoading(true);
        const data = await getEmployeeDocuments(userId);
        setDocs(data);
        setLoading(false);
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            // 1. Upload to Storage
            const fileExt = file.name.split('.').pop();
            const fileName = `${docType}_${Date.now()}.${fileExt}`;
            const filePath = `${userId}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('employee-documents')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // 2. Save metadata via Server Action
            const result = await addEmployeeDocument(userId, {
                type: docType,
                file_path: filePath,
                file_name: file.name,
                period: docType === 'payroll' ? period : undefined
            });

            if (result.success) {
                toast.success('Documento subido correctamente');
                setShowUpload(false);
                fetchDocs();
            } else {
                throw new Error(result.error);
            }
        } catch (error: any) {
            console.error('Upload error:', error);
            toast.error(error.message || 'Error al subir el archivo');
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (docId: string, filePath: string) => {
        if (!confirm('¿Seguro que quieres borrar este documento?')) return;
        const result = await deleteEmployeeDocument(docId, filePath);
        if (result.success) {
            toast.success('Documento eliminado');
            fetchDocs();
        } else {
            toast.error(result.error || 'Error al eliminar');
        }
    };

    const downloadFile = async (filePath: string, fileName: string) => {
        const { data, error } = await supabase.storage
            .from('employee-documents')
            .createSignedUrl(filePath, 60);

        if (error) {
            toast.error('Error al generar enlace de descarga');
            return;
        }

        const link = document.createElement('a');
        link.href = data.signedUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const contracts = docs.filter(d => d.type === 'contract');
    const payrolls = docs.filter(d => d.type === 'payroll');

    return (
        <div className="space-y-6">
            {/* Header con Tabs/Botones */}
            <div className="flex items-center justify-between px-1">
                <div className="flex gap-2 p-1 bg-gray-100 rounded-2xl">
                    <button
                        onClick={() => setDocType('contract')}
                        className={cn("px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", docType === 'contract' ? "bg-white text-[#36606F] shadow-sm" : "text-gray-400")}
                    >
                        Contratos
                    </button>
                    <button
                        onClick={() => setDocType('payroll')}
                        className={cn("px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", docType === 'payroll' ? "bg-white text-[#36606F] shadow-sm" : "text-gray-400")}
                    >
                        Nóminas
                    </button>
                </div>
                {isManager && (
                    <button onClick={() => setShowUpload(true)} className="h-10 w-10 flex items-center justify-center bg-[#36606F] text-white rounded-xl shadow-lg active:scale-95 transition-all">
                        <Plus size={20} strokeWidth={3} />
                    </button>
                )}
            </div>

            {/* Listado */}
            <div className="grid gap-3">
                {loading ? (
                    <div className="py-10 flex flex-col items-center">
                        <div className="w-8 h-8 border-3 border-[#36606F]/20 border-t-[#36606F] rounded-full animate-spin"></div>
                    </div>
                ) : (
                    <>
                        {(docType === 'contract' ? contracts : payrolls).map((doc) => (
                            <div key={doc.id} className="bg-white p-4 rounded-[1.5rem] border border-gray-100 shadow-sm flex items-center justify-between group">
                                <div className="flex items-center gap-4">
                                    <div className={cn("p-3 rounded-xl", doc.type === 'contract' ? "bg-blue-50 text-blue-500" : "bg-emerald-50 text-emerald-500")}>
                                        {doc.type === 'contract' ? <FileText size={20} /> : <Euro size={20} />}
                                    </div>
                                    <div className="overflow-hidden">
                                        <p className="font-bold text-gray-800 text-sm truncate max-w-[150px]">{doc.file_name}</p>
                                        <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-gray-400">
                                            {doc.period && <span>{format(new Date(doc.period), 'MMMM yyyy', { locale: es })}</span>}
                                            {doc.period && <span className="text-gray-200 opacity-50">•</span>}
                                            <span>{format(new Date(doc.created_at), 'dd/MM/yyyy')}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => downloadFile(doc.file_path, doc.file_name)} className="w-10 h-10 flex items-center justify-center bg-gray-50 text-gray-400 hover:text-[#36606F] hover:bg-blue-50 rounded-xl transition-all active:scale-90">
                                        <Download size={18} />
                                    </button>
                                    {isManager && (
                                        <button onClick={() => handleDelete(doc.id, doc.file_path)} className="w-10 h-10 flex items-center justify-center bg-gray-50 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all active:scale-90">
                                            <Trash2 size={18} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                        {((docType === 'contract' ? contracts : payrolls).length === 0) && (
                            <div className="py-12 flex flex-col items-center justify-center text-gray-300 border-2 border-dashed border-gray-100 rounded-[2rem]">
                                <FileText size={40} className="mb-2 opacity-50" />
                                <p className="text-[10px] font-black uppercase tracking-widest">No hay documentos disponibles</p>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Modal de Subida */}
            {showUpload && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-[#36606F] p-6 flex justify-between items-center text-white">
                            <h3 className="font-black uppercase tracking-wider">Subir {docType === 'contract' ? 'Contrato' : 'Nómina'}</h3>
                            <button onClick={() => setShowUpload(false)}><X size={20} strokeWidth={3} /></button>
                        </div>
                        <div className="p-6 space-y-6">
                            {docType === 'payroll' && (
                                <div>
                                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Periodo Correspondiente</label>
                                    <div className="flex items-center gap-3 bg-gray-50 p-4 rounded-xl border border-gray-100">
                                        <Calendar size={18} className="text-[#36606F]" />
                                        <input
                                            type="month"
                                            value={period}
                                            onChange={(e) => setPeriod(e.target.value)}
                                            className="bg-transparent font-black text-sm text-gray-700 outline-none w-full"
                                        />
                                    </div>
                                </div>
                            )}
                            <div className="relative">
                                <input
                                    type="file"
                                    id="file-upload"
                                    className="hidden"
                                    onChange={handleUpload}
                                    accept=".pdf,.doc,.docx,.jpg,.png"
                                    disabled={uploading}
                                />
                                <label
                                    htmlFor="file-upload"
                                    className={cn(
                                        "flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-[2rem] cursor-pointer transition-all",
                                        uploading ? "bg-gray-100 opacity-50 cursor-wait" : "bg-blue-50/30 border-blue-200 hover:bg-blue-50 hover:border-[#36606F]"
                                    )}
                                >
                                    {uploading ? (
                                        <div className="w-10 h-10 border-4 border-[#36606F]/20 border-t-[#36606F] rounded-full animate-spin"></div>
                                    ) : (
                                        <>
                                            <Plus size={32} className="text-[#36606F] mb-3" />
                                            <span className="text-[10px] font-black text-[#36606F] uppercase tracking-widest">Seleccionar Archivo</span>
                                        </>
                                    )}
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
