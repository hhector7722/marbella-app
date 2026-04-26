'use client';

import { useState, useEffect } from 'react';
import { createClient } from "@/utils/supabase/client";
import { toast } from 'sonner';
import { Lock, Eye, EyeOff, Save, CheckCircle2, ChevronRight, Smartphone, Share, PlusSquare, ArrowUp, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { completeOnboarding } from '@/app/actions/profile';
import Image from 'next/image';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { usePWAInstall } from '@/hooks/usePWAInstall';

interface OnboardingOverlayProps {
    needsOnboarding: boolean;
}

export default function OnboardingOverlay({ needsOnboarding }: OnboardingOverlayProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [step, setStep] = useState(1); // 1: Security + Email, 2: Integration
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const supabase = createClient();

    // Password State
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [os, setOs] = useState<'ios' | 'android' | 'desktop'>('desktop');
    const { isInstallable, install } = usePWAInstall();

    useEffect(() => {
        if (needsOnboarding) {
            setIsVisible(true);

            // Get user email
            supabase.auth.getUser().then(({ data }) => {
                if (data.user) setUserEmail(data.user.email ?? null);
            });

            // Detect OS
            const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
            if (/iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream) {
                setOs('ios');
            } else if (/android/i.test(userAgent)) {
                setOs('android');
            }
        }
    }, [needsOnboarding]);

    if (!isVisible) return null;

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

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
            const { error } = await supabase.auth.updateUser({
                password: newPassword
            });

            if (error) throw error;

            toast.success('Contraseña actualizada');
            setStep(2); // Move to Integration step
        } catch (error: any) {
            console.error('Error updating password:', error);
            toast.error(error.message || 'Error al actualizar la contraseña');
        } finally {
            setLoading(false);
        }
    };

    const handleFinishOnboarding = async () => {
        setLoading(true);
        try {
            const result = await completeOnboarding();
            if (!result.success) throw new Error(result.error);

            toast.success('¡Bienvenido a Bar La Marbella!');
            setIsVisible(false);
        } catch (error: any) {
            toast.error('Error al finalizar el onboarding');
        } finally {
            setLoading(false);
        }
    };

    const handleInstallClick = async () => {
        const success = await install();
        if (success) {
            toast.success('¡Instalación iniciada!');
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] bg-[#3E6A8A] flex flex-col items-center justify-center p-4">
            {/* Background decorative elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>

            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden relative z-10 animate-in zoom-in-95 duration-500">

                {/* Header */}
                <div className="bg-[#36606F] text-white p-8 text-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-full bg-[url('/noise.png')] opacity-10 mix-blend-overlay"></div>
                    <h1 className="text-2xl font-black uppercase tracking-widest mb-2 relative z-10">
                        {step === 1 ? 'Seguridad' : 'Instalación'}
                    </h1>
                    <p className="text-white/60 text-[10px] font-black uppercase tracking-[0.2em] relative z-10">
                        Paso {step} de 2
                    </p>
                </div>

                <div className="p-6 md:p-8">
                    {step === 1 && (
                        <div className="space-y-6 animate-in slide-in-from-right duration-300">
                            <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-100 flex items-center justify-between gap-3 overflow-hidden">
                                <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest shrink-0">Tu Email:</span>
                                <span className="text-xs font-bold text-zinc-900 truncate">{userEmail || 'Cargando...'}</span>
                            </div>

                            <p className="text-center text-gray-500 font-medium text-[13px] leading-relaxed">
                                Para garantizar la seguridad de tu cuenta, por favor establece una nueva contraseña personal.
                            </p>

                            <form onSubmit={handlePasswordSubmit} className="space-y-5">
                                {/* Hidden Username Field for Password Managers */}
                                <input
                                    type="text"
                                    name="username"
                                    autoComplete="username"
                                    value={userEmail || ''}
                                    readOnly
                                    className="hidden"
                                />

                                <div className="space-y-4">
                                    {/* Nueva Contraseña */}
                                    <div className="relative group">
                                        <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Nueva Contraseña</label>
                                        <div className="relative">
                                            <div className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-[#36606F] transition-colors">
                                                <Lock size={20} />
                                            </div>
                                            <input
                                                type={showPassword ? "text" : "password"}
                                                autoComplete="new-password"
                                                value={newPassword}
                                                onChange={e => setNewPassword(e.target.value)}
                                                placeholder="••••••••"
                                                className="w-full h-14 pl-14 pr-14 rounded-2xl border-2 border-gray-100 bg-gray-50/50 text-gray-800 font-bold focus:border-[#36606F] focus:bg-white outline-none transition-all"
                                                required
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-600"
                                            >
                                                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Confirmar Contraseña */}
                                    <div className="relative group">
                                        <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Confirmar Contraseña</label>
                                        <div className="relative">
                                            <div className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-[#36606F] transition-colors">
                                                <CheckCircle2 size={20} />
                                            </div>
                                            <input
                                                type={showPassword ? "text" : "password"}
                                                autoComplete="new-password"
                                                value={confirmPassword}
                                                onChange={e => setConfirmPassword(e.target.value)}
                                                placeholder="••••••••"
                                                className="w-full h-14 pl-14 pr-4 rounded-2xl border-2 border-gray-100 bg-gray-50/50 text-gray-800 font-bold focus:border-[#36606F] focus:bg-white outline-none transition-all"
                                                required
                                            />
                                        </div>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading || !newPassword || !confirmPassword}
                                    className={cn(
                                        "w-full h-16 font-black uppercase tracking-widest text-[11px] rounded-2xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 mt-4",
                                        loading || !newPassword || !confirmPassword
                                            ? "bg-gray-200 text-gray-400 shadow-none cursor-not-allowed"
                                            : "bg-[#36606F] text-white shadow-[#36606F]/25 hover:brightness-110"
                                    )}
                                >
                                    {loading ? (
                                        <LoadingSpinner size="sm" className="text-white" />
                                    ) : (
                                        <>Continuar <ChevronRight size={20} strokeWidth={3} /></>
                                    )}
                                </button>
                            </form>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-4 animate-in slide-in-from-right duration-300">
                            <div className="relative aspect-[9/16] w-full max-h-[320px] rounded-2xl overflow-hidden bg-zinc-50 border border-zinc-100 shadow-inner flex items-center justify-center">
                                <Image
                                    src="/examples/pantalla-inicio.png"
                                    alt="Guía de inicio"
                                    fill
                                    className="object-contain p-2"
                                    priority
                                />
                            </div>

                            <div className="bg-[#36606F]/5 rounded-2xl p-4 border border-[#36606F]/10 space-y-3">
                                {os === 'ios' && (
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-3 text-[10px] text-[#36606F] font-bold uppercase">
                                            <div className="w-6 h-6 bg-white border border-[#36606F]/20 rounded-lg flex items-center justify-center shrink-0 text-[#007AFF]">
                                                <Share size={12} />
                                            </div>
                                            <span>1. Pulsa el botón "Compartir"</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-[10px] text-[#36606F] font-bold uppercase">
                                            <div className="w-6 h-6 bg-white border border-[#36606F]/20 rounded-lg flex items-center justify-center shrink-0">
                                                <PlusSquare size={12} />
                                            </div>
                                            <span>2. Selecciona "Añadir a inicio"</span>
                                        </div>
                                    </div>
                                )}

                                {os === 'android' && !isInstallable && (
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-3 text-[10px] text-[#36606F] font-bold uppercase">
                                            <div className="w-6 h-6 bg-white border border-[#36606F]/20 rounded-lg flex items-center justify-center shrink-0">
                                                <Menu size={12} />
                                            </div>
                                            <span>1. Pulsa el menú (3 puntos)</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-[10px] text-[#36606F] font-bold uppercase">
                                            <div className="w-6 h-6 bg-white border border-[#36606F]/20 rounded-lg flex items-center justify-center shrink-0">
                                                <Smartphone size={12} />
                                            </div>
                                            <span>2. Selecciona "Instalar App"</span>
                                        </div>
                                    </div>
                                )}

                                {isInstallable && (
                                    <button
                                        type="button"
                                        onClick={handleInstallClick}
                                        className="w-full h-14 bg-emerald-600 text-white font-black uppercase tracking-widest text-[11px] rounded-2xl shadow-xl shadow-emerald-600/25 hover:brightness-110 transition-all active:scale-95 flex items-center justify-center gap-3"
                                    >
                                        <Smartphone size={20} />
                                        Instalar app en este dispositivo
                                    </button>
                                )}

                                <p className="text-[9px] text-[#36606F]/70 italic text-center font-bold leading-tight">
                                    * Con la App instalada tendrás una experiencia a pantalla completa y acceso más rápido.
                                </p>
                            </div>

                            <button
                                onClick={handleFinishOnboarding}
                                disabled={loading}
                                className="w-full h-14 bg-[#36606F] text-white font-black uppercase tracking-widest text-[11px] rounded-2xl shadow-xl shadow-[#36606F]/25 hover:brightness-110 transition-all active:scale-95 flex items-center justify-center gap-3 mt-2"
                            >
                                {loading ? (
                                    <LoadingSpinner size="sm" className="text-white" />
                                ) : (
                                    <>Siguiente (Ir a la App) <ChevronRight size={18} strokeWidth={3} /></>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
