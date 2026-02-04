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
        <div className="min-h-screen bg-[#5B8FB9]">
            {/* El contenido se renderiza directamente. 
               La Navbar ya es 'sticky' y está definida en el RootLayout,
               por lo que children aparecerá justo debajo.
            */}
            <main className="w-full">
                {children}
            </main>
        </div>
    );
}