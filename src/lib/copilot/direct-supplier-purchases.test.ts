import assert from "node:assert/strict";
import { test } from "node:test";
import { tryDirectSupplierPurchases } from "./direct-supplier-purchases.ts";
import type { createClient } from "@/utils/supabase/server";

type Client=Awaited<ReturnType<typeof createClient>>;
function mock(){
 const calls:string[]=[];
 const db={
  from:(table:string)=>{
   calls.push(table);
   if(table==="suppliers")return {select:()=>({ilike:()=>({limit:async()=>({data:[{id:17,name:"Sanilec"}],error:null})})})};
   if(table==="purchase_invoices")return {select:()=>({eq:()=>({limit:async()=>({data:[{id:"i1"}],error:null})})})};
   if(table==="purchase_invoice_lines")return {select:()=>({in:()=>({limit:async()=>({data:[
    {original_name:"BOWL BIONIC NATURAL 350ml"},
    {original_name:"PALETINA MADERA CAFE"},
    {original_name:"BOWL BIONIC NATURAL 350ml"},
   ],error:null})})})};
   throw Error("Unexpected table "+table);
  },
 } as unknown as Client;
 return {db,calls};
}

test("gerencia recupera nombres de líneas reales y no inventa compras a Sanilec",async()=>{
 const m=mock();
 const answer=await tryDirectSupplierPurchases("¿Qué productos compramos a Sanilec?",{supabase:m.db,role:"manager"});
 assert.match(answer??"",/BOWL BIONIC/);
 assert.match(answer??"",/PALETINA/);
 assert.equal((answer??"").match(/BOWL BIONIC/g)?.length,1);
 assert.deepEqual(m.calls,["suppliers","purchase_invoices","purchase_invoice_lines"]);
});
test("staff, supervisor y chef no alcanzan ni el directorio de facturas",async()=>{
 for(const role of ["staff","supervisor","chef"] as const){
  const m=mock();
  const answer=await tryDirectSupplierPurchases("Que productos compramos a Sanilec?",{supabase:m.db,role});
  assert.match(answer??"",/no tiene permiso/);
  assert.equal(m.calls.length,0);
 }
});
