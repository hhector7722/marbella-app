import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  PAYROLL_SUMMARY_PARSER_VERSION,
  parseCompanySummaryText,
} from '@/lib/payroll/company-summary-parser';
import { hashPayrollPdf } from '@/lib/payroll/content-hash';

// pdf2json es CJS; mismo patrón que el productor histórico.
const PDFParser = require('pdf2json');

const SOURCE = 'gmail_summary';

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required.');
  return createClient(url, key);
}

async function extractPdfText(pdfBuffer: Buffer): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const pdfParser = new PDFParser(null, 1);
    pdfParser.on('pdfParser_dataError', (errData: { parserError?: string }) =>
      reject(new Error(errData.parserError ?? 'pdf2json error')),
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
}

type ImportStatus =
  | 'imported'
  | 'skipped_duplicate'
  | 'rejected_validation'
  | 'rectification_pending'
  | 'error';

async function recordImportRun(
  supabase: SupabaseClient,
  row: {
    status: ImportStatus;
    content_hash?: string | null;
    filename?: string | null;
    period_ym?: string | null;
    period_start?: string | null;
    period_end?: string | null;
    amount_detected?: number | null;
    amount_selected?: number | null;
    candidates?: number[];
    label_used?: string | null;
    validation_messages?: string[];
    error_message?: string | null;
  },
) {
  const { error } = await supabase.from('payroll_import_runs').insert({
    source: SOURCE,
    parser_version: PAYROLL_SUMMARY_PARSER_VERSION,
    content_hash: row.content_hash ?? null,
    filename: row.filename ?? null,
    period_ym: row.period_ym ?? null,
    period_start: row.period_start ?? null,
    period_end: row.period_end ?? null,
    amount_detected: row.amount_detected ?? null,
    amount_selected: row.amount_selected ?? null,
    candidates: row.candidates ?? [],
    label_used: row.label_used ?? null,
    status: row.status,
    validation_messages: row.validation_messages ?? [],
    error_message: row.error_message ?? null,
  });
  if (error) {
    console.error('[nominas-summary] fallo audit insert:', error.message);
  }
}

export async function POST(request: Request) {
  const supabase = getServiceSupabase();
  let filenameForAudit: string | null = null;
  let contentHash: string | null = null;

  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { fileBase64, filename, emailDate } = await request.json();
    if (!fileBase64 || !filename) {
      await recordImportRun(supabase, {
        status: 'rejected_validation',
        error_message: 'Payload incompleto',
        validation_messages: ['fileBase64/filename requeridos'],
      });
      return NextResponse.json({ error: 'Payload incompleto' }, { status: 400 });
    }

    filenameForAudit = String(filename);
    const pdfBuffer = Buffer.from(fileBase64, 'base64');
    contentHash = hashPayrollPdf(pdfBuffer);

    // Duplicado exacto (mismo PDF ya importado o ya en SSOT)
    const { data: existingByHash } = await supabase
      .from('payroll_monthly_totals')
      .select('period_ym, total_company_cost, content_hash')
      .eq('content_hash', contentHash)
      .maybeSingle();

    if (existingByHash) {
      await recordImportRun(supabase, {
        status: 'skipped_duplicate',
        content_hash: contentHash,
        filename: filenameForAudit,
        period_ym: existingByHash.period_ym,
        amount_selected: Number(existingByHash.total_company_cost),
        validation_messages: [
          'PDF con mismo content_hash ya presente en payroll_monthly_totals',
        ],
        error_message: 'duplicate_content_hash',
      });
      return NextResponse.json(
        {
          success: true,
          skipped: true,
          reason: 'duplicate_content_hash',
          periodYm: existingByHash.period_ym,
          totalCompanyCost: Number(existingByHash.total_company_cost),
          contentHash,
          parserVersion: PAYROLL_SUMMARY_PARSER_VERSION,
        },
        { status: 200 },
      );
    }

    const textContent = await extractPdfText(pdfBuffer);
    const parsed = parseCompanySummaryText(textContent);

    if (!parsed.ok) {
      await recordImportRun(supabase, {
        status: 'rejected_validation',
        content_hash: contentHash,
        filename: filenameForAudit,
        period_ym: parsed.periodYm ?? null,
        period_start: parsed.periodStart ?? null,
        period_end: parsed.periodEnd ?? null,
        candidates: parsed.candidatesNearLabel,
        validation_messages: parsed.validationMessages,
        error_message: parsed.error,
      });
      return NextResponse.json({ error: parsed.error }, { status: 422 });
    }

    // Rectificación: mismo periodo, hash distinto (no sobrescribir)
    const { data: existingByPeriod } = await supabase
      .from('payroll_monthly_totals')
      .select('period_ym, total_company_cost, content_hash, file_path')
      .eq('period_ym', parsed.periodYm)
      .maybeSingle();

    if (existingByPeriod) {
      const prevHash = existingByPeriod.content_hash as string | null;
      const prevAmount = Number(existingByPeriod.total_company_cost);

      if (prevHash && prevHash !== contentHash) {
        await recordImportRun(supabase, {
          status: 'rectification_pending',
          content_hash: contentHash,
          filename: filenameForAudit,
          period_ym: parsed.periodYm,
          period_start: parsed.periodStart,
          period_end: parsed.periodEnd,
          amount_detected: parsed.totalCompanyCost,
          amount_selected: null,
          candidates: parsed.candidatesNearLabel,
          label_used: parsed.labelUsed,
          validation_messages: [
            ...parsed.validationMessages,
            `Rectificación detectada: period_ym=${parsed.periodYm} ya tiene hash distinto. No se sobrescribe.`,
            `Importe vigente=${prevAmount}; importe nuevo=${parsed.totalCompanyCost}.`,
          ],
          error_message: 'rectification_pending_manual_review',
        });
        return NextResponse.json(
          {
            success: false,
            reason: 'rectification_pending',
            periodYm: parsed.periodYm,
            existingTotalCompanyCost: prevAmount,
            detectedTotalCompanyCost: parsed.totalCompanyCost,
            contentHash,
            parserVersion: PAYROLL_SUMMARY_PARSER_VERSION,
          },
          { status: 409 },
        );
      }

      // Legacy sin hash: solo backfill si el importe coincide exactamente
      if (!prevHash && prevAmount !== parsed.totalCompanyCost) {
        await recordImportRun(supabase, {
          status: 'rectification_pending',
          content_hash: contentHash,
          filename: filenameForAudit,
          period_ym: parsed.periodYm,
          period_start: parsed.periodStart,
          period_end: parsed.periodEnd,
          amount_detected: parsed.totalCompanyCost,
          amount_selected: null,
          candidates: parsed.candidatesNearLabel,
          label_used: parsed.labelUsed,
          validation_messages: [
            ...parsed.validationMessages,
            `Fila legacy sin hash con importe distinto (${prevAmount} vs ${parsed.totalCompanyCost}). No se sobrescribe.`,
          ],
          error_message: 'rectification_pending_legacy_amount_mismatch',
        });
        return NextResponse.json(
          {
            success: false,
            reason: 'rectification_pending',
            periodYm: parsed.periodYm,
            existingTotalCompanyCost: prevAmount,
            detectedTotalCompanyCost: parsed.totalCompanyCost,
            contentHash,
            parserVersion: PAYROLL_SUMMARY_PARSER_VERSION,
          },
          { status: 409 },
        );
      }
    }

    const safeBase = String(filename).replace(/[^\w.\- ()]/g, '_');
    const storagePath = `payroll-summary/${parsed.periodYm}/${
      safeBase.endsWith('.pdf') ? safeBase : `${safeBase}.pdf`
    }`;

    const { error: storageError } = await supabase.storage
      .from('nominas')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });
    if (storageError) {
      await recordImportRun(supabase, {
        status: 'error',
        content_hash: contentHash,
        filename: filenameForAudit,
        period_ym: parsed.periodYm,
        period_start: parsed.periodStart,
        period_end: parsed.periodEnd,
        amount_detected: parsed.totalCompanyCost,
        candidates: parsed.candidatesNearLabel,
        label_used: parsed.labelUsed,
        validation_messages: parsed.validationMessages,
        error_message: `Fallo Storage: ${storageError.message}`,
      });
      throw new Error(`Fallo Storage: ${storageError.message}`);
    }

    const { error: upsertError } = await supabase
      .from('payroll_monthly_totals')
      .upsert(
        {
          period_ym: parsed.periodYm,
          period_start: parsed.periodStart,
          period_end: parsed.periodEnd,
          total_company_cost: parsed.totalCompanyCost,
          file_path: storagePath,
          email_date: emailDate ? String(emailDate) : null,
          content_hash: contentHash,
          parser_version: PAYROLL_SUMMARY_PARSER_VERSION,
          source: SOURCE,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'period_ym' },
      );

    if (upsertError) {
      await recordImportRun(supabase, {
        status: 'error',
        content_hash: contentHash,
        filename: filenameForAudit,
        period_ym: parsed.periodYm,
        period_start: parsed.periodStart,
        period_end: parsed.periodEnd,
        amount_detected: parsed.totalCompanyCost,
        candidates: parsed.candidatesNearLabel,
        label_used: parsed.labelUsed,
        validation_messages: parsed.validationMessages,
        error_message: `Fallo al registrar total: ${upsertError.message}`,
      });
      throw new Error(
        `Fallo al registrar total de nóminas: ${upsertError.message}`,
      );
    }

    await recordImportRun(supabase, {
      status: 'imported',
      content_hash: contentHash,
      filename: filenameForAudit,
      period_ym: parsed.periodYm,
      period_start: parsed.periodStart,
      period_end: parsed.periodEnd,
      amount_detected: parsed.totalCompanyCost,
      amount_selected: parsed.totalCompanyCost,
      candidates: parsed.candidatesNearLabel,
      label_used: parsed.labelUsed,
      validation_messages: parsed.validationMessages,
    });

    return NextResponse.json(
      {
        success: true,
        periodYm: parsed.periodYm,
        periodStart: parsed.periodStart,
        periodEnd: parsed.periodEnd,
        totalCompanyCost: parsed.totalCompanyCost,
        contentHash,
        parserVersion: PAYROLL_SUMMARY_PARSER_VERSION,
        labelUsed: parsed.labelUsed,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error procesando nómina resumen:', error);
    try {
      await recordImportRun(supabase, {
        status: 'error',
        content_hash: contentHash,
        filename: filenameForAudit,
        error_message: message,
      });
    } catch {
      /* ignore */
    }
    return NextResponse.json(
      { error: 'Internal Server Error', details: message },
      { status: 500 },
    );
  }
}
