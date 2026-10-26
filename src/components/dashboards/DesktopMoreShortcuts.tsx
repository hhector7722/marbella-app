'use client';

import { useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import DashboardShortcut from '@/components/dashboards/DashboardShortcut';
import { HomeScreenSlot } from '@/components/dashboards/HomeScreen';

export type DesktopMoreShortcutItem = {
    label: string;
    instance: string;
    img?: string;
    icon?: LucideIcon;
} & ({ href: string } | { action: string });

/**
 * Accesos del catálogo «Otros» visibles directamente en el mosaico escritorio.
 * La fuente es el mismo array que usa el modal en móvil: sin listas duplicadas.
 */
export function DesktopMoreShortcuts({
    items,
    namespace,
    onAction,
}: {
    items: readonly DesktopMoreShortcutItem[];
    namespace: 'admin' | 'master';
    onAction: (action: string) => void;
}) {
    const router = useRouter();

    return (
        <>
            {items.map(item => (
                <HomeScreenSlot
                    key={item.instance}
                    size="icon"
                    instance={`${namespace}-extra-${item.instance}`}
                    className="home-desktop-extra"
                >
                    <DashboardShortcut
                        instance={`${namespace}-desktop-${item.instance}`}
                        label={item.label}
                        img={item.img}
                        icon={item.icon}
                        onClick={() => {
                            if ('href' in item) router.push(item.href);
                            else onAction(item.action);
                        }}
                    />
                </HomeScreenSlot>
            ))}
        </>
    );
}
