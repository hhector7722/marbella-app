'use client';

import { useState, useEffect } from 'react';
import { createClient } from "@/utils/supabase/client";
import { useRouter } from 'next/navigation';
import { Mail, Lock, ArrowRight } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import Image from 'next/image';
import { toast, Toaster } from 'sonner';

export default function LoginPage() {
    const supabase = createClient();
    const router = useRouter();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    // Limpieza de tokens zombi: si hay un refresh_token inválido en el navegador
    // Supabase lanza AuthApiError en cada request. Hacemos signOut silencioso al montar.
    useEffect(() => {
        const cleanZombieSession = async () => {
            const { error } = await supabase.auth.getSession();
            if (error) {
                console.warn('[LOGIN] Sesión corrupta detectada. Limpiando tokens...');
                await supabase.auth.signOut();
            }
        };
        cleanZombieSession();
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!email || !password) {
            toast.error("Introduce credenciales completas");
            return;
        }

        try {
            setLoading(true);

            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;

            toast.success("Acceso concedido");
            router.push('/');
            router.refresh(); // Forzar actualización de estado de auth en la app

        } catch (error: any) {
            console.error('Login error:', error);
            toast.error(error.message || "Error al iniciar sesión");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#5B8FB9] flex items-center justify-center p-4">
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
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-[#5B8FB9] rounded-2xl outline-none text-gray-700 font-bold placeholder:text-gray-300 transition-all focus:bg-white"
                                disabled={loading}
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
                                disabled={loading}
                            />
                        </div>
                    </div>

                    {/* Botón Acción */}
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-[#5B8FB9] hover:bg-[#2A4D59] text-white font-black py-4 rounded-2xl shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:hover:scale-100"
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