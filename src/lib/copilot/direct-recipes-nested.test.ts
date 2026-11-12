import assert from "node:assert/strict";
import { test } from "node:test";
import { tryDirectRecipeAnswer } from "./direct-recipes.ts";
import type { createClient } from "@/utils/supabase/server";

type Client=Awaited<ReturnType<typeof createClient>>;
const main={id:"r-bravas",name:"Patatas bravas",yield_quantity:null,yield_unit:null,
  elaboration:"Freír y servir",presentation:"Bol",sale_price:7};
const prod={id:"r-prod",name:"Patatas bravas prod",yield_quantity:20,yield_unit:"ud",
  elaboration:"Cocinar",presentation:null,sale_price:null};
const sauce={id:"r-sauce",name:"Salsa brava",yield_quantity:75,yield_unit:"ud",
  elaboration:"Mezclar",presentation:null,sale_price:null};
const recipes=[main,prod,sauce];

function createFixture():Client {
 const from=(table:string)=>{
  let recipeId="",pattern="";
  const q={
   select:(_fields:string)=>q,
   order:(_key:string)=>q,
   ilike:(_key:string,value:string)=>{pattern=value.slice(1,-1).toLowerCase();return q},
   eq:(_key:string,value:string)=>{recipeId=value;return q},
   in:async (_key:string,values:string[])=>{
    if(table==="ingredients") return {data:values.map(id=>({
      id,name:id==="i-potato"?"Patata monalisa":"Ketchup",unit:id==="i-potato"?"g":"ml",
    })),error:null};
    if(table==="recipes")return {data:recipes.filter(r=>values.includes(r.id)),error:null};
    return {data:[],error:null};
   },
   limit:async (_number:number)=>{
    if(table==="recipes"){
      return {data:!pattern
        ? recipes.map(r=>({...r,is_sellable:r.id===main.id}))
        : recipes.filter(r=>r.name.toLowerCase().includes(pattern)),error:null};
    }
    if(table==="recipe_ingredients"){
      const r=recipeId==="r-bravas"
        ? [{ingredient_id:"i-potato",quantity_gross:250,quantity_net:null,quantity_half:null,unit:"g"}]
        : recipeId==="r-sauce"
          ? [{ingredient_id:"i-ketchup",quantity_gross:120,quantity_net:null,quantity_half:null,unit:"ml"}]
          : [];
      return {data:r,error:null};
    }
    if(table==="recipe_subrecipes"){
      return {data:recipeId==="r-bravas"?
        [{child_recipe_id:"r-sauce",quantity:1,unit:"ud"}]:[],error:null};
    }
    return {data:[],error:null};
   },
  };
  return q;
 };
 return {from} as unknown as Client;
}

test("bravas: prioriza plato vendible sobre recetas internas y no omite su salsa",async()=>{
 const answer=await tryDirectRecipeAnswer("¿Cuáles son los ingredientes de las bravas?",{
  supabase:createFixture(),role:"staff",
  userId:"11111111-1111-4111-8111-111111111111",today:"2026-11-12"
 });
 assert.match(answer??"",/^Ingredientes de Patatas bravas:/);
 assert.match(answer??"",/Patata monalisa — 250 g/);
 assert.match(answer??"",/Subreceta: Salsa brava — 1 ud/);
 assert.match(answer??"",/Ketchup — 120 ml/);
 assert.match(answer??"",/lote base/);
});

test("salsa expresamente pedida no se sustituye por bravas comercial",async()=>{
 const answer=await tryDirectRecipeAnswer("¿Qué ingredientes lleva la salsa brava?",{
  supabase:createFixture(),role:"chef",
  userId:"11111111-1111-4111-8111-111111111111",today:"2026-11-12"
 });
 assert.match(answer??"",/^Ingredientes de Salsa brava:/);
 assert.doesNotMatch(answer??"",/Patata monalisa/);
});
