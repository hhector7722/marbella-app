'use client';

import { useEffect, useState } from 'react';
import { createClient } from "@/utils/supabase/client";
import { User, Mail, Shield, Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ProfilePage() {
    const supabase = createClient();
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [email, setEmail] = useState('');

    useEffect(() => {
        const getProfile = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setEmail(user.email || '');
                const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
                setProfile(data);
            }
            setLoading(false);
        };
        getProfile();
    }, []);

    if (loading) return <div className="flex h-screen items-center justify-center text-white"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="p-6 md:p-10 w-full max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold text-white mb-8">Mi Cuenta</h1>

            {/* Tarjeta de Perfil */}
            <div className="bg-white rounded-[2rem] shadow-xl p-8 relative overflow-hidden">

                <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-r from-[#5B8FB9] to-[#36606F] opacity-20"></div>

                <div className="relative flex flex-col items-center">
                    {/* Avatar Grande */}
                    <div className="w-24 h-24 rounded-full bg-white border-4 border-white shadow-lg mb-4 flex items-center justify-center overflow-hidden relative group cursor-pointer">
                        {profile?.avatar_url ? (
                            <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <User className="w-10 h-10 text-gray-300" />
                        )}
                        {/* Overlay para subir foto (Futuro) */}
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Camera className="text-white w-6 h-6" />
                        </div>
                    </div>

                    <h2 className="text-2xl font-black text-gray-800">
                        {profile?.first_name || 'Sin Nombre'} {profile?.last_name || ''}
                    </h2>
                    <div className="flex items-center gap-2 mt-2 bg-blue-50 px-3 py-1 rounded-full">
                        <Shield className="w-3 h-3 text-blue-600" />
                        <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">
                            {profile?.role || 'Staff'}
                        </span>
                    </div>
                </div>

                {/* Datos */}
                <div className="mt-8 space-y-4">
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                        <label className="text-xs font-bold text-gray-400 uppercase">Email Acceso</label>
                        <div className="flex items-center gap-3 mt-1">
                            <Mail className="w-4 h-4 text-gray-500" />
                            <span className="font-medium text-gray-700">{email}</span>
                        </div>
                    </div>

                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                        <label className="text-xs font-bold text-gray-400 uppercase">ID Sistema</label>
                        <code className="text-xs font-mono text-gray-500 block mt-1 break-all">
                            {profile?.id}
                        </code>
                    </div>
                </div>

                <div className="mt-8 text-center text-xs text-gray-400">
                    La edición de perfil estará disponible próximamente.
                </div>
            </div>
        </div>
    );
}