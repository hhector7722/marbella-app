import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const PDFParser = require('pdf2json');

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

        if (!fileBase64 || !filename) {
            return NextResponse.json({ error: 'Payload incompleto' }, { status: 400 });
        }

        const pdfBuffer = Buffer.from(fileBase64, 'base64');

        const textContent = await new Promise<string>((resolve, reject) => {
            const pdfParser = new PDFParser(null, 1);
            pdfParser.on("pdfParser_dataError", (errData: any) => reject(new Error(errData.parserError)));
            pdfParser.on("pdfParser_dataReady", () => {
                try { resolve(decodeURIComponent(pdfParser.getRawTextContent())); }
                catch (e) { resolve(pdfParser.getRawTextContent()); }
            });
            pdfParser.parseBuffer(pdfBuffer);
        });

        // 🧠 Regex Evolucionado: Captura sin límites de palabra, acepta guiones, puntos, espacios y ceros extra
        const dniRegex = /(?:[XYZ][- \.]?[0-9]{7,8}[- \.]?[A-Z]|[0-9]{7,8}[- \.]?[A-Z])/gi;
        const potentialMatches = textContent.match(dniRegex) || [];

        let extractedDni = null;
        for (const rawMatch of potentialMatches) {
            // 1. Limpieza inicial: Quitar basura visual
            let cleanMatch = rawMatch.replace(/[- \.]/g, '').toUpperCase();

            // 2. Normalización de NIE: Si la gestoría añadió un 0 (Z01706686E), lo quitamos (Z1706686E)
            if (/^[XYZ]0\d{7}[A-Z]$/.test(cleanMatch)) {
                cleanMatch = cleanMatch.charAt(0) + cleanMatch.substring(2);
            }

            // 3. Normalización de DNI: Si falta un 0 inicial (1234567A), lo añadimos (01234567A)
            if (/^\d{7}[A-Z]$/.test(cleanMatch)) {
                cleanMatch = '0' + cleanMatch;
            }

            if (isValidDNI(cleanMatch)) {
                extractedDni = cleanMatch;
                break;
            }
        }

        if (!extractedDni) {
            return NextResponse.json({ error: 'No se detectó DNI/NIE matemáticamente válido en el texto' }, { status: 422 });
        }

        const { data: profile, error: dbError } = await supabase
            .from('profiles')
            .select('id, first_name, codigo_empleado')
            .eq('dni', extractedDni)
            .single();

        if (dbError || !profile) {
            return NextResponse.json({ error: `DNI ${extractedDni} no encontrado en perfiles activos` }, { status: 404 });
        }

        let mesDevengo = '';
        const emailDateObj = emailDate ? new Date(emailDate) : new Date();
        const emailTime = Number.isNaN(emailDateObj.getTime()) ? Date.now() : emailDateObj.getTime();
        let anioDevengo = new Date(emailTime).getFullYear();
        const filenameLower = filename.toLowerCase();
        const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

        for (const m of meses) {
            if (filenameLower.includes(m)) {
                mesDevengo = m;
                break;
            }
        }

        if (!mesDevengo) {
            const dateObj = new Date(emailTime);
            dateObj.setMonth(dateObj.getMonth() - 1);
            mesDevengo = dateObj.toLocaleString('es-ES', { month: 'long' }).toLowerCase();
        } else {
            if (new Date(emailTime).getMonth() === 0 && mesDevengo === 'diciembre') {
                anioDevengo -= 1;
            }
        }

        const monthNum = meses.indexOf(mesDevengo) + 1;
        const mesAnio = monthNum >= 1 && monthNum <= 12
            ? `${anioDevengo}-${String(monthNum).padStart(2, '0')}`
            : `${anioDevengo}-01`;

        const safeFilename = `${anioDevengo}_${mesDevengo}_${extractedDni}.pdf`;
        const storagePath = `${profile.id}/${safeFilename}`;

        const { error: storageError } = await supabase.storage
            .from('nominas')
            .upload(storagePath, pdfBuffer, {
                contentType: 'application/pdf',
                upsert: true
            });

        if (storageError) throw new Error(`Fallo Storage: ${storageError.message}`);

        // Registro en BD: la app lista nóminas desde `nominas` / `employee_documents`, no desde Storage solo.
        await supabase.from('nominas').delete().eq('file_path', storagePath);

        const { error: nominaRowError } = await supabase.from('nominas').insert({
            empleado_id: profile.id,
            mes_anio: mesAnio,
            file_path: storagePath
        });

        if (nominaRowError) {
            console.error('nominas insert tras webhook:', nominaRowError);
            throw new Error(`Fallo al registrar la nómina en base de datos: ${nominaRowError.message}`);
        }

        if (profile.codigo_empleado && String(profile.codigo_empleado).trim()) {
            await supabase.from('employee_documents').delete().eq('storage_path', storagePath);
            const { error: edError } = await supabase.from('employee_documents').insert({
                user_id: profile.id,
                codigo_empleado: String(profile.codigo_empleado).trim(),
                tipo: 'nomina',
                mes: mesDevengo,
                year: anioDevengo,
                filename: safeFilename,
                storage_path: storagePath
            });
            if (edError) {
                console.error('employee_documents insert (opcional) tras webhook:', edError);
            }
        }

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