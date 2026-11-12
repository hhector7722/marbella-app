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
     {name:"Vasos 240ml",stock_current:"-11927.250",unit:"ud",inventory_visible:true,recommended_stock:100,archived_at:null},
     {name:"Vasos 350ml",stock_current:14,unit:"ud",inventory_visible:true,recommended_stock:10,archived_at:null},
     {name:"Aceite oliva",stock_current:8.5,unit:"l",inventory_visible:true,recommended_stock:10,archived_at:null},
     {name:"Sangría cava",stock_current:0,unit:"ud",inventory_visible:true,recommended_stock:0,archived_at:null},
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

test("stock recomendado: no confunde mínimos con saldos generales",async()=>{
 const f=fixture();
 const a=await tryDirectInventoryAnswer("¿Qué productos están por debajo de su stock mínimo?",{supabase:f.db,role:"staff"});
 assert.match(a??"",/No existe un umbral de «stock mínimo» separado/);
 assert.match(a??"",/2 de 3 productos activos/);
 assert.match(a??"",/Vasos 240ml/);
 assert.match(a??"",/Aceite oliva/);
 assert.doesNotMatch(a??"",/2 productos con saldo positivo/);
});
test("productos activados no se confunden con los que tienen saldo positivo",async()=>{
 const f=fixture();
 const a=await tryDirectInventoryAnswer("¿Qué productos tenemos activados en inventario?",{supabase:f.db,role:"staff"});
 assert.match(a??"",/4 productos activados/);
 assert.match(a??"",/Sangría cava/);
});
