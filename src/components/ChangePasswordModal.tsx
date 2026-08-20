'use client';

import { useState } from 'react';
import { Lock, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { AuthError } from '@supabase/supabase-js';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

interface ChangePasswordModalProps {
    isOpen: boolean;
    onClose: () => void;
    isRecoveryMode?: boolean;
    onSuccess?: () => void;
}

function getErrorMessage(error: unknown, fallback: string) {
    if (error && typeof error === 'object' && 'message' in error) {
        const message = (error as AuthError).message;
        if (typeof message === 'string' && message.trim()) {
            return message;
        }
    }

    return fallback;
}

export default function ChangePasswordModal({
    isOpen,
    onClose,
    isRecoveryMode = false,
    onSuccess,
}: ChangePasswordModalProps) {
    const supabase = createClient();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const resetForm = () => {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setShowPassword(false);
        setErrorMessage('');
        setSuccessMessage('');
    };

    const handleClose = () => {
        if (loading) return;
        resetForm();
        onClose();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage('');
        setSuccessMessage('');

        if (!isRecoveryMode && !currentPassword.trim()) {
            setErrorMessage('Introduce tu contraseña actual');
            toast.error('Introduce tu contraseña actual');
            return;
        }

        if (newPassword.length < 6) {
            setErrorMessage('La contraseña debe tener al menos 6 caracteres');
            toast.error('La contraseña debe tener al menos 6 caracteres');
            return;
        }

        if (newPassword !== confirmPassword) {
            setErrorMessage('Las contraseñas no coinciden');
            toast.error('Las contraseñas no coinciden');
            return;
        }

        setLoading(true);
        try {
            if (!isRecoveryMode) {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user?.email) {
                    const sessionError = 'No se pudo obtener tu sesión. Cierra sesión y vuelve a entrar.';
                    setErrorMessage(sessionError);
                    toast.error(sessionError);
                    setLoading(false);
                    return;
                }

                const { error: signInError } = await supabase.auth.signInWithPassword({
                    email: user.email,
                    password: currentPassword,
                });

                if (signInError) {
                    const signInMessage = signInError.message?.includes('Invalid login')
                        ? 'Contraseña actual incorrecta'
                        : signInError.message;
                    setErrorMessage(signInMessage);
                    toast.error(signInMessage);
                    setLoading(false);
                    return;
                }
            }

            const { error } = await supabase.auth.updateUser({
                password: newPassword,
            });

            if (error) throw error;

            const successText = isRecoveryMode
                ? 'Contraseña actualizada. Ya puedes entrar con la nueva clave.'
                : 'Contraseña actualizada correctamente';
            setSuccessMessage(successText);
            toast.success(successText);
            onSuccess?.();
            resetForm();
            onClose();
        } catch (error: unknown) {
            console.error('Error updating password:', error);
            const message = getErrorMessage(error, 'Error al actualizar la contraseña');
            setErrorMessage(message);
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    const submitDisabled =
        loading || (!isRecoveryMode && !currentPassword.trim()) || !newPassword || !confirmPassword;

    return (
        <Modal
            open={isOpen}
            onClose={handleClose}
            title="Seguridad"
            subtitle={isRecoveryMode ? 'Nueva Contraseña' : 'Actualizar Contraseña'}
            variant="standard"
            layer="base"
            instance="change-password"
            headerTone="petroleum"
            usageId="change-password"
            usageLabel="Cambiar contraseña"
            footer={
                <div className="flex w-full flex-wrap items-center justify-end gap-2">
                    <Button
                        type="button"
                        variant="secondary"
                        instance="change-password-cancel"
                        onClick={handleClose}
                        disabled={loading}
                    >
                        Cancelar
                    </Button>
                    <Button
                        type="submit"
                        form="change-password-form"
                        variant="primary"
                        instance="change-password-submit"
                        disabled={submitDisabled}
                        loading={loading}
                        loadingLabel={isRecoveryMode ? 'Guardando…' : 'Actualizando…'}
                    >
                        {isRecoveryMode ? 'Guardar nueva clave' : 'Actualizar'}
                    </Button>
                </div>
            }
        >
            <form id="change-password-form" onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-5">
                    {!isRecoveryMode && (
                        <div className="relative group">
                            <label className="mb-2 ml-1 block text-[9px] font-black uppercase tracking-widest text-gray-400">
                                Contraseña Actual
                            </label>
                            <div className="relative">
                                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300 transition-colors group-focus-within:text-[#36606F]">
                                    <Lock size={20} />
                                </div>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    placeholder="••••••••"
                                    autoComplete="current-password"
                                    className="h-16 w-full rounded-2xl border-2 border-gray-100 bg-gray-50/50 pl-14 pr-14 font-bold text-gray-800 outline-none transition-all placeholder:text-gray-200 focus:border-[#36606F] focus:bg-white"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-gray-300 transition-colors hover:text-gray-600"
                                >
                                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="relative group">
                        <label className="mb-2 ml-1 block text-[9px] font-black uppercase tracking-widest text-gray-400">
                            Nueva Contraseña
                        </label>
                        <div className="relative">
                            <div className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300 transition-colors group-focus-within:text-[#36606F]">
                                <Lock size={20} />
                            </div>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="••••••••"
                                autoComplete="new-password"
                                className="h-16 w-full rounded-2xl border-2 border-gray-100 bg-gray-50/50 pl-14 pr-14 font-bold text-gray-800 outline-none transition-all placeholder:text-gray-200 focus:border-[#36606F] focus:bg-white"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-gray-300 transition-colors hover:text-gray-600"
                            >
                                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                        </div>
                    </div>

                    <div className="relative group">
                        <label className="mb-2 ml-1 block text-[9px] font-black uppercase tracking-widest text-gray-400">
                            Confirmar Contraseña
                        </label>
                        <div className="relative">
                            <div className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300 transition-colors group-focus-within:text-[#36606F]">
                                <CheckCircle2 size={20} />
                            </div>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="••••••••"
                                autoComplete="new-password"
                                className="h-16 w-full rounded-2xl border-2 border-gray-100 bg-gray-50/50 pl-14 pr-4 font-bold text-gray-800 outline-none transition-all placeholder:text-gray-200 focus:border-[#36606F] focus:bg-white"
                                required
                            />
                        </div>
                    </div>

                    {(errorMessage || successMessage) && (
                        <div
                            className={cn(
                                'rounded-2xl border px-4 py-3 text-[11px] font-bold',
                                errorMessage
                                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                                    : 'border-emerald-200 bg-emerald-50 text-emerald-700',
                            )}
                        >
                            {errorMessage || successMessage}
                        </div>
                    )}
                </div>

                <div className="border-t border-gray-100 bg-gray-50/80 px-2 py-4 text-center">
                    <p className="text-[8px] font-black uppercase tracking-[0.25em] text-gray-400">
                        La contraseña se cifrará de forma segura
                    </p>
                </div>
            </form>
        </Modal>
    );
}
