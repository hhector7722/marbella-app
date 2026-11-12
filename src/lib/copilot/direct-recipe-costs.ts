import type { createClient } from "@/utils/supabase/server";
import type { RoleName } from "./permissions";

type Client=Awaited<ReturnType<typeof createClient>>;

function normal(t:string):string{
  return t.toLocaleLowerCase("es").normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").replace(/ñ/g,"n")
    .replace(/[?!.]/g,"").trim();
}
const eur=(value:number)=>new Intl.NumberFormat("es-ES",{
  style:"currency",currency:"EUR",maximumFractionDigits:2,minimumFractionDigits:2,
}).format(value);

/** Motor oficial de escandallos get_recipe_cost_v2; nunca recalcula precios por aproximación. */
export async function tryDirectRecipeCostAnswer(
  question:string,
  ctx:{supabase:Client;role:RoleName},
):Promise<string|null>{
  const q=normal(question);
  const margin=/\bmargen (?:bruto|comercial)\b/.test(q);
  const cost=/\b(?:cuesta|coste|costo|escandallo)\b/.test(q)
    && /\b(?:preparar|elaborar|racion|receta)\b/.test(q);
  if(!margin&&!cost)return null;
  if(ctx.role!=="manager"&&ctx.role!=="admin"){
    return "Tu perfil no tiene permiso para consultar el coste económico de las recetas.";
  }
  let recipeName:string|undefined;
  if(margin) recipeName=q.match(/margen (?:bruto|comercial)(?:\s+(?:tiene|de|del|para))?\s+(?:la|el|las|los)?\s*(.+)$/)?.[1];
  else recipeName=q.match(/(?:preparar|elaborar)\s+(?:una?\s+)?(?:racion(?:es)?\s+de\s+)?(.+)$/)?.[1]
    ??q.match(/(?:coste|costo|escandallo)\s+(?:de|del)\s+(.+)$/)?.[1];
  if(!recipeName)return null;
  recipeName=recipeName.replace(/^(?:la|el|las|los)\s+/,"").trim();
  if(recipeName.length<3||recipeName.length>80)return null;
  // No transformar una consulta de lote en una sola ración.
  if(/\b\d+\s+raciones?\b/.test(q))return null;
  const stem=recipeName.slice(0,Math.min(4,recipeName.length));
  const {data:recipes,error}=await ctx.supabase.from("recipes")
    .select("id,name,sale_price,servings").ilike("name","%"+stem+"%").limit(120);
  if(error||!Array.isArray(recipes))return "No se ha podido consultar el catálogo de recetas.";
  const matches=recipes.filter(r=>typeof r.name==="string"&&
    normal(r.name).includes(recipeName!));
  if(!matches.length)return "No encuentro una receta que coincida con «"+recipeName+"».";
  const exact=matches.filter(r=>normal(r.name)===recipeName);
  const sellable=matches.filter(r=>Number(r.sale_price)>0);
  const candidates=exact.length?exact:sellable.length===1?sellable:matches;
  if(candidates.length!==1)return "Hay varias recetas que coinciden: "+
    candidates.slice(0,10).map(r=>r.name).join(", ")+". Especifica cuál.";
  const recipe=candidates[0];
  const {data,error:rpcError}=await ctx.supabase.rpc("get_recipe_cost_v2",{
    p_recipe_id:recipe.id,
  });
  if(rpcError||!data||typeof data!=="object"||Array.isArray(data))
    return "No he podido consultar el motor oficial de costes de "+recipe.name+".";
  const out=data as Record<string,unknown>;
  const price=Number(out.total_cost_eur);
  if(out.ok!==true||!Number.isFinite(price)||price<0)
    return "El escandallo de "+recipe.name+" no está completo o contiene errores. No puedo dar un coste fiable.";
  const perServing=Number(recipe.servings)||1;
  if(!Number.isFinite(perServing)||perServing<=0)return "El rendimiento de la receta no es válido.";
  const costServing=price/perServing;
  const base="Según el escandallo oficial, "+recipe.name+": "+eur(costServing)+
    " por ración ("+eur(price)+" por receta, "+perServing+" raciones).";
  if(!margin)return base;
  const sale=recipe.sale_price===null?NaN:Number(recipe.sale_price);
  if(!Number.isFinite(sale)||sale<=0)
    return base+" No hay precio de venta registrado; no puedo calcular el margen bruto.";
  const difference=sale-costServing;
  const percent=difference/sale*100;
  return base+" Precio de venta registrado: "+eur(sale)+
    ". Diferencia coste-precio: "+eur(difference)+". Margen sobre el precio registrado: "+
    new Intl.NumberFormat("es-ES",{maximumFractionDigits:1}).format(percent)+
    "% (sin ajuste fiscal del IVA).";
}
