'use client';

import { useState } from 'react';
import { X, Save } from 'lucide-react';
import { updateProfile } from '@/app/actions/profile';
import { toast } from 'sonner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface EditProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    profile: {
        id: string;
        first_name: string;
        last_name: string;
        dni: string | null;
        bank_account: string | null;
        phone: string | null;
        email: string;
    };
}

export default function EditProfileModal({ isOpen, onClose, onSuccess, profile }: EditProfileModalProps) {
    const [dni, setDni] = useState(profile.dni || '');
    const [iban, setIban] = useState(profile.bank_account || '');
    const [phone, setPhone] = useState(profile.phone || '');
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        const result = await updateProfile(profile.id, {
            dni: dni.trim() || undefined,
            bank_account: iban.trim() || undefined,
            phone: phone.trim() || undefined
        });
        setLoading(false);

        if (result.success) {
            toast.success('Perfil actualizado correctamente');
            onSuccess();
            onClose();
        } else {
            toast.error(result.error || 'Error al actualizar');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="bg-[#36606F] px-8 py-6 flex justify-between items-center text-white">
                    <div>
                        <h3 className="text-xl font-black uppercase tracking-wider leading-none">Editar Perfil</h3>
                        <p className="text-white/50 text-[10px] font-black uppercase tracking-[0.2em] mt-1 italic">
                            {profile.first_name} {profile.last_name}
                        </p>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all active:scale-90">
                        <X size={20} strokeWidth={3} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">DNI / NIE</label>
                            <input
                                type="text"
                                value={dni}
                                onChange={e => setDni(e.target.value)}
                                placeholder="Ej: 12345678X"
                                className="w-full h-14 px-5 rounded-2xl border-2 border-gray-100 bg-gray-50/50 text-gray-800 font-bold focus:border-[#36606F] focus:bg-white outline-none transition-all placeholder:text-gray-300"
                            />
                        </div>

                        <div>
                            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">IBAN (Cuenta Bancaria)</label>
                            <input
                                type="text"
                                value={iban}
                                onChange={e => setIban(e.target.value)}
                                placeholder="ES00 0000 0000 0000 0000 0000"
                                className="w-full h-14 px-5 rounded-2xl border-2 border-gray-100 bg-gray-50/50 text-gray-800 font-bold focus:border-[#36606F] focus:bg-white outline-none transition-all placeholder:text-gray-300"
                            />
                        </div>

                        <div>
                            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Teléfono</label>
                            <input
                                type="tel"
                                value={phone}
                                onChange={e => setPhone(e.target.value)}
                                placeholder="600 000 000"
                                className="w-full h-14 px-5 rounded-2xl border-2 border-gray-100 bg-gray-50/50 text-gray-800 font-bold focus:border-[#36606F] focus:bg-white outline-none transition-all placeholder:text-gray-300"
                            />
                        </div>
                    </div>

                    <div className="pt-4 flex gap-3">
                        <button type="button" onClick={onClose} className="flex-1 h-14 bg-gray-100 text-gray-500 font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-gray-200 transition-all active:scale-95">
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-[2] h-14 bg-[#36606F] text-white font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-lg shadow-[#36606F]/20 hover:brightness-110 transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <LoadingSpinner size="sm" className="text-white" />
                            ) : (
                                <><Save size={18} strokeWidth={3} /> Guardar Cambios</>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
