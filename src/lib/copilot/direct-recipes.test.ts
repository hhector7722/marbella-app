import assert from "node:assert/strict";
import { test } from "node:test";
import { tryDirectRecipeAnswer } from "./direct-recipes.ts";
import { runKnowledgeTool } from "./knowledge-tools.ts";
import type { createClient } from "@/utils/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;
const uid="11111111-1111-4111-8111-111111111111";

function fixture(recipeName: string, ingredient: string, amount: number, unit="g", servingsOnly=false) {
  const calls: string[]=[];
  let directSearch="";
  const recipes=[{id:"r1",name:recipeName,elaboration:"Mezclar y servir",presentation:"Vaso",
    yield_quantity:servingsOnly?null:1,servings:1,yield_unit:servingsOnly?null:"ración",sale_price:10}];
  const supabase={
    from:(table:string)=>{
      calls.push(table);
      const q={
        select:(_fields:string)=>q,
        ilike:(_field:string,needle:string)=>{directSearch=needle.slice(1,-1);return q},
        eq:(_field:string,_value:unknown)=>q,
        order:(_field:string)=>{directSearch="";return q},
        in:(_field:string,_values:unknown[])=>Promise.resolve({data:[{id:"i1",name:ingredient,unit}],error:null}),
        limit:(_n:number)=>Promise.resolve({data:table==="recipes"?
          (!directSearch || recipeName.toLocaleLowerCase("es").includes(directSearch.toLowerCase())
            ? recipes : []):
          table==="recipe_ingredients"?[{ingredient_id:"i1",quantity_net:amount,quantity_gross:amount,unit}]:[],error:null}),
      };
      return q;
    },
  };
  return {supabase:supabase as unknown as Client,calls};
}

test("Entraña con ñ conserva el nombre y retorna ingredientes reales sin LLM",async()=>{
 const f=fixture("Entraña","Entraña vacuna",200);
 const answer=await tryDirectRecipeAnswer("¿Qué ingredientes lleva la entraña?",
   {supabase:f.supabase,role:"staff",userId:uid,today:"2026-11-12"});
 assert.match(answer??"",/Entraña vacuna — 200 g/);
 assert.ok(f.calls.includes("recipe_ingredients"));
});

test("Búsqueda sin ñ recupera Entraña mediante fallback normalizado",async()=>{
 const f=fixture("Entraña","Entraña vacuna",200);
 const raw=await runKnowledgeTool("consultar_receta_detallada",{nombre:"entrana"},
   {supabase:f.supabase,role:"manager",userId:uid,today:"2026-11-12"}) as {nombre:string};
 assert.equal(raw.nombre,"Entraña");
});

test("Sangría multiplica cantidades verificadas sin inventar el rendimiento",async()=>{
 const f=fixture("Sangria cava","Juver naranja",150,"ml",true);
 const answer=await tryDirectRecipeAnswer("¿Qué cantidades necesito para preparar 15 sangrías?",
   {supabase:f.supabase,role:"chef",userId:uid,today:"2026-11-12"});
 assert.match(answer??"",/Juver naranja — 2\.250 ml/);
});

test("Costes de recetas nunca se sustituyen por una respuesta inventada de ingredientes",async()=>{
 const f=fixture("Sangria cava","Juver naranja",150,"ml");
 const answer=await tryDirectRecipeAnswer("¿Cuánto cuesta preparar una sangría?",
   {supabase:f.supabase,role:"manager",userId:uid,today:"2026-11-12"});
 assert.equal(answer,null);
});
