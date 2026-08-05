import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  PAYROLL_SUMMARY_PARSER_VERSION,
  parseCompanySummaryPdfBuffer,
} from '@/lib/payroll/company-summary-parser';
import { hashPayrollPdf } from '@/lib/payroll/content-hash';
import { PayrollSnapshotValidator } from '@/lib/payroll/payroll-snapshot-validator';
import { PayrollSnapshotPersistenceService } from '@/lib/payroll/payroll-snapshot-persistence-service';

const SOURCE = 'gmail_summary';

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required.');
  return createClient(url, key);
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

    // 1. Parser PURO -> Generar PayrollMonthSnapshot sin tocar la base de datos
    const parsed = await parseCompanySummaryPdfBuffer(pdfBuffer, {
      contentHash,
      filename: filenameForAudit,
      source: SOURCE,
    });

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

    // 2. Validador PURO -> Verificar las 6 Invariantes (INV-01 a INV-06)
    const validationReport = PayrollSnapshotValidator.validate(parsed.snapshot);
    if (!validationReport.valid) {
      const issueMsgs = validationReport.issues.map((i) => i.message);
      await recordImportRun(supabase, {
        status: 'rejected_validation',
        content_hash: contentHash,
        filename: filenameForAudit,
        period_ym: parsed.snapshot.header.periodYm,
        period_start: parsed.snapshot.header.periodStart,
        period_end: parsed.snapshot.header.periodEnd,
        candidates: [parsed.snapshot.totals.totalCompanyCost],
        label_used: 'COST TOTAL',
        validation_messages: [...parsed.validationMessages, ...issueMsgs],
        error_message: `Snapshot invalidad por reglas de dominio: ${issueMsgs.join('; ')}`,
      });
      return NextResponse.json(
        { error: 'Snapshot invalidad por reglas de dominio', issues: issueMsgs },
        { status: 422 },
      );
    }

    // 3. Servicio de Persistencia Decoplado -> Escribir snapshot en Supabase
    const persistenceService = new PayrollSnapshotPersistenceService(supabase);
    const persistResult = await persistenceService.persistSnapshot(parsed.snapshot);

    if (!persistResult.success) {
      return NextResponse.json(
        { error: 'Fallo al persistir snapshot', details: persistResult.errors },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        periodYm: parsed.periodYm,
        periodStart: parsed.periodStart,
        periodEnd: parsed.periodEnd,
        totalCompanyCost: parsed.totalCompanyCost,
        totalSettlements: parsed.snapshot.settlements.length,
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
