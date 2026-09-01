'use client';

import { useState, useEffect } from 'react';
import { createClient } from "@/utils/supabase/client";
import { Mail, Lock, ArrowRight } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import Image from 'next/image';
import { toast, Toaster } from 'sonner';
import type { AuthError } from '@supabase/supabase-js';
import { trackUsageLogin } from '@/lib/usage/client';

const PASSWORD_RECOVERY_REDIRECT = 'https://marbella-app.vercel.app/profile';
const RECOVERY_COOLDOWN_SECONDS = 60;
const GENERIC_RECOVERY_MESSAGE = 'Si el correo existe, te enviamos un enlace para restablecer tu contraseña.';

function getErrorMessage(error: unknown, fallback: string) {
    if (error && typeof error === 'object' && 'message' in error) {
        const message = (error as AuthError).message;
        if (typeof message === 'string' && message.trim()) {
            return message;
        }
    }

    return fallback;
}

function extractRetrySeconds(errorMessage: string): number | null {
    const match = errorMessage.match(/after\s+(\d+)\s+seconds/i);
    if (!match) return null;

    const seconds = Number.parseInt(match[1], 10);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

export default function LoginPage() {
    const supabase = createClient();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingReset, setLoadingReset] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const boot = async () => {
            const { error } = await supabase.auth.getSession();
            if (cancelled || !error) return;
            const message = error.message ?? '';
            if (/refresh token not found|invalid refresh token/i.test(message)) {
                await supabase.auth.signOut();
            }
        };
        void boot();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (cooldown <= 0) return;

        const intervalId = window.setInterval(() => {
            setCooldown((currentCooldown) => {
                if (currentCooldown <= 1) {
                    window.clearInterval(intervalId);
                    return 0;
                }

                return currentCooldown - 1;
            });
        }, 1000);

        return () => window.clearInterval(intervalId);
    }, [cooldown]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!email || !password) {
            toast.error("Introduce credenciales completas");
            return;
        }

        try {
            setLoading(true);

            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;
            if (!data.session) {
                throw new Error('No se pudo abrir la sesión');
            }

            await supabase.auth.getSession();
            trackUsageLogin('/login');
            toast.success("Acceso concedido");
            // Recarga completa: las cookies de sesión van en el siguiente request.
            // En local, la navegación cliente a inicio se queda en /login.
            window.location.replace('/');
            return;

        } catch (error: unknown) {
            console.error('Login error:', error);
            toast.error(getErrorMessage(error, "Error al iniciar sesión"));
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordReset = async () => {
        if (loadingReset || cooldown > 0) {
            return;
        }

        if (!email.trim()) {
            toast.error('Introduce tu email para recuperar la contraseña');
            return;
        }

        try {
            setLoadingReset(true);
            setStatusMessage(null);
            setErrorMessage(null);
            const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
                redirectTo: PASSWORD_RECOVERY_REDIRECT,
            });

            if (error) throw error;

            setStatusMessage(GENERIC_RECOVERY_MESSAGE);
            setCooldown(RECOVERY_COOLDOWN_SECONDS);
        } catch (error: unknown) {
            console.error('Password recovery error:', error);
            const rawMessage = getErrorMessage(error, 'Unexpected password recovery error');
            const retryAfterSeconds = extractRetrySeconds(rawMessage);

            if (retryAfterSeconds) {
                setCooldown(retryAfterSeconds);
                setErrorMessage(`Espera ${retryAfterSeconds} segundos antes de volver a intentarlo.`);
            } else {
                setErrorMessage('No pudimos procesar la solicitud. Inténtalo de nuevo en un momento.');
            }
        } finally {
            setLoadingReset(false);
        }
    };

    const recoveryButtonLabel = loadingReset
        ? 'Enviando...'
        : cooldown > 0
            ? `Reenviar en ${cooldown}s`
            : 'Enviar enlace de recuperación';

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <Toaster position="top-center" />

            {/* Tarjeta Flotante Estilo "La Marbella" */}
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden p-8 md:p-12 animate-in fade-in zoom-in duration-300">

                {/* Cabecera */}
                <div className="flex flex-col items-center mb-10">
                    <div className="relative w-32 h-32 mb-4 bg-white rounded-full p-2 border border-gray-100">
                        <Image
                            src="/icons/logo-white.png"
                            alt="Logo"
                            fill
                            className="object-contain"
                            priority
                        />
                    </div>
                </div>

                {/* Formulario */}
                <form onSubmit={handleLogin} className="space-y-6">

                    <div className="space-y-4">
                        {/* Input Email */}
                        <div className="relative group">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#5B8FB9] transition-colors">
                                <Mail className="w-5 h-5" />
                            </div>
                            <input
                                type="email"
                                placeholder="usuario@lamarbella.com"
                                value={email}
                                onChange={(e) => {
                                    setEmail(e.target.value);
                                    setErrorMessage(null);
                                    setStatusMessage(null);
                                }}
                                className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-[#5B8FB9] rounded-2xl outline-none text-gray-700 font-bold placeholder:text-gray-300 transition-all focus:bg-white"
                                disabled={loading || loadingReset}
                            />
                        </div>

                        {/* Input Password */}
                        <div className="relative group">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#5B8FB9] transition-colors">
                                <Lock className="w-5 h-5" />
                            </div>
                            <input
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-[#5B8FB9] rounded-2xl outline-none text-gray-700 font-bold placeholder:text-gray-300 transition-all focus:bg-white"
                                disabled={loading || loadingReset}
                            />
                        </div>
                    </div>

                    <div className="space-y-3">
                        <button
                            type="button"
                            onClick={handlePasswordReset}
                            disabled={loadingReset || cooldown > 0}
                            className="w-full min-h-[48px] rounded-2xl border border-[#36606F]/15 bg-[#36606F]/5 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-[#36606F] transition-colors hover:bg-[#36606F]/10 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {recoveryButtonLabel}
                        </button>

                        {statusMessage && (
                            <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[11px] font-bold leading-relaxed text-emerald-700">
                                {statusMessage}
                            </p>
                        )}

                        {errorMessage && (
                            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] font-bold leading-relaxed text-amber-700">
                                {errorMessage}
                            </p>
                        )}
                    </div>

                    {/* Botón Acción */}
                    <button
                        type="submit"
                        disabled={loading || loadingReset}
                        className="w-full bg-[#36606F] hover:bg-[#2A4D59] text-white font-black py-4 rounded-2xl shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:hover:scale-100"
                    >
                        {loading ? (
                            <LoadingSpinner size="sm" className="text-white" />
                        ) : (
                            <>
                                ENTRAR AL SISTEMA
                                <ArrowRight className="w-5 h-5" />
                            </>
                        )}
                    </button>
                </form>

                {/* Footer eliminado */}
            </div>
        </div>
    );
}
