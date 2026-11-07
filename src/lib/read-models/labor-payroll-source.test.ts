import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PayrollFactRepository } from '../payroll/payroll-fact-repository.ts';
import { laborSupabaseFixture } from './labor-cost-test-fixture.ts';
import { previousLaborMonthYm, resolveLaborPayrollSource } from './labor-payroll-source.ts';

const octoberFacts = [
  { id:'oct-one',user_id:'one',period_ym:'2026-10',status:'active',total_company_cost:2600 },
  { id:'oct-two',user_id:'two',period_ym:'2026-10',status:'active',total_company_cost:1500 },
];
const octoberSummary = {
  period_ym:'2026-10',period_start:'2026-10-01',period_end:'2026-10-31',
  total_company_cost:4100,
};
const mock = (opts?: {
  novemberSummary?: number | null;
  previousSummary?: boolean;
  novemberFacts?: typeof octoberFacts;
}) => {
  const seed = {
    employee_payroll_facts:[
      ...octoberFacts,
      ...(opts?.novemberFacts ?? [{ id:'partial',user_id:'one',period_ym:'2026-11',status:'active',total_company_cost:500 }]),
    ],
    payroll_monthly_totals:[
      ...(opts?.previousSummary === false ? [] : [octoberSummary]),
      ...(opts?.novemberSummary === undefined ? [] : [{
        period_ym:'2026-11',period_start:'2026-11-01',period_end:'2026-11-30',
        total_company_cost:opts.novemberSummary,
      }]),
    ],
  };
  const supabase = laborSupabaseFixture(seed);
  return { supabase, repo: new PayrollFactRepository(supabase) };
};

test('noviembre pendiente usa SOLO importes individuales de octubre y su total oficial',async()=>{
  const {supabase,repo}=mock();
  const result=await resolveLaborPayrollSource(supabase,repo,'2026-11','2026-11-08');
  assert.equal(result.isPayrollPending,true);
  assert.equal(result.isPayrollEstimated,true);
  assert.equal(result.estimatedCompanyCost,4100);
  assert.equal(result.officialFacts.length,1);
  assert.deepEqual(result.calculationFacts.map(f=>[f.user_id,Number(f.total_company_cost)]),[
    ['one',2600],['two',1500],
  ]);
  assert.equal(result.calculationFacts.some(f=>f.period_ym==='2026-11'),false);
});

test('cuando llega la nómina oficial se deja de usar octubre automáticamente',async()=>{
  const {supabase,repo}=mock({novemberSummary:5123});
  const result=await resolveLaborPayrollSource(supabase,repo,'2026-11','2026-11-08');
  assert.equal(result.isPayrollPending,false);
  assert.equal(result.isPayrollEstimated,false);
  assert.equal(result.estimatedCompanyCost,null);
  assert.equal(result.calculationFacts.length,1);
  assert.equal(result.calculationFacts[0]?.period_ym,'2026-11');
});

test('no aplica estimación a meses cerrados ni futuros',async()=>{
  const {supabase,repo}=mock();
  for (const period of ['2026-09','2026-12']) {
    const r=await resolveLaborPayrollSource(supabase,repo,period,'2026-11-08');
    assert.equal(r.isPayrollPending,true);
    assert.equal(r.isPayrollEstimated,false);
    assert.equal(r.estimatedCompanyCost,null);
  }
});

test('si el mes anterior carece de resumen, no se inventa coste',async()=>{
  const {supabase,repo}=mock({previousSummary:false});
  const result=await resolveLaborPayrollSource(supabase,repo,'2026-11','2026-11-08');
  assert.equal(result.isPayrollPending,true);
  assert.equal(result.isPayrollEstimated,false);
  assert.equal(result.calculationFacts[0]?.period_ym,'2026-11');
});

test('enero utiliza diciembre del año anterior sin errores de calendario',()=>{
  assert.equal(previousLaborMonthYm('2027-01'),'2026-12');
  assert.equal(previousLaborMonthYm('2026-11'),'2026-10');
});
