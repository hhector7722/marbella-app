import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const PDFParser = require('pdf2json');

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required.');
  return createClient(url, key);
}

function parseEuroNumber(raw: string): number | null {
  // Acepta "11.814,03" o "11814,03" o "11 814,03"
  const s = String(raw ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n;
}

function ymdFromDmy(dmy: string): string | null {
  const m = String(dmy ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

function periodYmFromStartDate(startYmd: string): string {
  return startYmd.slice(0, 7);
}

export async function POST(request: Request) {
  try {
    const supabase = getServiceSupabase();
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
      pdfParser.on('pdfParser_dataError', (errData: any) =>
        reject(new Error(errData.parserError)),
      );
      pdfParser.on('pdfParser_dataReady', () => {
        try {
          resolve(decodeURIComponent(pdfParser.getRawTextContent()));
        } catch {
          resolve(pdfParser.getRawTextContent());
        }
      });
      pdfParser.parseBuffer(pdfBuffer);
    });

    // Periodo: "PAGA TOTAL DEL 01/02/2026 AL 28/02/2026"
    const periodMatch = textContent.match(
      /PAGA\s+TOTAL\s+DEL\s+(\d{2}\/\d{2}\/\d{4})\s+AL\s+(\d{2}\/\d{2}\/\d{4})/i,
    );
    if (!periodMatch) {
      return NextResponse.json(
        { error: 'No se detectó el periodo (PAGA TOTAL DEL .. AL ..)' },
        { status: 422 },
      );
    }

    const startYmd = ymdFromDmy(periodMatch[1]);
    const endYmd = ymdFromDmy(periodMatch[2]);
    if (!startYmd || !endYmd) {
      return NextResponse.json(
        { error: 'Periodo inválido en documento' },
        { status: 422 },
      );
    }

    // Total: línea "TOTAL EMPRESA ... 11.814,03" (última cifra de la línea suele ser COST TOTAL)
    const totalEmpresaLine = (() => {
      const lines = textContent.split(/\r?\n/);
      for (let i = lines.length - 1; i >= 0; i--) {
        const ln = lines[i];
        if (/TOTAL\s+EMPRESA/i.test(ln)) return ln;
      }
      return null;
    })();

    if (!totalEmpresaLine) {
      return NextResponse.json(
        { error: 'No se encontró la línea TOTAL EMPRESA' },
        { status: 422 },
      );
    }

    const numberCandidates = totalEmpresaLine.match(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/g) ?? [];
    if (numberCandidates.length === 0) {
      return NextResponse.json(
        { error: 'No se detectó ningún importe en la línea TOTAL EMPRESA' },
        { status: 422 },
      );
    }

    const totalCompanyCost = parseEuroNumber(numberCandidates[numberCandidates.length - 1]);
    if (totalCompanyCost === null) {
      return NextResponse.json(
        { error: 'No se pudo parsear el importe TOTAL EMPRESA' },
        { status: 422 },
      );
    }

    const periodYm = periodYmFromStartDate(startYmd);

    // Storage (auditable)
    const safeBase = String(filename).replace(/[^\w.\- ()]/g, '_');
    const storagePath = `payroll-summary/${periodYm}/${safeBase.endsWith('.pdf') ? safeBase : `${safeBase}.pdf`}`;

    const { error: storageError } = await supabase.storage
      .from('nominas')
      .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true });
    if (storageError) throw new Error(`Fallo Storage: ${storageError.message}`);

    // Upsert total mensual
    const { error: upsertError } = await supabase
      .from('payroll_monthly_totals')
      .upsert(
        {
          period_ym: periodYm,
          period_start: startYmd,
          period_end: endYmd,
          total_company_cost: totalCompanyCost,
          file_path: storagePath,
          email_date: emailDate ? String(emailDate) : null,
        },
        { onConflict: 'period_ym' },
      );

    if (upsertError) {
      throw new Error(`Fallo al registrar total de nóminas: ${upsertError.message}`);
    }

    return NextResponse.json(
      {
        success: true,
        periodYm,
        periodStart: startYmd,
        periodEnd: endYmd,
        totalCompanyCost,
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error('Error procesando nómina resumen:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 },
    );
  }
}

