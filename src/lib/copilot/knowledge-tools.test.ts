import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  resolveDates,
  summarizeProductSales,
  calculateWorkedHours,
  toolEnabled,
  runKnowledgeTool,
} from "./knowledge-tools.ts";
import type { createClient } from "@/utils/supabase/server";
import { selectGroqTools } from "./groq-chat.ts";
import { KNOWLEDGE_TOOL_DEFS } from "./knowledge-tools.ts";

type Client = Awaited<ReturnType<typeof createClient>>;
const userId = "11111111-1111-4111-8111-111111111111";
const fernando = "22222222-2222-4222-8222-222222222222";
const today = "2026-10-26";

test("periodos exactos (semana anterior lunes-domingo)", () => {
  assert.deepEqual(resolveDates({periodo:"semana_pasada"}, today), {inicio:"2026-10-19",fin:"2026-10-25"});
  assert.deepEqual(resolveDates({periodo:"hoy"}, today), {inicio:today,fin:today});
  assert.deepEqual(resolveDates({periodo:"ayer"}, today), {inicio:"2026-10-25",fin:"2026-10-25"});
  assert.ok("error" in resolveDates({periodo:"rango",fecha_inicio:"2026-01-01",fecha_fin:"2026-10-26"}, today));
});

test("ventas: distingue 61 tickets de unidades de café y cortados", () => {
  const result=summarizeProductSales({
    summary:{count:61}, products:[
      {nombre_articulo:"Café con leche",cantidad_total:9,total_ingresos:15},
      {nombre_articulo:"Cortado",cantidad_total:8,total_ingresos:11},
      {nombre_articulo:"Coca Cola",cantidad_total:22,total_ingresos:44},
    ],
  },"cafes");
  assert.equal(result.unidades,17);
  assert.equal(result.total_tickets,61);
  assert.equal(result.importe_eur,26);
});

test("horas: suma intervalos cerrados y señala fichajes pendientes", () => {
  const hours=calculateWorkedHours([
    {clock_in:"2026-10-19T08:00:00Z",clock_out:"2026-10-19T16:00:00Z",total_hours:7.5},
    {clock_in:"2026-10-20T08:00:00Z",clock_out:"2026-10-20T12:00:00Z"},
    {clock_in:"2026-10-21T08:00:00Z",clock_out:null},
  ],"2026-10-19","2026-10-25");
  assert.equal(hours.horas_fichadas,11.5);
  assert.equal(hours.fichajes_sin_salida,1);
  assert.equal(hours.turnos_completos,2);
});

test("los permisos no dependen del prompt: ventas solo responsables", async () => {
  assert.equal(toolEnabled("staff","consultar_ventas_productos"),false);
  assert.equal(toolEnabled("manager","consultar_ventas_productos"),true);
  assert.equal(toolEnabled("staff","consultar_horas_trabajadas"),true);
  let called=false;
  const fake={rpc:async()=>{called=true;return {data:null,error:null}}} as unknown as Client;
  const result=await runKnowledgeTool("consultar_ventas_productos",
    {periodo:"hoy"},{supabase:fake,userId,role:"staff",today});
  assert.deepEqual(result,{error:"No tienes permiso para consultar esta información"});
  assert.equal(called,false);
});

test("selecciona herramientas para las tres preguntas reales",()=>{
  const cat=Object.values(KNOWLEDGE_TOOL_DEFS);
  assert.deepEqual(selectGroqTools("cuantos cafes llevamos vendidos hoy",cat).map(t=>t.function.name),["consultar_ventas_productos"]);
  assert.deepEqual(selectGroqTools("cuantas horas trabajo Fernando la semana pasada",cat).map(t=>t.function.name),["consultar_horas_trabajadas"]);
  assert.deepEqual(selectGroqTools("que lleva la sangria",cat).map(t=>t.function.name),["consultar_receta_detallada"]);
});

test("receta: recupera ingredientes verdaderos de las tablas, no una expansión vacía",async()=>{
  const calls:string[]=[];
  const fake = {
    from:(table:string)=>{
      calls.push(table);
      if(table==="recipes") return {select:()=>({ilike:()=>({limit:async()=>({data:[{id:"r1",name:"Sangria cava",elaboration:"Servir con hielo",presentation:"Jarra"}],error:null})})})};
      if(table==="recipe_ingredients") return {select:()=>({eq:()=>({limit:async()=>({data:[{ingredient_id:"i1",quantity_gross:100,quantity_net:95,unit:"ml"}],error:null})})})};
      if(table==="ingredients") return {select:()=>({in:async()=>({data:[{id:"i1",name:"Cava",unit:"ml"}],error:null})})};
      throw new Error("Tabla no esperada "+table);
    },
  } as unknown as Client;
  const response=await runKnowledgeTool("consultar_receta_detallada",
    {nombre:"Sangria cava"},{supabase:fake,role:"staff",userId,today}) as {ingredientes:Array<{nombre:string,cantidad_bruta:number}>};
  assert.deepEqual(calls,["recipes","recipe_ingredients","ingredients"]);
  assert.equal(response.ingredientes[0].nombre,"Cava");
  assert.equal(response.ingredientes[0].cantidad_bruta,100);
});

test("horas de Fernando: resuelve el nombre y consulta RPC por UUID",async()=>{
  let rpcArgs: Record<string,unknown> = {};
  const fake = {
    from:(table:string)=>{
      assert.equal(table,"profiles");
      return {select:()=>({limit:async()=>({data:[{id:fernando,first_name:"Fernando",last_name:"García"}],error:null})})};
    },
    rpc:async(_fn:string,args:Record<string,unknown>)=>{
      rpcArgs=args;
      return {data:[{clock_in:"2026-10-19T09:00:00Z",clock_out:"2026-10-19T17:00:00Z",total_hours:8}],error:null};
    },
  } as unknown as Client;
  const answer=await runKnowledgeTool("consultar_horas_trabajadas",
    {periodo:"semana_pasada",empleado:"Fernando"},
    {supabase:fake,role:"manager",userId,today}) as {empleado:string,horas_fichadas:number};
  assert.equal(rpcArgs.p_user_id,fernando);
  assert.equal(rpcArgs.p_fecha_inicio,"2026-10-19");
  assert.equal(answer.horas_fichadas,8);
});

test("un empleado no puede consultar los fichajes de Fernando",async()=>{
  let called=false;
  const fake = {
    from:(table:string)=>{
      assert.equal(table,"profiles");
      return {select:()=>({eq:()=>({single:async()=>({data:{first_name:"Julia",last_name:"V."},error:null})})})};
    },
    rpc:async()=>{called=true;return {data:[],error:null};},
  } as unknown as Client;
  const answer=await runKnowledgeTool("consultar_horas_trabajadas",
    {periodo:"semana_pasada",empleado:"Fernando"},
    {supabase:fake,role:"staff",userId,today});
  assert.deepEqual(answer,{error:"Sin permiso para consultar horas de otra persona"});
  assert.equal(called,false);
});
