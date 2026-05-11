import { NextResponse } from 'next/server'

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT DEPRECADO (2026-05-11)
//
// La vía de entrada de albaranes por email (Google Apps Script enviando PDFs
// adjuntos a este webhook) queda retirada. Operativa actual: una sola vía,
// el escáner in-app `/dashboard/scanner` que sí garantiza:
//   - proveedor seleccionado por el usuario (sin match probabilístico),
//   - recepción física confirmada por el operario,
//   - ningún solapamiento con facturas mensuales recapitulativas
//     (evita duplicado de stock en `stock_movements`).
//
// El trigger temporal del Apps Script ya fue eliminado por el usuario.
// Este endpoint queda como salvaguarda: cualquier llamada externa antigua
// recibe 410 Gone con un mensaje claro. No se procesa ni se inserta nada
// en la base de datos.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST() {
    return NextResponse.json(
        {
            error:
                'Endpoint retirado. La captura de albaranes por email está desactivada; usa el escáner in-app en /dashboard/scanner.',
            deprecated: true,
        },
        { status: 410 }
    )
}

export async function GET() {
    return NextResponse.json(
        {
            error: 'Endpoint retirado. Usa el escáner in-app.',
            deprecated: true,
        },
        { status: 410 }
    )
}
