/* eslint-disable @typescript-eslint/no-explicit-any -- Dobles tipados mínimos para lectura del read model. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allocateOperationalMonth, actualHours, expectedContractHours, FIXED_OWNER_ID, ownerOrdinaryHours } from './labor-operational-cost.ts';

const days = ['2026-09-01','2026-09-02','2026-09-03'];
const facts: any[] = [
  { user_id:'a', total_company_cost: 300 },
  { user_id:'b', total_company_cost: 150 },
];
const terms = [
  { user_id:'a', effective_from:'2026-09-01', effective_to:null, weekly_hours:35 },
  { user_id:'b', effective_from:'2026-09-01', effective_to:null, weekly_hours:35 },
];
const log=(id:string, day:string, hours:number)=>({
  user_id:id, clock_in:day+'T09:00:00Z', clock_out:day+'T17:00:00Z', total_hours:hours,
});

test('tarifa deriva de coste empresa y horas contractuales, no de calendario natural',()=>{
  assert.equal(expectedContractHours(days, terms, 'a'),15);
  const projected=allocateOperationalMonth({
    days,periodStart:days[0]!,periodEnd:days[2]!,
    facts,terms,logs:[log('a',days[0]!,5), log('b',days[0]!,5), log('b',days[2]!,5)],
    extraHours:[],payrollPending:false,
  });
  assert.equal(projected[days[0]!]!.total,150);
  assert.equal(projected[days[1]!]!.total,0);
  assert.equal(projected[days[1]!]!.incomplete,true);
  assert.equal(projected[days[2]!]!.total,50);
  assert.equal(projected[days[2]!]!.incomplete,false);
});

test('contrato parcial en el mes o cambio de jornada altera denominador real',()=>{
  const t=[...terms.filter(x=>x.user_id==='b'),
    {user_id:'a',effective_from:days[0]!,effective_to:days[1]!,weekly_hours:35},
    {user_id:'a',effective_from:days[2]!,effective_to:null,weekly_hours:14}];
  assert.equal(expectedContractHours(days,t,'a'),12);
});

test('horas ordinarias de nómina y extras de proyección se valoran sin doble cálculo',()=>{
  const projected=allocateOperationalMonth({
    days,periodStart:days[0]!,periodEnd:days[2]!,facts,terms,
    logs:[log('a',days[0]!,5)],
    extraHours:[{user_id:'a',day:days[0]!,week_start:'2026-08-31',overtime_hours:2,overtime_cost:29}],payrollPending:false,
  });
  const today=projected[days[0]!]!;
  assert.equal(today.fixed,60);
  assert.equal(today.overtime,29);
  assert.equal(today.total,89);
  assert.equal(today.incomplete,false);
});

test('sin ninguna tarifa positiva el día permanece incompleto',()=>{
  const projected=allocateOperationalMonth({
    days,periodStart:days[0]!,periodEnd:days[2]!,facts,terms,
    logs:[log('a',days[0]!,5),log('no_payroll',days[0]!,4)],
    extraHours:[],payrollPending:false,
  });
  assert.equal(projected[days[0]!]!.total,100);
  assert.equal(projected[days[0]!]!.incomplete,true);
  assert.equal(projected[days[0]!]!.missingWorkers,1);
  const withoutTerm=allocateOperationalMonth({
    days,periodStart:days[0]!,periodEnd:days[2]!,
    facts:[{user_id:'x',total_company_cost:200} as any],
    terms:[{user_id:'x',effective_from:days[0]!,effective_to:null,weekly_hours:0}],
    logs:[log('x',days[0]!,8)],extraHours:[],payrollPending:false,
  });
  assert.equal(withoutTerm[days[0]!]!.missingWorkers,1);
});

test('mes sin nómina no inventa sueldo; cierres sin fichaje no se pintan como verdes',()=>{
  const projected=allocateOperationalMonth({
    days,periodStart:days[0]!,periodEnd:days[2]!,facts:[],terms,
    logs:[log('a',days[0]!,5)],extraHours:[],payrollPending:true,
  });
  assert.equal(projected[days[0]!]!.total,0);
  assert.equal(projected[days[0]!]!.incomplete,true);
  assert.equal(projected[days[1]!]!.hasWorked,false);
  assert.equal(projected[days[1]!]!.incomplete,true);
});

test('horas efectivas: total_hours o fichaje cerrado, nunca horas inventadas por fichajes abiertos',()=>{
  assert.equal(actualHours(log('a',days[0]!,6.5)),6.5);
  assert.equal(actualHours({...log('a',days[0]!,0),total_hours:null}),8);
  assert.equal(actualHours({...log('a',days[0]!,0),total_hours:null,clock_out:null}),0);
});

test('empleados eventuales sin nómina individual usan exclusivamente sus extras verificadas',()=>{
  const result=allocateOperationalMonth({
    days,periodStart:days[0]!,periodEnd:days[2]!,facts:[],terms:[],
    logs:[log('extra',days[0]!,8)],
    extraHours:[{user_id:'extra',day:days[0]!,week_start:'2026-08-31',overtime_hours:8,overtime_cost:80}],
    payrollPending:false,
  });
  assert.deepEqual(
    {fixed:result[days[0]!]!.fixed,overtime:result[days[0]!]!.overtime,
      missing:result[days[0]!]!.missingWorkers,incomplete:result[days[0]!]!.incomplete},
    {fixed:0,overtime:80,missing:0,incomplete:false},
  );
});

test('tarifa contractual 0 no invalida un día 100% extra con importe persistido',()=>{
  const result=allocateOperationalMonth({
    days,periodStart:days[0]!,periodEnd:days[2]!,
    facts:[{user_id:'owner',total_company_cost:2500} as any],
    terms:[{user_id:'owner',effective_from:days[0]!,effective_to:null,weekly_hours:0}],
    logs:[log('owner',days[0]!,9)],
    extraHours:[{user_id:'owner',day:days[0]!,week_start:'2026-08-31',overtime_hours:9,overtime_cost:108}],
    payrollPending:false,
  });
  assert.equal(result[days[0]!]!.total,108);
  assert.equal(result[days[0]!]!.missingWorkers,0);
  assert.equal(result[days[0]!]!.incomplete,false);
});

test('extras con coste cero son válidas cuando la tarifa contractual de extras es positiva',()=>{
  const result=allocateOperationalMonth({
    days,periodStart:days[0]!,periodEnd:days[2]!,facts:[],
    terms:[{user_id:'stock',effective_from:days[0]!,effective_to:null,weekly_hours:0,overtime_rate_per_hour:10}],
    logs:[log('stock',days[0]!,8)],
    extraHours:[{user_id:'stock',day:days[0]!,week_start:'2026-08-31',overtime_hours:8,overtime_cost:0}],
    payrollPending:false,
  });
  assert.equal(result[days[0]!]!.total,0);
  assert.equal(result[days[0]!]!.incomplete,false);
});

test('sin nómina ordinaria, las extras verificadas bastan y el resto vale 0 €',()=>{
  const result=allocateOperationalMonth({
    days,periodStart:days[0]!,periodEnd:days[2]!,facts:[],terms:[],
    logs:[log('mixed',days[0]!,8)],
    extraHours:[{user_id:'mixed',day:days[0]!,week_start:'2026-08-31',overtime_hours:3,overtime_cost:30}],
    payrollPending:false,
  });
  assert.equal(result[days[0]!]!.overtime,30);
  assert.equal(result[days[0]!]!.fixed,0);
  assert.equal(result[days[0]!]!.missingWorkers,1);
  assert.equal(result[days[0]!]!.incomplete,false);
});

test('una proyección sin coste o con tarifa semanal pendiente no hace pasar el día como completo',()=>{
  const settings={
    days,periodStart:days[0]!,periodEnd:days[2]!,facts:[],terms:[],
    logs:[log('extra',days[0]!,8)],payrollPending:false,
  };
  const missing=allocateOperationalMonth({
    ...settings,extraHours:[{user_id:'extra',day:days[0]!,week_start:'2026-08-31',overtime_hours:8}],
  });
  assert.equal(missing[days[0]!]!.missingWorkers,1);
  const flagged=allocateOperationalMonth({
    ...settings,extraHours:[{user_id:'extra',day:days[0]!,week_start:'2026-08-31',overtime_hours:8,overtime_cost:80}],
    missingRateWeeks:new Set(['extra:2026-08-31']),
  });
  assert.equal(flagged[days[0]!]!.missingWorkers,1);
  assert.equal(flagged[days[0]!]!.overtime,0);
});

test('una nómina mensual pendiente no impide el cálculo operativo si las extras están valoradas',()=>{
  const result=allocateOperationalMonth({
    days,periodStart:days[0]!,periodEnd:days[2]!,facts:[],terms:[],
    logs:[log('extra',days[0]!,8)],
    extraHours:[{user_id:'extra',day:days[0]!,week_start:'2026-08-31',overtime_hours:8,overtime_cost:80}],
    payrollPending:true,
  });
  assert.equal(result[days[0]!]!.total,80);
  assert.equal(result[days[0]!]!.incomplete,false);
});

test('tarifa ordinaria ausente + tarifa de extras positiva permite calcular el día a 0 €',()=>{
  const result=allocateOperationalMonth({
    days,periodStart:days[0]!,periodEnd:days[2]!,
    facts:[],
    terms:[{user_id:'e',effective_from:days[0]!,effective_to:null,weekly_hours:0,overtime_rate_per_hour:10}],
    logs:[log('e',days[0]!,8)],extraHours:[],payrollPending:false,
  });
  assert.equal(result[days[0]!]!.fixed,0);
  assert.equal(result[days[0]!]!.overtime,0);
  assert.equal(result[days[0]!]!.total,0);
  assert.equal(result[days[0]!]!.incomplete,false);
  assert.equal(result[days[0]!]!.missingWorkers,1);
  assert.equal(result[days[0]!]!.workers[0]!.costKnown,false);
});

test('ninguna de las dos tarifas positiva: no se admite el día como completo',()=>{
  const result=allocateOperationalMonth({
    days,periodStart:days[0]!,periodEnd:days[2]!,
    facts:[{user_id:'e',total_company_cost:0} as any],
    terms:[{user_id:'e',effective_from:days[0]!,effective_to:null,weekly_hours:35,overtime_rate_per_hour:0}],
    logs:[log('e',days[0]!,8)],extraHours:[],payrollPending:false,
  });
  assert.equal(result[days[0]!]!.total,0);
  assert.equal(result[days[0]!]!.incomplete,true);
  assert.equal(result[days[0]!]!.missingWorkers,1);
});

test('tarifa semanal positiva autoriza el día aunque no haya horas extras',()=>{
  const result=allocateOperationalMonth({
    days,periodStart:days[0]!,periodEnd:days[2]!,
    facts:[],terms:[],logs:[log('e',days[0]!,8)],
    weeklyRates:[{user_id:'e',week_start:'2026-08-31',overtime_rate_effective:14}],
    extraHours:[],payrollPending:false,
  });
  assert.equal(result[days[0]!]!.total,0);
  assert.equal(result[days[0]!]!.incomplete,false);
});

test('override semanal explícito a 0 invalida tarifa contractual de extras',()=>{
  const result=allocateOperationalMonth({
    days,periodStart:days[0]!,periodEnd:days[2]!,
    facts:[],logs:[log('e',days[0]!,8)],
    terms:[{user_id:'e',effective_from:days[0]!,effective_to:null,weekly_hours:0,overtime_rate_per_hour:10}],
    weeklyRates:[{user_id:'e',week_start:'2026-08-31',overtime_price_snapshot:0,overtime_rate_effective:0}],
    extraHours:[],payrollPending:false,
  });
  assert.equal(result[days[0]!]!.incomplete,true);
});

test('tarifa ordinaria positiva permite contar extras sin proyección a 0 €',()=>{
  const result=allocateOperationalMonth({
    days,periodStart:days[0]!,periodEnd:days[2]!,
    facts:[{user_id:'a',total_company_cost:300} as any],
    terms:terms.filter(t=>t.user_id==='a'),
    logs:[log('a',days[0]!,5)],
    extraHours:[{user_id:'a',day:days[0]!,week_start:'2026-08-31',overtime_hours:2,overtime_cost:null}],
    payrollPending:false,
  });
  assert.equal(result[days[0]!]!.fixed,60);
  assert.equal(result[days[0]!]!.overtime,0);
  assert.equal(result[days[0]!]!.incomplete,false);
  assert.equal(result[days[0]!]!.missingWorkers,1);
});

test('mes pendiente mantiene nómina oficial separada sin bloquear un día con tarifa válida',()=>{
  const result=allocateOperationalMonth({
    days,periodStart:days[0]!,periodEnd:days[2]!,
    facts:[],terms:[{user_id:'e',effective_from:days[0]!,effective_to:null,weekly_hours:0,overtime_rate_per_hour:8}],
    logs:[log('e',days[0]!,8)],extraHours:[],payrollPending:true,
  });
  assert.equal(result[days[0]!]!.total,0);
  assert.equal(result[days[0]!]!.incomplete,false);
});

test('propietario: 8 horas ordinarias laborables, festivos locales y fines de semana excluidos, extras intactas', () => {
  const dates = ['2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'];
  const ownTerms = [{user_id:FIXED_OWNER_ID,effective_from:'2025-12-29',effective_to:null,weekly_hours:0,overtime_rate_per_hour:12}];
  const projection = allocateOperationalMonth({
    days: dates, periodStart: dates[0]!, periodEnd: dates[4]!,
    facts: [{user_id:FIXED_OWNER_ID,total_company_cost:160}],
    terms: ownTerms, logs:[log(FIXED_OWNER_ID,dates[2]!,2),log(FIXED_OWNER_ID,dates[3]!,3)],
    extraHours:[{user_id:FIXED_OWNER_ID,day:dates[2]!,overtime_hours:2,overtime_cost:24},
      {user_id:FIXED_OWNER_ID,day:dates[3]!,overtime_hours:3,overtime_cost:36}],
    payrollPending:false,
  });
  assert.equal(expectedContractHours(dates,ownTerms,FIXED_OWNER_ID),16);
  assert.equal(projection[dates[0]!]!.workers[0]!.hours,8);
  assert.equal(projection[dates[0]!]!.fixed,80);
  assert.equal(projection[dates[1]!]!.hasWorked,false);
  assert.equal(projection[dates[2]!]!.workers[0]!.hours,10);
  assert.equal(projection[dates[2]!]!.total,104);
  assert.equal(projection[dates[3]!]!.total,36);
  assert.equal(projection[dates[4]!]!.hasWorked,false);
  assert.equal(ownerOrdinaryHours('2026-10-12',ownTerms),0);
  assert.equal(ownerOrdinaryHours('2026-09-11',ownTerms),0);
  assert.equal(ownerOrdinaryHours('2027-05-17',ownTerms),0);
  assert.equal(ownerOrdinaryHours('2027-05-18',ownTerms),8);
  assert.equal(ownerOrdinaryHours('2028-01-03',ownTerms),0);
  const filtered = allocateOperationalMonth({
    days: dates,periodStart:dates[0]!,periodEnd:dates[4]!,facts:[],terms:ownTerms,
    logs:[],extraHours:[],payrollPending:true,workerFilter:'another-user',
  });
  assert.equal(filtered[dates[0]!]!.hasWorked,false);
  const partial = allocateOperationalMonth({
    days: dates,periodStart:dates[0]!,periodEnd:dates[4]!,facts:[{user_id:FIXED_OWNER_ID,total_company_cost:160}],
    terms:ownTerms,logs:[],extraHours:[],payrollPending:false,throughDay:dates[0]!,
  });
  assert.equal(partial[dates[2]!]!.hasWorked,false);
});

test('propietario: agosto no genera coste ordinario automático, los demás trabajadores y extras reales se conservan', () => {
  const days = ['2026-08-03','2026-08-04'];
  const terms = [
    {user_id:FIXED_OWNER_ID,effective_from:'2025-12-29',effective_to:null,weekly_hours:0,overtime_rate_per_hour:12},
    {user_id:'a',effective_from:'2025-12-29',effective_to:null,weekly_hours:35},
  ];
  const result = allocateOperationalMonth({
    days,periodStart:days[0]!,periodEnd:days[1]!,
    facts:[{user_id:FIXED_OWNER_ID,total_company_cost:2000},{user_id:'a',total_company_cost:100}],
    terms,logs:[log('a',days[0]!,5),log(FIXED_OWNER_ID,days[1]!,2)],
    extraHours:[{user_id:FIXED_OWNER_ID,day:days[1]!,overtime_hours:2,overtime_cost:24}],
    payrollPending:false,
  });
  assert.equal(expectedContractHours(days,terms,FIXED_OWNER_ID),0);
  assert.equal(result[days[0]!]!.workers.some(w=>w.userId===FIXED_OWNER_ID),false);
  assert.equal(result[days[0]!]!.fixed,50);
  assert.equal(result[days[1]!]!.fixed,0);
  assert.equal(result[days[1]!]!.overtime,24);
  assert.equal(ownerOrdinaryHours('2027-08-02',terms),0);
  assert.equal(ownerOrdinaryHours('2026-09-01',terms),8);
});
