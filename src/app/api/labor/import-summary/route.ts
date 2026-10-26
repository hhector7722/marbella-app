import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { parseCompanySummaryPdfBuffer } from '@/lib/payroll/company-summary-parser';
import { PayrollSnapshotValidator } from '@/lib/payroll/payroll-snapshot-validator';
import { PayrollEmployeeNormalizer } from '@/lib/payroll/payroll-employee-normalizer';
import { PayrollSnapshotPersistenceService } from '@/lib/payroll/payroll-snapshot-persistence-service';

export const runtime = 'nodejs';

function back(request: NextRequest, key: string, value: string) {
  const url = new URL('/dashboard/labor/importar', request.url);
  url.searchParams.set(key, value);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return back(request, 'error', 'Debes iniciar sesión.');
  const { data: profile, error: roleError } = await supabase.from('profiles')
    .select('role').eq('id', auth.user.id).single();
  if (roleError || profile?.role !== 'manager') {
    return back(request, 'error', 'Solo los encargados pueden importar los costes de empresa.');
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File) || !/\.pdf$/i.test(file.name) || file.size < 100 || file.size > 5_000_000) {
      throw new Error('Selecciona un PDF válido de hasta 5 MB.');
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.toString('ascii', 0, 5) !== '%PDF-') throw new Error('El documento no es un PDF válido.');
    const contentHash = createHash('sha256').update(buffer).digest('hex');
    const safeFilename = file.name.replace(/[^a-zA-Z0-9.\-_ ]/g, '') || 'costes-empresa.pdf';
    const parsed = await parseCompanySummaryPdfBuffer(buffer, {
      contentHash, filename: file.name, source: 'manual_manager_upload',
    });
    if (!parsed.ok) throw new Error('No se pudo interpretar el PDF: ' + parsed.error);
    const snapshot = parsed.snapshot;
    const validation = PayrollSnapshotValidator.validate(snapshot);
    if (!validation.valid) {
      throw new Error('El PDF no supera la validación contable: ' + validation.issues.map(x => x.message).join('; '));
    }
    const expectedCents = Math.round(snapshot.totals.totalCompanyCost * 100);
    const settlementCents = snapshot.settlements.reduce((sum, s) => sum + Math.round(s.companyCost * 100), 0);
    if (!snapshot.settlements.length || settlementCents !== expectedCents) {
      throw new Error('El total no coincide con la suma de liquidaciones.');
    }

    const normalizer = new PayrollEmployeeNormalizer(supabase);
    await normalizer.initialize();
    for (const s of snapshot.settlements) {
      const m = normalizer.matchCandidate({ name: s.employeeName, dni: s.employeeCode });
      if (!m.matched || !m.userId) throw new Error('Hay empleados sin correspondencia única. No se ha importado el mes.');
    }

    const period = snapshot.header.periodYm;
    const { data: existing, error: existingError } = await supabase.from('payroll_monthly_totals')
      .select('content_hash').eq('period_ym', period).maybeSingle();
    if (existingError) throw new Error('Error comprobando los meses ya importados.');
    if (existing) return back(request, existing.content_hash === contentHash ? 'already' : 'conflict', period);

    const { count, error: factsError } = await supabase.from('employee_payroll_facts')
      .select('id', { count: 'exact', head: true }).eq('period_ym', period).eq('status', 'active');
    if (factsError || (count ?? 0) !== 0) throw new Error('Existen liquidaciones previas que requieren revisión.');

    const path = `payroll-summary/${period}/${safeFilename}`;
    const bucket = supabase.storage.from('nominas');
    const { error: uploadError } = await bucket.upload(path, buffer, {
      contentType: 'application/pdf', upsert: false,
    });
    const { data: storedPdf, error: downloadError } = await bucket.download(path);
    if (downloadError || !storedPdf) throw new Error('No se pudo verificar el PDF en el almacenamiento privado.');
    const saved = Buffer.from(await storedPdf.arrayBuffer());
    if (createHash('sha256').update(saved).digest('hex') !== contentHash) {
      throw new Error('El PDF guardado no coincide con el original.');
    }
    if (uploadError && !saved.length) throw new Error('Fallo subiendo el PDF.');

    snapshot.metadata.storagePath = path;
    const result = await new PayrollSnapshotPersistenceService(supabase).persistSnapshot(snapshot);
    if (!result.success || !result.monthlyTotalsUpserted || result.factsInsertedCount !== snapshot.settlements.length) {
      throw new Error('La escritura requiere revisión: ' + result.errors.join('; '));
    }

    const { data: monthly, error: monthlyError } = await supabase.from('payroll_monthly_totals')
      .select('total_company_cost,file_path,content_hash').eq('period_ym', period).single();
    const { data: facts, error: verifyError } = await supabase.from('employee_payroll_facts')
      .select('total_company_cost').eq('period_ym', period).eq('status', 'active');
    const cents = (facts ?? []).reduce((s, x) => s + Math.round(Number(x.total_company_cost) * 100), 0);
    if (monthlyError || verifyError || monthly?.file_path !== path ||
        monthly.content_hash !== contentHash ||
        Math.round(Number(monthly.total_company_cost) * 100) !== expectedCents ||
        facts?.length !== snapshot.settlements.length || cents !== expectedCents) {
      throw new Error('Los datos se guardaron, pero la conciliación posterior requiere revisión.');
    }
    return back(request, 'success', period);
  } catch (err) {
    console.error('[labor-payroll-import]', err);
    return back(request, 'error', err instanceof Error ? err.message : 'Error desconocido.');
  }
}
