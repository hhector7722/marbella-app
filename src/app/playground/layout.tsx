import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { withTimeout } from '@/lib/with-timeout';
import PlaygroundShell from './_components/PlaygroundShell';

export default async function PlaygroundLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = await createClient();

    const sessionResult = await withTimeout(
        supabase.auth.getSession(),
        1500,
        { data: { session: null }, error: null },
    );
    
    const user = sessionResult.data.session?.user ?? null;
    
    if (!user) {
        redirect('/login');
    }

    const email = user.email ?? '';
    if (!isMasterDashboardUser(email)) {
        redirect('/dashboard');
    }

    return (
        <div className="min-h-screen bg-black text-white selection:bg-white/30">
            <PlaygroundShell />
            <div className="pt-20 pb-20 px-4 md:px-8 max-w-[1400px] mx-auto">
                {children}
            </div>
        </div>
    );
}
