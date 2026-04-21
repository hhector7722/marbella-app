import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        // 1. Barrera de Seguridad
        const authHeader = req.headers.get('authorization');
        if (authHeader !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { fileBase64, filename } = body;

        if (!fileBase64 || !filename) {
            return NextResponse.json({ error: 'Faltan parámetros requeridos' }, { status: 400 });
        }

        // ANTI-SILENT FAILURES: validar variables de entorno críticas
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const geminiKey = process.env.GEMINI_API_KEY;
        if (!supabaseUrl || !serviceRoleKey) {
            console.error('Webhook Albaranes: faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
            return NextResponse.json(
                { error: 'Configuración de base de datos incompleta' },
                { status: 500 }
            );
        }
        if (!geminiKey) {
            console.error('Webhook Albaranes: falta GEMINI_API_KEY');
            return NextResponse.json(
                { error: 'Configuración de API Gemini incompleta' },
                { status: 500 }
            );
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey);
        const buffer = Buffer.from(fileBase64, 'base64');
        const contentSha256 = createHash('sha256').update(buffer).digest('hex');
        const { data: dupByHash } = await supabase
            .from('purchase_invoices')
            .select('id')
            .eq('content_sha256', contentSha256)
            .maybeSingle();
        if (dupByHash?.id) {
            return NextResponse.json(
                { error: 'Documento duplicado (mismo fichero ya registrado).' },
                { status: 409 }
            );
        }

        // 2. Extracción Cognitiva (API Nativa de Gemini - Zero Dependency)
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
        const geminiPrompt = `
        Eres un auditor contable de hostelería. Analiza este albarán o factura en PDF y extrae los datos.
        IMPORTANTE: Devuelve ÚNICAMENTE un objeto JSON válido con esta estructura exacta, sin texto adicional ni bloques de código markdown:
        {
            "proveedor": "Nombre del proveedor",
            "numero_factura": "Identificador del documento",
            "fecha": "YYYY-MM-DD",
            "total": 0.00,
            "lineas": [
                { "nombre": "Nombre exacto del artículo", "cantidad": 0.000, "precio_unidad": 0.0000, "total_linea": 0.00 }
            ]
        }`;

        const geminiPayload = {
            contents: [{
                parts: [
                    { text: geminiPrompt },
                    { inline_data: { mime_type: "application/pdf", data: fileBase64 } }
                ]
            }],
            generationConfig: { response_mime_type: "application/json" }
        };

        const geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiPayload)
        });

        if (!geminiRes.ok) {
            const errText = await geminiRes.text();
            console.error('Webhook Albaranes: Gemini API error', errText);
            throw new Error(`Fallo en Gemini: ${errText}`);
        }

        const geminiData = await geminiRes.json();

        // ANTI-SILENT FAILURES: validar estructura de respuesta Gemini antes de usar
        const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText == null || typeof rawText !== 'string') {
            console.error('Webhook Albaranes: respuesta Gemini sin contenido extraíble', JSON.stringify(geminiData));
            return NextResponse.json(
                { error: 'La extracción cognitiva no devolvió datos válidos (candidates vacío o bloqueado)' },
                { status: 502 }
            );
        }

        let aiData: { proveedor?: string; numero_factura?: string; fecha?: string; total?: number; lineas?: Array<{ nombre?: string; cantidad?: number; precio_unidad?: number; total_linea?: number }> };
        try {
            aiData = JSON.parse(rawText);
        } catch (parseErr) {
            console.error('Webhook Albaranes: JSON inválido de Gemini', rawText, parseErr);
            return NextResponse.json(
                { error: 'La extracción cognitiva devolvió JSON inválido' },
                { status: 502 }
            );
        }

        const d = new Date();

        // 3. Coincidencia de proveedor y duplicado lógico (antes de subir el PDF a Storage)
        let matchedSupplierId = null;
        if (aiData.proveedor) {
            const searchTerm = aiData.proveedor.substring(0, 10).trim();
            if (searchTerm.length > 0) {
                const { data: supplierMatch, error: supplierError } = await supabase
                    .from('suppliers')
                    .select('id')
                    .ilike('name', `%${searchTerm}%`)
                    .limit(1)
                    .maybeSingle();

                if (supplierMatch && !supplierError) {
                    matchedSupplierId = supplierMatch.id;
                }
            }
        }

        const invoiceNumRaw = String(aiData.numero_factura ?? '').trim();
        const invoiceNum = invoiceNumRaw || 'DESCONOCIDO';
        const invoiceDateStr =
            typeof aiData.fecha === 'string' && aiData.fecha.trim()
                ? aiData.fecha.trim()
                : d.toISOString().split('T')[0];

        if (matchedSupplierId != null && invoiceNum !== 'DESCONOCIDO') {
            const { data: dupLogical } = await supabase
                .from('purchase_invoices')
                .select('id')
                .eq('supplier_id', matchedSupplierId)
                .eq('invoice_number', invoiceNum)
                .eq('invoice_date', invoiceDateStr)
                .maybeSingle();
            if (dupLogical?.id) {
                return NextResponse.json(
                    {
                        error:
                            'Ya consta un albarán con el mismo proveedor, número y fecha (documento duplicado).',
                    },
                    { status: 409 }
                );
            }
        }

        // 4. Subida al Bucket Privado 'albaranes'
        const filePath = `${d.getFullYear()}/${d.getMonth() + 1}/${Date.now()}_${filename}`;

        const { error: uploadError } = await supabase.storage
            .from('albaranes')
            .upload(filePath, buffer, { contentType: 'application/pdf' });

        if (uploadError) {
            console.error('Webhook Albaranes: error subida Storage', uploadError);
            throw uploadError;
        }

        // 5. Inserción de la Cabecera de la Factura
        const { data: invoice, error: invoiceError } = await supabase
            .from('purchase_invoices')
            .insert({
                supplier_id: matchedSupplierId,
                invoice_number: invoiceNum,
                invoice_date: invoiceDateStr,
                total_amount: aiData.total ?? 0,
                file_path: filePath,
                status: 'pending_mapping',
                content_sha256: contentSha256,
            })
            .select('id')
            .single();

        if (invoiceError) {
            console.error('Webhook Albaranes: error inserción purchase_invoices', invoiceError);
            throw invoiceError;
        }
        if (!invoice?.id) {
            console.error('Webhook Albaranes: inserción sin id devuelto');
            return NextResponse.json(
                { error: 'Error al guardar la cabecera del albarán (sin id)' },
                { status: 500 }
            );
        }

        // 6. Inserción de las Líneas Crudas
        if (aiData.lineas && aiData.lineas.length > 0) {
            const linesToInsert = aiData.lineas.map((line: { nombre?: string; cantidad?: number; precio_unidad?: number; total_linea?: number }) => ({
                invoice_id: invoice.id,
                original_name: line.nombre ?? 'Sin nombre',
                quantity: line.cantidad ?? 0,
                unit_price: line.precio_unidad ?? 0,
                total_price: line.total_linea ?? 0,
                status: 'pending'
            }));

            const { error: linesError } = await supabase
                .from('purchase_invoice_lines')
                .insert(linesToInsert);

            if (linesError) {
                console.error('Webhook Albaranes: error inserción líneas', linesError);
                throw linesError;
            }
        }

        return NextResponse.json({ success: true, message: 'Albarán extraído cognitivamente' });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Error interno';
        console.error('Webhook Albaranes Error Crítico:', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}