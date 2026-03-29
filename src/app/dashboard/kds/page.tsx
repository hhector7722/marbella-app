import KDSView from '@/components/kds/KDSView';

export const metadata = {
    title: 'Monitor de Cocina (KDS) | Bar La Marbella',
    description: 'Sistema de gestión de comandas en tiempo real para Bar La Marbella.',
};

export default function KDSPage() {
    return (
        <main className="h-screen overflow-hidden">
            <KDSView />
        </main>
    );
}
