import { strict as assert } from "node:assert";
import { test } from "node:test";
import { resolveCopilotFollowup } from "./followup-context.ts";
import { selectGroqTools } from "./groq-chat.ts";
import { KNOWLEDGE_TOOL_DEFS } from "./knowledge-tools.ts";

const now="2026-10-26";
const messages=["¿Cuántas horas trabajó Fernando la semana pasada?"];
test("horas: Silvia conserva periodo de Fernando sin UUID",()=>{
  const result=resolveCopilotFollowup("¿y Silvia?",messages,now);
  assert.equal(result?.toolName,"consultar_horas_trabajadas");
  assert.deepEqual(result?.args,{periodo:"semana_pasada",empleado:"silvia"});
  assert.equal(result?.continued,true);
  assert.deepEqual(selectGroqTools(result!.query,Object.values(KNOWLEDGE_TOOL_DEFS))
    .map(t=>t.function.name),["consultar_horas_trabajadas"]);
});
test("horas: Willy conserva el mismo periodo con dos seguimientos sucesivos",()=>{
  const result=resolveCopilotFollowup("y Willy?",[...messages,"¿y Silvia?"],now);
  assert.equal(result?.args.empleado,"willy");
  assert.equal(result?.args.periodo,"semana_pasada");
});
test("horas: Fernando directo resuelve nombre y semana",()=>{
  const result=resolveCopilotFollowup(messages[0],[],now);
  assert.equal(result?.args.empleado,"fernando");
  assert.equal(result?.args.periodo,"semana_pasada");
});
test("ventas: sábado era 24 de octubre de 2026, no el 22",()=>{
  const q="¿Cuántos croissant vendimos el sábado?";
  const result=resolveCopilotFollowup(q,[],now);
  assert.equal(result?.toolName,"consultar_ventas_productos");
  assert.deepEqual(result?.args,{
    periodo:"rango",fecha_inicio:"2026-10-24",fecha_fin:"2026-10-24",
    producto:"croissant",
  });
});
test("ventas: domingo cambia SOLO fecha y mantiene croissants",()=>{
  const q="¿Cuántos croissant vendimos el sábado?";
  const result=resolveCopilotFollowup("¿y el domingo?",[q],now);
  assert.equal(result?.toolName,"consultar_ventas_productos");
  assert.deepEqual(result?.args,{
    periodo:"rango",fecha_inicio:"2026-10-25",fecha_fin:"2026-10-25",
    producto:"croissant",
  });
  assert.deepEqual(selectGroqTools(result!.query,Object.values(KNOWLEDGE_TOOL_DEFS))
    .map(t=>t.function.name),["consultar_ventas_productos"]);
});
test("sin un antecedente no inventa qué se vendió ni a qué trabajador se refiere",()=>{
  assert.equal(resolveCopilotFollowup("¿y el domingo?",[],now),null);
  assert.equal(resolveCopilotFollowup("¿y Silvia?",[],now),null);
});
test("preguntas de otros temas no se fuerzan a fichajes ni ventas",()=>{
  assert.equal(resolveCopilotFollowup("¿Qué lleva el Aperol?",messages,now),null);
});
