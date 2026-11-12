import type { createClient } from "@/utils/supabase/server";
import type { RoleName } from "./permissions";

type Client = Awaited<ReturnType<typeof createClient>>;

function clean(value: string): string {
  return value.toLocaleLowerCase("es").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").trim();
}

/**
 * Trazabilidad de artículos adquiridos: exclusivamente facturas y líneas
 * contabilizadas/registradas; nunca infiere compras a partir del catálogo.
 */
export async function tryDirectSupplierPurchases(
  question: string,
  ctx: { supabase: Client; role: RoleName },
): Promise<string | null> {
  const q = clean(question).replace(/[?!.]/g, "");
  const intent = q.match(/(?:que|cuales)\s+productos?\s+(?:le\s+)?(?:compramos|hemos comprado|adquirimos|se compraron)\s+(?:a|al|de|del)\s+(.+)$/)
    ?? q.match(/(?:que|cuales)\s+(?:articulos|productos)\s+(?:hemos recibido|recibimos)\s+(?:de|del)\s+(.+)$/);
  if (!intent) return null;

  // El detalle de las facturas es exclusivo de gerencia, incluso si el
  // proveedor también aparece en módulos visibles al supervisor.
  if (ctx.role !== "manager" && ctx.role !== "admin") {
    return "Tu perfil no tiene permiso para consultar los artículos facturados por proveedores.";
  }
  const requested = intent[1]?.replace(/[^\p{L}\p{N} &.-]/gu,"").trim();
  if (!requested || requested.length < 2 || requested.length > 70) return null;
  const stem = requested.slice(0,Math.min(requested.length,4))
    .replace(/[%_,]/g,"");
  if (stem.length < 2) return null;
  const {data:providers,error:pe}=await ctx.supabase.from("suppliers")
    .select("id,name").ilike("name","%"+stem+"%").limit(100);
  if(pe||!Array.isArray(providers)) return null;
  const matched=providers.filter(p=>typeof p.name==="string"&&clean(p.name).includes(requested));
  if(!matched.length) return "No encuentro el proveedor «"+requested+"» en el catálogo.";
  if(matched.length>1) return "Varios proveedores coinciden: "+matched.map(p=>p.name).join(", ")+". Especifica cuál.";
  const supplier=matched[0];
  const {data:docs,error:de}=await ctx.supabase.from("purchase_invoices")
    .select("id").eq("supplier_id",supplier.id).limit(1000);
  if(de||!Array.isArray(docs)) return "No se pudieron consultar los documentos del proveedor.";
  const ids=docs.map(d=>d.id).filter((id):id is string=>typeof id==="string");
  if(!ids.length) return "No hay facturas registradas para "+supplier.name+".";
  const {data:lines,error:le}=await ctx.supabase.from("purchase_invoice_lines")
    .select("original_name").in("invoice_id",ids).limit(3000);
  if(le||!Array.isArray(lines)) return "No se pudieron consultar las líneas de las facturas de "+supplier.name+".";
  const descriptions=[...new Set(lines
    .map(l=>typeof l.original_name==="string"?l.original_name.trim():"")
    .filter(Boolean)
    .filter(name=>!/^%?dto\.?\s|^descuento\b/i.test(name))
  )].sort((a,b)=>a.localeCompare(b,"es"));
  if(!descriptions.length) return "Las facturas de "+supplier.name+" no contienen descripciones de artículos verificables.";
  const cap=40;
  return "Artículos que figuran en las facturas registradas de "+supplier.name+" ("+docs.length+" documentos):\n"+
    descriptions.slice(0,cap).map(x=>"• "+x).join("\n")+
    (descriptions.length>cap || lines.length===3000 || docs.length===1000
      ?"\nListado parcial: existen más registros; restringe la consulta para obtener otros.":"")+
    "\nLos nombres son las descripciones originales del proveedor, no productos de inventario necesariamente.";
}
