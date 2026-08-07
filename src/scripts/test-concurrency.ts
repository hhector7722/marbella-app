import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

async function runConcurrencyTest() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const period = '2026-12'; // Futuro para no ensuciar datos de producción
  
  // ==========================================
  // PREPARACIÓN Y LANZAMIENTO
  // ==========================================
  
  // Limpiar lote (y totales) si existe
  await supabase.from('employee_payroll_facts').delete().eq('period_ym', period);
  await supabase.from('payroll_monthly_totals').delete().eq('period_ym', period);
  
  // Insertar total mockeado para el mes
  await supabase.from('payroll_monthly_totals').insert({
    period_ym: period,
    total_company_cost: 1500
  });
  
  // Generar facts falsos para simular el PDF
  const mockFacts = [
    {
      user_id: '048018f9-76cc-4fe2-a966-de769977cc07', // Mamadou
      total_company_cost: 1000,
      gross_salary: 1000,
      ss_employee: 0,
      ss_company: 0,
      tc1_cost: 0,
      net_salary: 1000,
      settlement_hash: 'concurrency-hash-1'
    },
    {
      user_id: '97a9cb0d-f9c5-4a01-800e-a5a0bcde5848', // Alba
      total_company_cost: 500,
      gross_salary: 500,
      ss_employee: 0,
      ss_company: 0,
      tc1_cost: 0,
      net_salary: 500,
      settlement_hash: 'concurrency-hash-2'
    }
  ];

  console.log(`[CONCURRENCY TEST] Lanzando 2 transacciones SIMULTÁNEAS para ${period}...`);
  
  // Ejecutar DOS llamadas RPC concurrentes
  await Promise.all([
    supabase.rpc('replace_payroll_month_atomic', { p_period_ym: period, p_facts: mockFacts }),
    supabase.rpc('replace_payroll_month_atomic', { p_period_ym: period, p_facts: mockFacts })
  ]);

  // ==========================================
  // VALIDACIONES
  // ==========================================
  let allPassed = true;
  
  const { data: allFacts } = await supabase
    .from('employee_payroll_facts')
    .select('*')
    .eq('period_ym', period);

  const activeFacts = allFacts!.filter(f => f.status === 'active');
  const supersededFacts = allFacts!.filter(f => f.status === 'superseded');

  console.log('\n--- VERIFICANDO INTEGRIDAD ---');
  // 1. Número esperado de liquidaciones activas (deben ser 2, no 4, ni 0)
  if (activeFacts.length === 2) {
    console.log('✅ PASS: Número esperado de liquidaciones activas (2)');
  } else {
    console.log(`❌ FAIL: Número incorrecto de liquidaciones activas. Se encontraron ${activeFacts.length}, se esperaban 2.`);
    allPassed = false;
  }
  
  // 2. Existe exactamente un lote activo para el mes
  // Todo el lote activo debe tener la misma versión/created_at, indicando que vienen de la misma transacción ganadora.
  const uniqueCreationTimes = new Set(activeFacts.map(f => f.created_at)).size;
  if (uniqueCreationTimes === 1 && activeFacts.length > 0) {
     console.log('✅ PASS: Todas las liquidaciones activas pertenecen al mismo lote transaccional');
  } else {
     console.log(`❌ FAIL: Las liquidaciones activas pertenecen a lotes rotos o transacciones parciales (tiempos únicos: ${uniqueCreationTimes})`);
     allPassed = false;
  }

  console.log('\n--- VERIFICANDO CUADRATURA ---');
  const sumActive = activeFacts.reduce((acc, f) => acc + Number(f.total_company_cost), 0);
  const expectedTotal = 1500;
  const diff = Math.abs(sumActive - expectedTotal);
  
  if (diff < 0.01) {
    console.log(`✅ PASS: Cuadratura perfecta. Activos (${sumActive.toFixed(2)} €) == Oficial (${expectedTotal.toFixed(2)} €). Diff: ${diff.toFixed(2)} €`);
  } else {
    console.log(`❌ FAIL: Descuadre económico detectado. Activos (${sumActive.toFixed(2)} €) != Oficial (${expectedTotal.toFixed(2)} €). Diff: ${diff.toFixed(2)} €`);
    allPassed = false;
  }
  
  console.log('\n--- VERIFICANDO SETTLEMENT HASH ---');
  const uniqueHashes = new Set(activeFacts.map(f => f.settlement_hash)).size;
  if (uniqueHashes === activeFacts.length && activeFacts.length > 0) {
    console.log('✅ PASS: No existen registros activos con settlement_hash duplicados');
  } else {
    console.log(`❌ FAIL: Duplicidad detectada. Hashes únicos: ${uniqueHashes}, Total activos: ${activeFacts.length}`);
    allPassed = false;
  }

  console.log('\n--- VERIFICANDO ESTADOS ---');
  const validStatuses = ['active', 'superseded'];
  const hasInvalidStatuses = allFacts!.some(f => !validStatuses.includes(f.status));
  
  if (!hasInvalidStatuses) {
     console.log('✅ PASS: Únicamente existen estados válidos (active, superseded)');
  } else {
     console.log('❌ FAIL: Se detectaron estados inconsistentes');
     allPassed = false;
  }
  
  // Los registros superseded deben venir del lote perdedor de la concurrencia, lo cual significa que existen, y son de un lote anterior
  if (supersededFacts.length === 2) {
      console.log('✅ PASS: Los registros superseded reflejan que el lote perdedor fue correctamente invalidado por la transacción ganadora');
  } else {
      console.log(`❌ FAIL: Número inesperado de registros superseded: ${supersededFacts.length}`);
      allPassed = false;
  }

  console.log('\n=============================================');
  if (allPassed) {
    console.log('🎉 RESULTADO FINAL: TODAS LAS COMPROBACIONES PASAN');
    process.exit(0);
  } else {
    console.log('💥 RESULTADO FINAL: ALGUNAS COMPROBACIONES FALLARON');
    process.exit(1);
  }
}

runConcurrencyTest().catch(console.error);
