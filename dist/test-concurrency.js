// src/scripts/test-concurrency.ts
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });
async function runConcurrencyTest() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const period = "2026-12";
  await supabase.from("employee_payroll_facts").delete().eq("period_ym", period);
  await supabase.from("payroll_monthly_totals").delete().eq("period_ym", period);
  await supabase.from("payroll_monthly_totals").insert({
    period_ym: period,
    total_company_cost: 1500
  });
  const mockFacts = [
    {
      user_id: "048018f9-76cc-4fe2-a966-de769977cc07",
      // Mamadou
      total_company_cost: 1e3,
      gross_salary: 1e3,
      ss_employee: 0,
      ss_company: 0,
      tc1_cost: 0,
      net_salary: 1e3,
      settlement_hash: "concurrency-hash-1"
    },
    {
      user_id: "97a9cb0d-f9c5-4a01-800e-a5a0bcde5848",
      // Alba
      total_company_cost: 500,
      gross_salary: 500,
      ss_employee: 0,
      ss_company: 0,
      tc1_cost: 0,
      net_salary: 500,
      settlement_hash: "concurrency-hash-2"
    }
  ];
  console.log(`[CONCURRENCY TEST] Lanzando 2 transacciones SIMULT\xC1NEAS para ${period}...`);
  await Promise.all([
    supabase.rpc("replace_payroll_month_atomic", { p_period_ym: period, p_facts: mockFacts }),
    supabase.rpc("replace_payroll_month_atomic", { p_period_ym: period, p_facts: mockFacts })
  ]);
  let allPassed = true;
  const { data: allFacts } = await supabase.from("employee_payroll_facts").select("*").eq("period_ym", period);
  const activeFacts = allFacts.filter((f) => f.status === "active");
  const supersededFacts = allFacts.filter((f) => f.status === "superseded");
  console.log("\n--- VERIFICANDO INTEGRIDAD ---");
  if (activeFacts.length === 2) {
    console.log("\u2705 PASS: N\xFAmero esperado de liquidaciones activas (2)");
  } else {
    console.log(`\u274C FAIL: N\xFAmero incorrecto de liquidaciones activas. Se encontraron ${activeFacts.length}, se esperaban 2.`);
    allPassed = false;
  }
  const uniqueCreationTimes = new Set(activeFacts.map((f) => f.created_at)).size;
  if (uniqueCreationTimes === 1 && activeFacts.length > 0) {
    console.log("\u2705 PASS: Todas las liquidaciones activas pertenecen al mismo lote transaccional");
  } else {
    console.log(`\u274C FAIL: Las liquidaciones activas pertenecen a lotes rotos o transacciones parciales (tiempos \xFAnicos: ${uniqueCreationTimes})`);
    allPassed = false;
  }
  console.log("\n--- VERIFICANDO CUADRATURA ---");
  const sumActive = activeFacts.reduce((acc, f) => acc + Number(f.total_company_cost), 0);
  const expectedTotal = 1500;
  const diff = Math.abs(sumActive - expectedTotal);
  if (diff < 0.01) {
    console.log(`\u2705 PASS: Cuadratura perfecta. Activos (${sumActive.toFixed(2)} \u20AC) == Oficial (${expectedTotal.toFixed(2)} \u20AC). Diff: ${diff.toFixed(2)} \u20AC`);
  } else {
    console.log(`\u274C FAIL: Descuadre econ\xF3mico detectado. Activos (${sumActive.toFixed(2)} \u20AC) != Oficial (${expectedTotal.toFixed(2)} \u20AC). Diff: ${diff.toFixed(2)} \u20AC`);
    allPassed = false;
  }
  console.log("\n--- VERIFICANDO SETTLEMENT HASH ---");
  const uniqueHashes = new Set(activeFacts.map((f) => f.settlement_hash)).size;
  if (uniqueHashes === activeFacts.length && activeFacts.length > 0) {
    console.log("\u2705 PASS: No existen registros activos con settlement_hash duplicados");
  } else {
    console.log(`\u274C FAIL: Duplicidad detectada. Hashes \xFAnicos: ${uniqueHashes}, Total activos: ${activeFacts.length}`);
    allPassed = false;
  }
  console.log("\n--- VERIFICANDO ESTADOS ---");
  const validStatuses = ["active", "superseded"];
  const hasInvalidStatuses = allFacts.some((f) => !validStatuses.includes(f.status));
  if (!hasInvalidStatuses) {
    console.log("\u2705 PASS: \xDAnicamente existen estados v\xE1lidos (active, superseded)");
  } else {
    console.log("\u274C FAIL: Se detectaron estados inconsistentes");
    allPassed = false;
  }
  if (supersededFacts.length === 2) {
    console.log("\u2705 PASS: Los registros superseded reflejan que el lote perdedor fue correctamente invalidado por la transacci\xF3n ganadora");
  } else {
    console.log(`\u274C FAIL: N\xFAmero inesperado de registros superseded: ${supersededFacts.length}`);
    allPassed = false;
  }
  console.log("\n=============================================");
  if (allPassed) {
    console.log("\u{1F389} RESULTADO FINAL: TODAS LAS COMPROBACIONES PASAN");
    process.exit(0);
  } else {
    console.log("\u{1F4A5} RESULTADO FINAL: ALGUNAS COMPROBACIONES FALLARON");
    process.exit(1);
  }
}
runConcurrencyTest().catch(console.error);
