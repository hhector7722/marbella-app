import type { createClient } from "@/utils/supabase/server";
import type { RoleName } from "./permissions";
import { runKnowledgeTool } from "./knowledge-tools.ts";
import { canExecute } from "./permissions.ts";

type Client = Awaited<ReturnType<typeof createClient>>;
type Ingredient = {
  nombre: string;
  cantidad_bruta?: number | null;
  cantidad_neta?: number | null;
  unidad?: string | null;
};
type Subrecipe = {
  nombre: string;
  cantidad?: number | null;
  unidad?: string | null;
  componentes?: {
    ingredientes?: Ingredient[];
    subrecetas?: Subrecipe[];
    error?: string;
    posible_truncamiento?: boolean;
  };
};
type RecipeData = {
  nombre: string;
  elaboracion?: string | null;
  rendimiento?: number | null;
  unidad_rendimiento?: string | null;
  ingredientes?: Ingredient[];
  subrecetas?: Subrecipe[];
  posible_truncamiento?: boolean;
  error?: string;
};

function normalized(text: string): string {
  return text.toLocaleLowerCase("es").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").trim();
}
function formatted(value: number): string {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 3 }).format(value);
}
function ingredientQuantity(p: Ingredient, scale = 1): string {
  const net=p.cantidad_neta, gross=p.cantidad_bruta;
  const value=typeof net==="number" && Number.isFinite(net) ? net :
    typeof gross==="number" && Number.isFinite(gross) ? gross : null;
  return value===null ? "cantidad no registrada" :
    (formatted(value*scale)+" "+(p.unidad??"")).trim();
}
function renderSubrecipe(sub: Subrecipe, depth=0,scale=1): string[] {
  const pad="  ".repeat(depth+1);
  const val=typeof sub.cantidad==="number" && Number.isFinite(sub.cantidad)
    ? " — "+formatted(sub.cantidad*scale)+" "+(sub.unidad??"") : "";
  const lines=[pad+"• Subreceta: "+sub.nombre+val];
  if (!sub.componentes || sub.componentes.error) {
    lines.push(pad+"  Composición no disponible.");
    return lines;
  }
  if (sub.componentes.ingredientes?.length) {
    lines.push(pad+"  Ingredientes del lote base (sin escalar):");
    for (const p of sub.componentes.ingredientes) {
      lines.push(pad+"  · "+p.nombre+" — "+ingredientQuantity(p));
    }
  }
  if (depth<5) {
    for (const child of sub.componentes.subrecetas??[]) {
      lines.push(...renderSubrecipe(child,depth+1));
    }
  } else if ((sub.componentes.subrecetas?.length??0)>0) {
    lines.push(pad+"  Composición demasiado profunda.");
  }
  if (sub.componentes.posible_truncamiento) lines.push(pad+"  Composición incompleta.");
  return lines;
}

/** Read-only recipe retrieval. Never invents ingredient quantities or production yields. */
export async function tryDirectRecipeAnswer(
  question: string,
  ctx: { supabase: Client; role: RoleName; userId: string; today: string },
): Promise<string | null> {
  const query=normalized(question);
  const reverse=query.match(/(?:que|cuales?)\s+recetas\s+(?:contienen|llevan|utilizan|usan)\s+(?:el |la |los |las )?(.+?)(?:[?.!]|$)/);
  if (reverse) {
    if (!canExecute(ctx.role,"gestionar_recetas")) {
      return "Tu perfil no tiene permiso para consultar recetas.";
    }
    const term=reverse[1].trim().replace(/[^\p{L}\p{N}\s-]/gu,"").trim();
    if (term.length<2||term.length>70) return null;
    const stem=term.slice(0,Math.min(3,term.length));
    const {data:ingredients,error:ingredientError}=await ctx.supabase.from("ingredients")
      .select("id,name").ilike("name","%"+stem+"%").limit(300);
    if (ingredientError || !Array.isArray(ingredients)) return null;
    const matched=ingredients.filter(i=>typeof i.name==="string"&&normalized(i.name).includes(term));
    if (!matched.length) return "No encuentro un ingrediente registrado que coincida con «"+term+"».";
    const ids=matched.map(i=>i.id).filter((id):id is string=>typeof id==="string");
    if (!ids.length) return null;
    const {data:direct,error:relationError}=await ctx.supabase.from("recipe_ingredients")
      .select("recipe_id,ingredient_id").in("ingredient_id",ids).limit(3000);
    if (relationError || !Array.isArray(direct)) return null;
    const recipeIds=new Set<string>(direct.map(link=>link.recipe_id).filter((id):id is string=>typeof id==="string"));
    let frontier=[...recipeIds], nestedFailed=false, truncated=direct.length===3000;
    // La misma materia prima puede entrar indirectamente mediante una subreceta.
    for(let depth=0;depth<5&&frontier.length;depth++){
      const {data:parents,error}=await ctx.supabase.from("recipe_subrecipes")
        .select("parent_recipe_id,child_recipe_id").in("child_recipe_id",frontier).limit(3000);
      if(error||!Array.isArray(parents)){nestedFailed=true;break;}
      if(parents.length===3000)truncated=true;
      const next:string[]=[];
      for(const row of parents){
        if(typeof row.parent_recipe_id==="string"&&!recipeIds.has(row.parent_recipe_id)){
          recipeIds.add(row.parent_recipe_id);next.push(row.parent_recipe_id);
        }
      }
      frontier=next;
      if(depth===4&&frontier.length)truncated=true;
    }
    if(!recipeIds.size) return "No hay recetas vinculadas al ingrediente «"+term+"».";
    const {data:recipes,error:recipeError}=await ctx.supabase.from("recipes")
      .select("id,name").in("id",[...recipeIds].slice(0,1000)).limit(1000);
    if(recipeError||!Array.isArray(recipes)) return null;
    const names=recipes.map(r=>String(r.name??"")).filter(Boolean).sort((a,b)=>a.localeCompare(b,"es"));
    const note=nestedFailed?" No he podido comprobar las subrecetas.":truncated||recipeIds.size>1000?" Lista potencialmente incompleta por límites de consulta.":"";
    return "Recetas con «"+term+"» como ingrediente directo o mediante subrecetas:\n"+
      (names.length?names.map(n=>"• "+n).join("\n"):"No se encontraron recetas visibles.")+note;
  }
  const directIntent=/(?:que.*(?:ingredientes|lleva)|ingredientes de|como se prepara|elaboracion de|preparar \d+|cantidades.*preparar|cuantos? gramos|cuantas? (?:unidades|raciones) lleva)/.test(query);
  if (!directIntent || /(?:que recetas|cuales recetas|comprar|stock|inventario|precio|coste|margen|rentab|mas de precio|han subido)/.test(query)) return null;
  const {data,error}=await ctx.supabase.from("recipes").select("name,is_sellable").order("name").limit(1000);
  if (error || !Array.isArray(data)) return null;
  const candidates=data
    .filter((row): row is {name:string;is_sellable:boolean|null}=>typeof row?.name==="string")
    .map(row=>({name:row.name,key:normalized(row.name),sellable:row.is_sellable===true}))
    .filter(row=>query.includes(row.key) || row.key.split(/\s+/).some(word=>
      word.length>=5 && !["plato","preparado","racion","grande","medio"].includes(word) && query.includes(word)));
  if (!candidates.length) return null;
  // Explicit exact names beat production recipes; otherwise choose the unique sellable dish.
  const mentioned=candidates.filter(row=>query.includes(row.key));
  const pool=mentioned.length?mentioned:candidates;
  const sellable=pool.filter(row=>row.sellable);
  const ranked=(sellable.length===1?sellable:pool)
    .sort((a,b)=>b.key.length-a.key.length);
  if (ranked.length>1 && (!mentioned.length || ranked[0].key.length===ranked[1].key.length)) {
    return "Hay varias recetas que podrían coincidir: "+
      ranked.slice(0,6).map(row=>row.name).join(", ")+". Indica cuál necesitas.";
  }
  const chosen=ranked[0];
  const found=await runKnowledgeTool("consultar_receta_detallada",{nombre:chosen.name},ctx) as RecipeData;
  if (found.error || !found.nombre || !Array.isArray(found.ingredientes)) return null;

  const scaleMatch=query.match(/(?:preparar|para)\s+(\d{1,3})\s+(?:sangrias?|raciones?|porciones?|unidades?|platos?)/);
  const count=scaleMatch?Number(scaleMatch[1]):null;
  const yieldValue=found.rendimiento;
  const scale=count!==null && typeof yieldValue==="number" && Number.isFinite(yieldValue) && yieldValue>0
    ? count/yieldValue : null;
  if (count!==null && scale===null) {
    return "La receta "+found.nombre+" no tiene un rendimiento verificable registrado; no puedo calcular exactamente "+count+" raciones.";
  }
  const gramsOnly=/cuantos? gramos/.test(query);
  let ingredients=gramsOnly
    ? found.ingredientes.filter(p=>/^(?:g|gr|gramos|kg)$/i.test((p.unidad??"").trim()))
    : found.ingredientes;
  if (gramsOnly && query.includes("carne")) {
    const meat=ingredients.filter(p=>normalized(p.nombre).includes(normalized(found.nombre)));
    if (meat.length) ingredients=meat;
  }
  if (!ingredients.length && !(found.subrecetas?.length)) {
    return "La receta "+found.nombre+" no tiene ingredientes verificables para esta consulta.";
  }
  const unit=count!==null && count>1 && found.unidad_rendimiento==="ración"
    ? "raciones" : found.unidad_rendimiento||"elaboraciones";
  const lines=[count===null ? "Ingredientes de "+found.nombre+":" :
    "Ingredientes para "+count+" "+unit+" de "+found.nombre+":"];
  for (const p of ingredients) lines.push("• "+p.nombre+" — "+ingredientQuantity(p,scale??1));
  if (!gramsOnly && found.subrecetas?.length) {
    lines.push("Subrecetas incorporadas:");
    for (const sub of found.subrecetas) lines.push(...renderSubrecipe(sub,0,scale??1));
    lines.push("Los ingredientes interiores indican el lote base de cada subreceta, no el consumo total de esta ración.");
  }
  if (/(?:como se prepara|elaboracion|como elaborar)/.test(query) && found.elaboracion?.trim()) {
    lines.push("Elaboración: "+found.elaboracion.trim());
  }
  if (found.posible_truncamiento) lines.push("Atención: el detalle de ingredientes podría estar truncado.");
  if (count!==null) lines.push("Cálculo basado en el rendimiento registrado, sin comprobar existencias.");
  return lines.join("\n");
}
