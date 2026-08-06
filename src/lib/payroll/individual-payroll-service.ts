import { type SupabaseClient } from '@supabase/supabase-js';

// @ts-ignore
import PDFParser from 'pdf2json';

export function isValidDNI(dni: string): boolean {
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

export type ProcessIndividualPayrollResult = {
    success: boolean;
    empleado?: string;
    dni?: string;
    periodo?: string;
    error?: string;
    details?: string;
    storagePath?: string;
};

export async function processIndividualPayroll(
    pdfBuffer: Buffer,
    filename: string,
    emailDate: string | null | undefined,
    extractedDni: string | null | undefined,
    supabase: SupabaseClient
): Promise<ProcessIndividualPayrollResult> {
    try {
        let resolvedDni: string | null = null;
        
        if (typeof extractedDni === 'string') {
            const clean = extractedDni.replace(/[- \.]/g, '').toUpperCase();
            if (isValidDNI(clean)) resolvedDni = clean;
        }

        if (!resolvedDni) {
            const textContent = await new Promise<string>((resolve, reject) => {
                const pdfParser = new PDFParser(null as any, 1 as any);
                pdfParser.on("pdfParser_dataError", (errData: any) => reject(new Error(errData.parserError)));
                pdfParser.on("pdfParser_dataReady", () => {
                    try { resolve(decodeURIComponent(pdfParser.getRawTextContent())); }
                    catch (e) { resolve(pdfParser.getRawTextContent()); }
                });
                pdfParser.parseBuffer(pdfBuffer);
            });

            // Regex Evolucionado: Captura sin límites de palabra, acepta guiones, puntos, espacios y ceros extra
            const dniRegex = /(?:[XYZ][- \.]?[0-9]{7,8}[- \.]?[A-Z]|[0-9]{7,8}[- \.]?[A-Z])/gi;
            const potentialMatches = textContent.match(dniRegex) || [];

            for (const rawMatch of potentialMatches) {
                let cleanMatch = rawMatch.replace(/[- \.]/g, '').toUpperCase();

                if (/^[XYZ]0\d{7}[A-Z]$/.test(cleanMatch)) {
                    cleanMatch = cleanMatch.charAt(0) + cleanMatch.substring(2);
                }

                if (/^\d{7}[A-Z]$/.test(cleanMatch)) {
                    cleanMatch = '0' + cleanMatch;
                }

                if (isValidDNI(cleanMatch)) {
                    resolvedDni = cleanMatch;
                    break;
                }
            }
        }

        if (!resolvedDni) {
            return { success: false, error: 'No se detectó DNI/NIE matemáticamente válido (ni en payload ni en PDF)' };
        }

        const { data: profile, error: dbError } = await supabase
            .from('profiles')
            .select('id, first_name, codigo_empleado')
            .eq('dni', resolvedDni)
            .single();

        if (dbError || !profile) {
            return { success: false, error: `DNI ${resolvedDni} no encontrado en perfiles activos` };
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

        const safeDni = (extractedDni || resolvedDni).replace(/[^a-zA-Z0-9]/g, '');
        const safeFilename = `${anioDevengo}_${mesDevengo}_${safeDni}.pdf`;
        const storagePath = `${profile.id}/${safeFilename}`;

        const { error: storageError } = await supabase.storage
            .from('nominas')
            .upload(storagePath, pdfBuffer, {
                contentType: 'application/pdf',
                upsert: true
            });

        if (storageError) {
            return { success: false, error: `Fallo Storage: ${storageError.message}` };
        }

        await supabase.from('nominas').delete().eq('file_path', storagePath);

        const { error: nominaRowError } = await supabase.from('nominas').insert({
            empleado_id: profile.id,
            mes_anio: mesAnio,
            file_path: storagePath
        });

        if (nominaRowError) {
            console.error('nominas insert tras webhook:', nominaRowError);
            return { success: false, error: `Fallo al registrar la nómina en base de datos: ${nominaRowError.message}` };
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

        return {
            success: true,
            empleado: profile.first_name,
            dni: resolvedDni,
            periodo: `${mesDevengo} ${anioDevengo}`,
            storagePath
        };

    } catch (error: any) {
        console.error('Error procesando nómina:', error);
        return { success: false, error: 'Internal Server Error', details: error.message };
    }
}
