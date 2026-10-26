/* eslint-disable @typescript-eslint/no-explicit-any -- Dobles tipados mínimos para lectura del read model. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allocateOperationalMonth, actualHours, expectedContractHours } from './labor-operational-cost.ts';

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

test('extras declaradas en horas no se suman dos veces a la nómina oficial',()=>{
  const projected=allocateOperationalMonth({
    days,periodStart:days[0]!,periodEnd:days[2]!,facts,terms,
    logs:[log('a',days[0]!,5)],
    extraHours:[{user_id:'a',day:days[0]!,overtime_hours:2}],payrollPending:false,
  });
  const today=projected[days[0]!]!;
  assert.equal(today.fixed,60);
  assert.equal(today.overtime,40);
  assert.equal(today.total,100);
});

test('un trabajador sin nómina o jornada verificable impide mostrar porcentaje incompleto',()=>{
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
