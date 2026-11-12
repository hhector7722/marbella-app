import assert from "node:assert/strict";
import {test} from "node:test";
import {tryDirectRecipeCostAnswer} from "./direct-recipe-costs.ts";
import type {createClient} from "@/utils/supabase/server";
type Client=Awaited<ReturnType<typeof createClient>>;
function fixture(){
 const calls:string[]=[];
 const recipes=[{id:"bravas",name:"Patatas bravas",sale_price:"5.20",servings:1},
 {id:"prod",name:"Patatas bravas prod",sale_price:"0.00",servings:1},
 {id:"entrana",name:"Entraña",sale_price:null,servings:1}];
 return {
  calls,
  db:{
   from:(table:string)=>{calls.push(table);assert.equal(table,"recipes");return {
     select:()=>({ilike:(_f:string,q:string)=>({limit:async()=>({data:recipes.filter(r=>r.name.toLocaleLowerCase("es").includes(q.replaceAll("%","").replaceAll("n","n"))||q.includes("entra")),error:null})})}),
   }},
   rpc:async(fn:string,args:{p_recipe_id:string})=>{calls.push(fn);return {
     data:{ok:true,total_cost_eur:args.p_recipe_id==="entrana"?2.31294:1.613198968},
     error:null,
   }},
  } as unknown as Client,
 };
}
test("patatas bravas: coste exacto del motor de escandallos",async()=>{
 const m=fixture();const answer=await tryDirectRecipeCostAnswer(
  "Cuanto nos cuesta preparar una racion de bravas?",{supabase:m.db,role:"manager"});
 assert.match(answer??"",/1,61\s?€/);
 assert.deepEqual(m.calls,["recipes","get_recipe_cost_v2"]);
});
test("Entraña: da coste y no inventa precio de venta/margen",async()=>{
 const m=fixture();const answer=await tryDirectRecipeCostAnswer(
  "Que margen bruto tiene la entrana?",{supabase:m.db,role:"admin"});
 assert.match(answer??"",/2,31\s?€/);
 assert.match(answer??"",/No hay precio de venta registrado/);
});
test("staff y chef no consultan coste económico",async()=>{
 for(const role of ["staff","chef"] as const){
  const m=fixture();const answer=await tryDirectRecipeCostAnswer(
    "Cuanto cuesta preparar una racion de bravas?",{supabase:m.db,role});
  assert.match(answer??"",/no tiene permiso/);assert.equal(m.calls.length,0);
 }
});

test("supervisor consulta escandallos como en el editor de recetas",async()=>{
 const m=fixture(); const answer=await tryDirectRecipeCostAnswer(
  "Cuanto nos cuesta preparar una racion de bravas?",{supabase:m.db,role:"supervisor"});
 assert.match(answer??"",/1,61\s?€/);
 assert.deepEqual(m.calls,["recipes","get_recipe_cost_v2"]);
});
