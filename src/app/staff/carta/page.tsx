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
        <div className="min-h-screen bg-zinc-100">
            <div className="mx-auto w-full max-w-4xl px-5 pb-12 pt-8 md:px-10 md:pb-16 md:pt-10">
                <header className="mb-8 grid grid-cols-3 items-center gap-2 pb-2 pt-1">
                    <div className="flex justify-start">
                        <Link
                            href={homeHref}
                            className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl text-[#36606F] transition-colors hover:bg-zinc-200/60 active:bg-zinc-200"
                            aria-label="Volver al inicio"
                        >
                            <ArrowLeft className="h-5 w-5" strokeWidth={2.5} />
                        </Link>
                    </div>
                    <div className="flex justify-center">
                        <span className="text-xs font-black uppercase tracking-widest text-[#36606F]">
                            La carta
                        </span>
                    </div>
                    <div className="flex justify-end">
                        {canEditMenu ? (
                            <StaffCartaEditor canEdit={canEditMenu} />
                        ) : (
                            <span className="inline-flex min-h-[48px] min-w-[48px]" aria-hidden />
                        )}
                    </div>
                </header>

                <DigitalMenu />
            </div>
        </div>
    );
}
