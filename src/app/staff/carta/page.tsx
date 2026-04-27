import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/utils/supabase/server';
import { DigitalMenu } from '@/components/staff/DigitalMenu';
import { StaffCartaEditor } from '@/components/staff/StaffCartaEditor';

export default async function StaffCartaPage() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect('/login');
    }

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

    if (profileError) {
        console.error('Error fetching profile role (staff/carta):', profileError);
    }

    const role = (profile?.role ?? null) as string | null;
    const canEditMenu = role === 'manager' || role === 'admin' || role === 'supervisor';
    const homeHref = canEditMenu ? '/dashboard' : '/staff/dashboard';

    return (
        <div className="min-h-screen bg-[#5B8FB9] pb-24 pt-4">
            <div className="mx-auto w-full max-w-lg px-4 md:max-w-2xl">
                <div className="mb-4 flex shrink-0 items-center gap-2">
                    <Link
                        href={homeHref}
                        className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border border-zinc-100 bg-white p-3 text-[#36606F] shadow-sm active:scale-[0.98]"
                        aria-label="Volver al inicio"
                    >
                        <ArrowLeft className="h-5 w-5" strokeWidth={2.5} />
                    </Link>
                    <div className="min-w-0 flex-1 rounded-xl border border-zinc-100 bg-white px-4 py-3 shadow-sm">
                        <h1 className="text-xs font-black uppercase tracking-widest text-[#36606F]">La carta</h1>
                        <p className="truncate text-[10px] font-medium text-zinc-400">Platos y precios del TPV</p>
                    </div>
                    {canEditMenu ? <StaffCartaEditor canEdit={canEditMenu} /> : null}
                </div>

                <DigitalMenu />
            </div>
        </div>
    );
}
