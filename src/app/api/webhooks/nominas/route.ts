import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';

// Configuración obligatoria para que PDF.js funcione en el servidor (Node.js)
pdfjsLib.GlobalWorkerOptions.workerSrc = '';

// Cliente con Service Role Key para ignorar RLS en la subida inicial
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! 
);

export async function POST(req: NextRequest) {
  try {
    // 1. Validación de seguridad con Token Secreto
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { fileBase64, fileName, mesAnio } = await req.json();
    const pdfBuffer = Buffer.from(fileBase64, 'base64');

    // 2. Lectura del PDF (Extracción de texto puro)
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) });
    const pdf = await loadingTask.promise;
    let fullText = '';
    
    // Recorremos las páginas (normalmente las nóminas son de 1 sola página)
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map((item: any) => item.str).join(' ');
    }

    // 3. Identificación por DNI (Regex para España)
    const dniMatch = fullText.match(/\b[XYZ]?\d{7,8}[A-Z]\b/i);
    
    if (!dniMatch) {
      // Si no hay DNI, registramos el error en la tabla de excepciones
      await supabase.from('nominas_excepciones').insert({ 
        file_name: fileName, 
        error_log: 'DNI no encontrado físicamente en el PDF' 
      });
      return NextResponse.json({ error: 'DNI no detectado' }, { status: 400 });
    }

    const dniExtraido = dniMatch[0].toUpperCase();

    // 4. Buscar el UUID del empleado en tu base de datos
    // AJUSTA AQUÍ: Si tu tabla de empleados no se llama 'profiles', cámbialo.
    const { data: empleado, error: empError } = await supabase
      .from('profiles') 
      .select('id')
      .eq('dni', dniExtraido)
      .single();

    if (empError || !empleado) {
      await supabase.from('nominas_excepciones').insert({ 
        file_name: fileName, 
        error_log: `El DNI ${dniExtraido} no existe en la tabla de empleados.` 
      });
      return NextResponse.json({ error: 'Empleado no registrado' }, { status: 404 });
    }

    // 5. Subida al Storage Privado
    // Formato de ruta: UUID_EMPLEADO/MM-YYYY_NombreOriginal.pdf
    const storagePath = `${empleado.id}/${mesAnio}_${fileName}`;
    
    const { error: uploadError } = await supabase.storage
      .from('nominas_privado')
      .upload(storagePath, pdfBuffer, { 
        contentType: 'application/pdf',
        upsert: true 
      });

    if (uploadError) throw uploadError;

    // 6. Registro final en la tabla de nóminas
    const { error: dbError } = await supabase
      .from('nominas')
      .insert({
        empleado_id: empleado.id,
        mes_anio: mesAnio,
        file_path: storagePath
      });

    if (dbError) throw dbError;

    console.log(`✅ Nómina asignada correctamente al DNI: ${dniExtraido}`);
    return NextResponse.json({ success: true, dni: dniExtraido });

  } catch (error: any) {
    console.error('Error Crítico Webhook:', error.message);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}