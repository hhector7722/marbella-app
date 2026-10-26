import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { createClient } from "@/utils/supabase/server";
import {
  appSourceAllowed,appDataToolForRole,visibleAppSources,
  normalizeAppCatalogInput,runAppDataTool,summarizeAppData,
} from "./app-data-catalog.ts";

type Client=Awaited<ReturnType<typeof createClient>>;
const userId="11111111-1111-4111-8111-111111111111";
const employeeId="22222222-2222-4222-8222-222222222222";

function createFake(entries:Record<string,unknown[]>) {
  const calls:Array<{table:string;name:string;values:unknown[]}>= [];
  const db={
    from:(table:string)=>{
      const query={
        select:(_fields:string)=>query,
        limit:(n:number)=>{calls.push({table,name:"limit",values:[n]});return query;},
        eq:(...x:unknown[])=>{calls.push({table,name:"eq",values:x});return query;},
        gte:(...x:unknown[])=>{calls.push({table,name:"gte",values:x});return query;},
        lte:(...x:unknown[])=>{calls.push({table,name:"lte",values:x});return query;},
        or:(...x:unknown[])=>{calls.push({table,name:"or",values:x});return query;},
        order:(...x:unknown[])=>{calls.push({table,name:"order",values:x});return query;},
        then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:entries[table]??[],error:null}).then(resolve),
      };
      return query;
    },
  };
  return {supabase:db as unknown as Client,calls};
}
test("catálogo por permisos: staff no ve nóminas, fichajes de terceros, tarifas ni extras de otros",()=>{
  assert.equal(appSourceAllowed("staff","nominas"),false);
  assert.equal(appSourceAllowed("staff","horas_extras"),false);
  assert.equal(appSourceAllowed("staff","recetas"),true);
  assert.equal(appSourceAllowed("manager","horas_extras"),true);
  const staff=appDataToolForRole("staff");
  const args=staff.function.parameters.properties as Record<string,{items:{enum:string[]}}>;
  assert.ok(!args.fuentes.items.enum.includes("nominas"));
  assert.ok(!args.fuentes.items.enum.includes("contratos"));
  assert.ok(args.fuentes.items.enum.includes("reservas"));
  assert.ok(visibleAppSources("manager").length>=15);
});
test("rechaza tablas y columnas inventadas por el LLM, límites excesivos y argumentos erróneos",()=>{
  assert.deepEqual(normalizeAppCatalogInput({fuentes:["auth.users"]}),{error:"Fuentes de consulta no válidas"});
  assert.deepEqual(normalizeAppCatalogInput({fuentes:["nominas"],limite:400}),{error:"Límite no válido"});
  assert.deepEqual(normalizeAppCatalogInput({fuentes:[]}),{error:"Fuentes de consulta no válidas"});
});
test("staff sin permiso: no ejecuta ni una sola consulta a tablas de nóminas",async()=>{
  const {supabase,calls}=createFake({});
  const response=await runAppDataTool({fuentes:["nominas","horas_extras"]},
    {supabase,role:"staff",userId,today:"2026-10-26"}) as {resultados:Array<{error:string}>};
  assert.equal(calls.length,0);
  assert.equal(response.resultados.length,2);
  assert.ok(response.resultados.every(x=>x.error.includes("No autorizado")));
});
test("manager: consulta Mamadou y devuelve importe de extras oficial 116, sin inventar tarifa",async()=>{
  const {supabase,calls}=createFake({
    profiles:[{id:employeeId,first_name:"Mamadou",last_name:"Test"}],
    weekly_snapshots:[{
      week_start:"2026-10-19",week_end:"2026-10-25",
      total_hours:54.5,ordinary_hours:40,extra_hours:14.5,
      contracted_hours_snapshot:40,overtime_rate_effective:8,total_cost:116,
      is_paid:false,has_missing_rate:false,final_balance:14.5,prefer_stock_effective:false,
    }],
  });
  const response=await runAppDataTool({
    fuentes:["horas_extras"],empleado:"Mamadou",periodo:"semana_pasada",
  },{supabase,role:"manager",userId,today:"2026-10-26"}) as
    {resultados:Array<{registros:Array<{importe_extras_eur:number;horas_extras:number;tarifa_extra:number}>,periodo:{inicio:string;fin:string}}>} ;
  assert.equal(response.resultados[0].registros[0].importe_extras_eur,116);
  assert.equal(response.resultados[0].registros[0].horas_extras,14.5);
  assert.equal(response.resultados[0].registros[0].tarifa_extra,8);
  assert.deepEqual(response.resultados[0].periodo,{inicio:"2026-10-19",fin:"2026-10-25"});
  assert.ok(calls.some(c=>c.table==="weekly_snapshots"&&c.name==="eq"&&c.values[1]===employeeId));
});
test("contratos: vigencia que empieza antes de la semana sigue siendo visible",async()=>{
  const {supabase,calls}=createFake({profiles:[{id:employeeId,first_name:"Mamadou",last_name:"T"}],hours_contract_terms:[]});
  await runAppDataTool({fuentes:["contratos"],empleado:"Mamadou",periodo:"semana_pasada"},
    {supabase,role:"manager",userId,today:"2026-10-26"});
  assert.ok(calls.some(c=>c.table==="hours_contract_terms"&&c.name==="lte"&&c.values[0]==="effective_from"&&c.values[1]==="2026-10-25"));
  assert.ok(calls.some(c=>c.table==="hours_contract_terms"&&c.name==="or"&&String(c.values[0]).includes("effective_to.is.null")));
});
test("respuesta de extras no incluye datos personales de profiles ni DNI",()=>{
  const result=summarizeAppData("horas_extras",[{week_start:"2026-10-19",total_hours:54.5,extra_hours:14.5,total_cost:116,id:"secret",bank_account:"ESxxxx"}]) as Array<Record<string,unknown>>;
  assert.equal(result[0].importe_extras_eur,116);
  assert.equal("bank_account" in result[0],false);
  assert.equal("id" in result[0],false);
});
