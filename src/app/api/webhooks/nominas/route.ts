import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Importación nativa (ignorada por el bundler gracias a next.config)
const pdfParse = require('pdf-parse');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function isValidDNI(dni: string): boolean {
    const validChars = 'TRWAGMYFPDXBNJZSQVHLCKE';
    const regex = /^[XYZ]?\d{7,8}[A-Z]$/i;

    if (!regex.test(dni)) return false;

    let str = dni.toUpperCase();
    let letter = str.slice(-1);
    let numberStr = str.slice(0, -1);

    numberStr = numberStr.replace('X', '0').replace('Y', '1').replace('Z', '2');

    const number = parseInt(numberStr, 10);
    const calculatedLetter = validChars.charAt(number % 23);

    return letter === calculatedLetter;
}

export async function POST(request: Request) {
    try {
        const authHeader = request.headers.get('authorization');
        if (authHeader !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { fileBase64, filename, emailDate } = await request.json();

        if (!fileBase64) {
            return NextResponse.json({ error: 'Payload incompleto' }, { status: 400 });
        }

        // El motor ahora leerá el PDF intacto sin reventar
        const pdfBuffer = Buffer.from(fileBase64, 'base64');
        const pdfData = await pdfParse(pdfBuffer);
        const textContent = pdfData.text;

        const dniRegex = /\b([0-9]{8}[A-Z]|[XYZ][0-9]{7}[A-Z])\b/gi;
        const potentialMatches = textContent.match(dniRegex) || [];

        let extractedDni = null;
        for (const match of potentialMatches) {
            if (isValidDNI(match)) {
                extractedDni = match.toUpperCase();
                break;
            }
        }

        if (!extractedDni) {
            return NextResponse.json({ error: 'No se detectó DNI/NIE matemáticamente válido en el texto' }, { status: 422 });
        }

        const { data: profile, error: dbError } = await supabase
            .from('profiles')
            .select('id, first_name')
            .eq('dni', extractedDni)
            .single();

        if (dbError || !profile) {
            return NextResponse.json({ error: `DNI ${extractedDni} no encontrado en perfiles activos` }, { status: 404 });
        }

        const dateObj = new Date(emailDate);
        dateObj.setMonth(dateObj.getMonth() - 1);
        const mesDevengo = dateObj.toLocaleString('es-ES', { month: 'long' });
        const anioDevengo = dateObj.getFullYear();

        const safeFilename = `${anioDevengo}_${mesDevengo}_${extractedDni}.pdf`;
        const { error: storageError } = await supabase.storage
            .from('nominas')
            .upload(`${profile.id}/${safeFilename}`, pdfBuffer, {
                contentType: 'application/pdf',
                upsert: true
            });

        if (storageError) throw new Error(`Fallo Storage: ${storageError.message}`);

        return NextResponse.json({
            success: true,
            empleado: profile.first_name,
            dni: extractedDni,
            periodo: `${mesDevengo} ${anioDevengo}`
        }, { status: 200 });

    } catch (error: any) {
        console.error('Error procesando nómina:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}