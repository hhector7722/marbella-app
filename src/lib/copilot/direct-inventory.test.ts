import assert from "node:assert/strict";
import {test} from "node:test";
import {tryDirectInventoryAnswer} from "./direct-inventory.ts";
import type {createClient} from "@/utils/supabase/server";
type Client=Awaited<ReturnType<typeof createClient>>;
function fixture() {
 let count=0;
 const db={from:(name:string)=>{
   count++;
   assert.equal(name,"ingredients");
   const q={select:()=>q,order:()=>q,limit:async()=>({data:[
     {name:"Vasos 240ml",stock_current:"-11927.250",unit:"ud"},
     {name:"Vasos 350ml",stock_current:14,unit:"ud"},
     {name:"Aceite oliva",stock_current:8.5,unit:"l"},
     {name:"Sangría cava",stock_current:0,unit:"ud"},
   ],error:null})};
   return q;
 }};
 return {db:db as unknown as Client,calls:()=>count};
}
test("vasos de 240 ml: encuentra el SKU sin espacio y advierte del saldo negativo",async()=>{
 const f=fixture();
 const a=await tryDirectInventoryAnswer("¿Cuántas unidades de vasos de 240 ml tenemos?",{supabase:f.db,role:"staff"});
 assert.match(a??"",/Vasos 240ml/);
 assert.match(a??"",/-11\.927,25 ud/);
 assert.match(a??"",/no representa unidades físicamente disponibles/);
 assert.equal(f.calls(),1);
});
test("inventario: resume saldos positivos, negativos y cero sin inventar stock físico",async()=>{
 const f=fixture();
 const a=await tryDirectInventoryAnswer("¿Qué productos tenemos actualmente en stock?",{supabase:f.db,role:"manager"});
 assert.match(a??"",/2 productos con saldo positivo/);
 assert.match(a??"",/1 a cero/);
 assert.match(a??"",/1 con saldo negativo/);
});
test("preguntas de recetas no activan una lectura de inventario",async()=>{
 const f=fixture();
 const a=await tryDirectInventoryAnswer("¿Cuántos gramos lleva la entraña?",{supabase:f.db,role:"staff"});
 assert.equal(a,null);
 assert.equal(f.calls(),0);
});
