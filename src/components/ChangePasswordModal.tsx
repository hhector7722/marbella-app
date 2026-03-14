'use client';

import { useState } from 'react';
import { X, Lock, Eye, EyeOff, Save, CheckCircle2 } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { createClient } from "@/utils/supabase/client";
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ChangePasswordModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function ChangePasswordModal({ isOpen, onClose }: ChangePasswordModalProps) {
    const supabase = createClient();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!currentPassword.trim()) {
            toast.error('Introduce tu contraseña actual');
            return;
        }

        if (newPassword.length < 6) {
            toast.error('La contraseña debe tener al menos 6 caracteres');
            return;
        }

        if (newPassword !== confirmPassword) {
            toast.error('Las contraseñas no coinciden');
            return;
        }

        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user?.email) {
                toast.error('No se pudo obtener tu sesión. Cierra sesión y vuelve a entrar.');
                setLoading(false);
                return;
            }

            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: user.email,
                password: currentPassword
            });

            if (signInError) {
                toast.error(signInError.message?.includes('Invalid login') ? 'Contraseña actual incorrecta' : signInError.message);
                setLoading(false);
                return;
            }

            const { error } = await supabase.auth.updateUser({
                password: newPassword
            });

            if (error) throw error;

            toast.success('Contraseña actualizada correctamente');
            onClose();
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error: any) {
            console.error('Error updating password:', error);
            toast.error(error.message || 'Error al actualizar la contraseña');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div
                className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300"
                onClick={e => e.stopPropagation()}
            >
                {/* Header Estilo Marbella Detail */}
                <div className="bg-[#36606F] px-8 py-8 flex justify-between items-center text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4 blur-2xl pointer-events-none"></div>

                    <div className="relative z-10">
                        <h3 className="text-xl font-black uppercase tracking-wider leading-none">Seguridad</h3>
                        <p className="text-white/50 text-[10px] font-black uppercase tracking-[0.2em] mt-2 italic">
                            Actualizar Contraseña
                        </p>
                    </div>

                    <button
                        onClick={onClose}
                        className="relative z-10 w-12 h-12 flex items-center justify-center bg-white/10 rounded-2xl hover:bg-white/20 transition-all active:scale-90"
                    >
                        <X size={24} strokeWidth={3} />
                    </button>
                </div>

                {/* Formulario */}
                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    <div className="space-y-5">
                        {/* Campo Contraseña Actual */}
                        <div className="relative group">
                            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Contraseña Actual</label>
                            <div className="relative">
                                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-[#36606F] transition-colors">
                                    <Lock size={20} />
                                </div>
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={currentPassword}
                                    onChange={e => setCurrentPassword(e.target.value)}
                                    placeholder="••••••••"
                                    autoComplete="current-password"
                                    className="w-full h-16 pl-14 pr-14 rounded-2xl border-2 border-gray-100 bg-gray-50/50 text-gray-800 font-bold focus:border-[#36606F] focus:bg-white outline-none transition-all placeholder:text-gray-200"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-gray-300 hover:text-gray-600 transition-colors"
                                >
                                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>
                        </div>

                        {/* Campo Nueva Contraseña */}
                        <div className="relative group">
                            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Nueva Contraseña</label>
                            <div className="relative">
                                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-[#36606F] transition-colors">
                                    <Lock size={20} />
                                </div>
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full h-16 pl-14 pr-14 rounded-2xl border-2 border-gray-100 bg-gray-50/50 text-gray-800 font-bold focus:border-[#36606F] focus:bg-white outline-none transition-all placeholder:text-gray-200"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-gray-300 hover:text-gray-600 transition-colors"
                                >
                                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>
                        </div>

                        {/* Campo Confirmar Contraseña */}
                        <div className="relative group">
                            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Confirmar Contraseña</label>
                            <div className="relative">
                                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-[#36606F] transition-colors">
                                    <CheckCircle2 size={20} />
                                </div>
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full h-16 pl-14 pr-4 rounded-2xl border-2 border-gray-100 bg-gray-50/50 text-gray-800 font-bold focus:border-[#36606F] focus:bg-white outline-none transition-all placeholder:text-gray-200"
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    {/* Footer con Botones Táctiles 48px+ */}
                    <div className="pt-6 flex gap-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 h-16 bg-gray-100 text-gray-500 font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-gray-200 transition-all active:scale-95"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !currentPassword.trim() || !newPassword || !confirmPassword}
                            className={cn(
                                "flex-[2] h-16 font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-3",
                                loading || !currentPassword.trim() || !newPassword || !confirmPassword
                                    ? "bg-gray-200 text-gray-400 shadow-none cursor-not-allowed"
                                    : "bg-[#36606F] text-white shadow-[#36606F]/25 hover:brightness-110"
                            )}
                        >
                            {loading ? (
                                <LoadingSpinner size="sm" className="text-white" />
                            ) : (
                                <><Save size={20} strokeWidth={3} /> Actualizar</>
                            )}
                        </button>
                    </div>
                </form>

                {/* Nota de Seguridad */}
                <div className="p-6 bg-gray-50/80 text-center border-t border-gray-100">
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-[0.25em]">La contraseña se cifrará de forma segura</p>
                </div>
            </div>
        </div>
    );
}
