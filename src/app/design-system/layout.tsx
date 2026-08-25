import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { withTimeout } from '@/lib/with-timeout';
import './studio.css';

export const metadata = {
    title: 'Design System · estudio visual',
};

export default async function DesignSystemLayout({
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

    return <>{children}</>;
}
