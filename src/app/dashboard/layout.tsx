'use client';

import React from 'react';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // Hemos movido la navegación a la Navbar global en app/layout.tsx
    // Este layout ahora solo sirve como contenedor para las páginas de gestión.

    return (
        <main className="w-full">
            {children}
        </main>
    );
}