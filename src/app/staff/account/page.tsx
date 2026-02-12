'use client';

import { useEffect, useState, Suspense } from 'react';
import { createClient } from "@/utils/supabase/client";
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Image from 'next/image';

import {
    User, LogOut, Lock, ArrowLeft, CheckCircle2, ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface UserProfile {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
}

function AccountContent() {
    const supabase = createClient();
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState<UserProfile | null>(null);

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                setLoading(false);
                return;
            }

            const { data, error } = await supabase
                .from('profiles')
                .select('id, first_name, last_name, avatar_url')
                .eq('id', user.id)
                .single();

            if (error) throw error;
            setProfile(data);
        } catch (error) {
            console.error('Error loading profile:', error);
            toast.error('Error al cargar la información');
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        if (!confirm("¿Seguro que quieres cerrar sesión?")) return;
        const { error } = await supabase.auth.signOut();
        if (error) {
            toast.error('Error al salir');
        } else {
            router.push('/login');
            router.refresh();
        }
    };

    const handleChangePassword = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
            const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
                redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
            });
            if (error) {
                toast.error('Error al enviar el correo');
            } else {
                toast.success('Se ha enviado un correo para restablecer tu contraseña');
            }
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#36606F] flex flex-col items-center justify-center p-4">
                <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin mb-4"></div>
                <p className="text-white/80 font-black uppercase tracking-widest text-[10px] animate-pulse">Cargando configuración...</p>
            </div>
        );
    }

    if (!profile) return null;

    const fullName = `${profile.first_name} ${profile.last_name || ''}`;

    return (
        <div className="min-h-screen bg-[#36606F] p-4 md:p-6 pb-24">
            <div className="max-w-xl mx-auto">
                <div className="bg-white rounded-[2.5rem] shadow-2xl relative overflow-hidden flex flex-col min-h-[85vh]">

                    {/* ENCABEZADO CORPORATIVO SÓLIDO (Relicando /profile) */}
                    <div className="bg-[#36606F] p-8 pt-10 text-white relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4 blur-3xl pointer-events-none"></div>

                        <div className="relative z-10 flex flex-col items-center text-center">
                            <div className="w-28 h-28 rounded-[2rem] bg-white p-1.5 shadow-2xl mb-6 relative group transform -rotate-3 hover:rotate-0 transition-transform duration-500">
                                <div className="w-full h-full rounded-[1.6rem] bg-gray-50 flex items-center justify-center overflow-hidden relative border border-gray-100">
                                    {profile.avatar_url ? (
                                        <Image src={profile.avatar_url} alt={fullName} fill className="object-cover" />
                                    ) : (
                                        <img src="/icons/profile.png" alt={fullName} className="w-full h-full object-cover" />
                                    )}
                                </div>
                                <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-white w-10 h-10 rounded-xl border-4 border-white flex items-center justify-center shadow-lg">
                                    <CheckCircle2 size={16} />
                                </div>
                            </div>

                            <h1 className="text-3xl font-black tracking-tighter mb-1">{fullName}</h1>
                            <p className="text-[10px] text-white/60 font-black uppercase tracking-[0.2em]">Configuración de Cuenta</p>
                        </div>

                        <button
                            onClick={() => router.back()}
                            className="absolute top-6 left-6 w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90"
                        >
                            <ArrowLeft size={20} />
                        </button>
                    </div>

                    {/* CONTENIDO ACCIONES */}
                    <div className="flex-1 p-8 space-y-4">
                        <button
                            onClick={handleChangePassword}
                            className="w-full flex items-center justify-between p-6 bg-white border border-gray-100 rounded-3xl shadow-sm hover:shadow-md hover:bg-gray-50 transition-all group active:scale-[0.98]"
                        >
                            <div className="flex items-center gap-5">
                                <div className="bg-[#36606F]/10 p-4 rounded-2xl text-[#36606F] group-hover:bg-[#36606F] group-hover:text-white transition-all duration-300">
                                    <Lock size={24} strokeWidth={2.5} />
                                </div>
                                <div className="text-left">
                                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.15em] mb-1">Seguridad</p>
                                    <p className="text-gray-800 font-black text-sm tracking-tight">Cambiar Contraseña</p>
                                </div>
                            </div>
                            <ChevronRight size={20} className="text-gray-300 group-hover:text-[#36606F] transition-colors" />
                        </button>

                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center justify-between p-6 bg-white border border-rose-50 rounded-3xl shadow-sm hover:shadow-md hover:bg-rose-50 transition-all group active:scale-[0.98]"
                        >
                            <div className="flex items-center gap-5">
                                <div className="bg-rose-500/10 p-4 rounded-2xl text-rose-500 group-hover:bg-rose-500 group-hover:text-white transition-all duration-300">
                                    <LogOut size={24} strokeWidth={2.5} />
                                </div>
                                <div className="text-left">
                                    <p className="text-[10px] text-rose-300 font-black uppercase tracking-[0.15em] mb-1">Sesión</p>
                                    <p className="text-rose-600 font-black text-sm tracking-tight">Cerrar Sesión Corporativa</p>
                                </div>
                            </div>
                            <ChevronRight size={20} className="text-rose-200 group-hover:text-rose-500 transition-colors" />
                        </button>
                    </div>

                    {/* PIE DE PÁGINA */}
                    <div className="p-8 text-center bg-gray-50/50 border-t border-gray-100">
                        <p className="text-[9px] font-black text-gray-300 uppercase tracking-[0.3em]">Bar La Marbella v2.0</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function AccountPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#36606F] flex flex-col items-center justify-center p-4">
                <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin mb-4"></div>
                <p className="text-white/80 font-black uppercase tracking-widest text-[10px] animate-pulse">Cargando...</p>
            </div>
        }>
            <AccountContent />
        </Suspense>
    );
}
