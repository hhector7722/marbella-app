'use client';

import React from 'react';
import { Toaster } from 'sonner';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // Hemos movido la navegación a la Navbar global en app/layout.tsx
    // Este layout ahora solo sirve como contenedor para las páginas de gestión.

    return (
        <main className="w-full">
            <Toaster position="top-center" richColors closeButton />
            {children}
        </main>
    );
}