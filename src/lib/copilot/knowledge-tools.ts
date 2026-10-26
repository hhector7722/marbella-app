import type { createClient } from "@/utils/supabase/server";
import { canExecute, type RoleName } from "./permissions.ts";
import type { GroqTool } from "./groq-chat";

type Client = Awaited<ReturnType<typeof createClient>>;
export type KnowledgeToolName = "consultar_ventas_productos" | "consultar_receta_detallada" | "consultar_horas_trabajadas";
export const KNOWLEDGE_TOOLS = new Set<KnowledgeToolName>([
  "consultar_ventas_productos", "consultar_receta_detallada", "consultar_horas_trabajadas",
]);

type Dates = { periodo: "hoy" | "ayer" | "esta_semana" | "semana_pasada" | "rango"; fecha_inicio?: string; fecha_fin?: string };

const dateProps = {
  periodo: { type: "string", enum: ["hoy", "ayer", "esta_semana", "semana_pasada", "rango"],
    description: "Periodo pedido. No inventes fechas: usa periodo relativo salvo fechas explícitas." },
  fecha_inicio: { type: "string", description: "Solo para rango, YYYY-MM-DD" },
  fecha_fin: { type: "string", description: "Solo para rango, YYYY-MM-DD" },
};

export const KNOWLEDGE_TOOL_DEFS: Record<KnowledgeToolName, GroqTool> = {
  consultar_ventas_productos: {
    type: "function",
    function: {
      name: "consultar_ventas_productos",
      description: "Ventas REALMENTE desglosadas por ARTÍCULO, sus unidades e importe desde los tickets. Usa para 'cuántos cafés', 'top vendidos', refrescos, bocadillos, ventas de un producto, horarios de venta. No confundir tickets con unidades.",
      parameters: {
        type: "object",
        properties: { ...dateProps, producto: { type: "string", description: "Nombre o categoría de producto; ej. cafe, sangria, bravas. Omite para top general." } },
        required: ["periodo"], additionalProperties: false,
      },
    },
  },
  consultar_receta_detallada: {
    type: "function",
    function: {
      name: "consultar_receta_detallada",
      description: "Consulta una receta de la carta con sus INGREDIENTES reales, cantidades, unidades y elaboración. Antes que gestionar_recetas al preguntar qué lleva o cómo preparar un plato o una sangría.",
      parameters: {
        type: "object", properties: {
          nombre: { type: "string", description: "Nombre de la receta, por ejemplo: Sangria cava" },
        }, required: ["nombre"], additionalProperties: false,
      },
    },
  },
  consultar_horas_trabajadas: {
    type: "function",
    function: {
      name: "consultar_horas_trabajadas",
      description: "Total de horas FICHADAS de un empleado durante un periodo. Busca al empleado por nombre y suma fichajes cerrados; señala fichajes abiertos. Solo responsables autorizados pueden consultar a otros; personal solo sus propios registros. Distinto de horas contratadas y extraordinarias.",
      parameters: {
        type: "object",
        properties: {
          ...dateProps,
          empleado: { type: "string", description: "Nombre del empleado (ej. Fernando). Personal puede omitirlo al preguntar por sí mismo." },
        },
        required: ["periodo"], additionalProperties: false,
      },
    },
  },
};

export function toolEnabled(role: RoleName, name: KnowledgeToolName): boolean {
  if (name === "consultar_ventas_productos") return canExecute(role, "consultar_metricas_basicas");
  if (name === "consultar_receta_detallada") return canExecute(role, "gestionar_recetas");
  if (name === "consultar_horas_trabajadas") return canExecute(role, "consultar_registros_asistencia");
  return false;
}

export function madridDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
function dateToUtc(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().startsWith(value) ? parsed : null;
}
function iso(d: Date): string { return d.toISOString().slice(0, 10); }
function shift(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}
export function resolveDates(args: Dates, today = madridDate()): { inicio: string; fin: string } | { error: string } {
  const base = dateToUtc(today);
  if (!base) return { error: "Fecha actual inválida" };
  let start = base, end = base;
  switch (args.periodo) {
    case "hoy": break;
    case "ayer": start = shift(base,-1); end = start; break;
    case "esta_semana": start = shift(base, -(base.getUTCDay()+6)%7); break;
    case "semana_pasada": {
      const monday = shift(base, -(base.getUTCDay()+6)%7);
      start = shift(monday,-7); end = shift(monday,-1); break;
    }
    case "rango": {
      const a = args.fecha_inicio && dateToUtc(args.fecha_inicio);
      const b = args.fecha_fin && dateToUtc(args.fecha_fin);
      if (!a || !b) return { error: "Indica fechas válidas YYYY-MM-DD para un rango" };
      start = a; end = b; break;
    }
    default: return { error: "Periodo inválido" };
  }
  const length = (end.getTime()-start.getTime()) / 86400000;
  if (length < 0 || length > 62 || end > shift(base,1)) return { error: "Rango inválido, futuro o mayor de 63 días" };
  return { inicio: iso(start), fin: iso(end) };
}

function normalize(value: string): string {
  return value.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
}
const coffeePattern = /\b(cafe|cortado|americano|capuccino|cappuccino|descafeinado|espresso|expreso|latte|carajillo)\b/;

export function summarizeProductSales(data: unknown, product?: string): Record<string,unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { error: "Desglose de ventas inválido" };
  const source = data as Record<string, unknown>;
  const all = Array.isArray(source.products) ? source.products : [];
  const filter = normalize(product ?? "");
  const selection = all.filter((p): p is Record<string, unknown> => Boolean(p && typeof p === "object" && !Array.isArray(p))).filter(p => {
    const name = normalize(String(p.nombre_articulo ?? ""));
    if (!filter) return true;
    const singular = filter.length > 5 && filter.endsWith("s") ? filter.slice(0, -1) : filter;
    return filter === "cafe" || filter === "cafes"
      ? coffeePattern.test(name)
      : name.includes(filter) || name.includes(singular);
  });
  const ranked = selection.sort((a,b)=>Number(b.cantidad_total||0)-Number(a.cantidad_total||0));
  const total = ranked.reduce((acc,p)=>acc+Number(p.cantidad_total||0),0);
  const ingresos = ranked.reduce((acc,p)=>acc+Number(p.total_ingresos||0),0);
  return {
    filtro: product||null, unidades: Math.round(total*100)/100,
    importe_eur: Math.round(ingresos*100)/100,
    articulos_encontrados: ranked.length, detalle: ranked.slice(0,25).map(p=>({
      articulo:String(p.nombre_articulo??""),
      unidades:Number(p.cantidad_total)||0,
      ingresos_eur:Number(p.total_ingresos)||0,
    })),
    detalle_truncado: ranked.length>25,
    total_tickets: Number((source.summary as Record<string,unknown>|undefined)?.count ||0),
    aviso: "Las unidades proceden de las líneas de TPV, no del recuento de tickets. Si se piden cafés, indicar qué artículos se han incluido.",
  };
}

export function calculateWorkedHours(logs: unknown, inicio: string, fin: string): Record<string,unknown> {
  if (!Array.isArray(logs)) return { error:"Fichajes no disponibles" };
  // SQL/RPC devuelve instantes en UTC, pero el día de ficha se interpreta en zona Madrid.
  let total = 0, closed=0, open=0, invalid=0;
  const rows: {entrada:string;salida:string|null;horas:number}[] = [];
  for (const log of logs.slice(0,350)) {
    if (!log || typeof log!=="object") continue;
    const row=log as Record<string,unknown>;
    const start = Date.parse(String(row.clock_in??""));
    if (!Number.isFinite(start)) { invalid++; continue; }
    const leave = row.clock_out ? Date.parse(String(row.clock_out)) : NaN;
    if (!Number.isFinite(leave)) { open++; continue; }
    const duration = (leave-start)/3600000;
    if (!Number.isFinite(duration) || duration<=0 || duration>24) {invalid++;continue;}
    const official = Number(row.total_hours);
    const hours = row.total_hours!==null && row.total_hours!==undefined && Number.isFinite(official) && official>0 && official<=24 ? official : duration;
    total += hours; closed++;
    rows.push({entrada:String(row.clock_in),salida:String(row.clock_out),horas:Math.round(hours*100)/100});
  }
  return {
    periodo: {inicio,fin},
    horas_fichadas:Math.round(total*100)/100,
    turnos_completos:closed,
    fichajes_sin_salida:open,
    fichajes_invalidos:invalid,
    registros_truncados:logs.length>350,
    detalle:rows.slice(0,35),
    observacion:"Horas computadas de fichajes completos (total_hours si existe, si no diferencia entrada-salida). No confundir con horas contratadas, horas justificadas ni extras.",
  };
}

function parseArgs(args: unknown): Record<string,unknown> {
  return args && typeof args==="object"&&!Array.isArray(args) ? args as Record<string,unknown> : {};
}
function filterName(value: string): string {
  return normalize(value).replace(/[^\p{L}\p{N}\s-]/gu,"").slice(0,90);
}

export async function runKnowledgeTool(
  name: KnowledgeToolName,
  rawArgs: unknown,
  ctx: { supabase: Client; role: RoleName; userId: string; today?: string },
): Promise<unknown> {
  if (!toolEnabled(ctx.role, name)) return { error: "No tienes permiso para consultar esta información" };
  const args = parseArgs(rawArgs);
  if (name === "consultar_receta_detallada") {
    const requested = filterName(String(args.nombre??""));
    if (requested.length < 2) return {error:"Indica el nombre de la receta"};
    const {data:recipes,error} = await ctx.supabase.from("recipes")
      .select("id,name,elaboration,presentation,yield_quantity,yield_unit,sale_price")
      .ilike("name", `%${requested}%`).limit(8);
    if (error) return {error:"No se pudo consultar el catálogo de recetas"};
    const exact = recipes?.find(r=>normalize(r.name)===requested);
    if (!exact && (recipes?.length??0)>1) return {error:"Varias recetas coinciden. Concreta cuál.", coincidencias: recipes?.map(r=>r.name)};
    const recipe=exact||recipes?.[0];
    if (!recipe) return {error:"Receta no encontrada"};
    const {data:parts,error:pe} = await ctx.supabase.from("recipe_ingredients")
      .select("ingredient_id,quantity_gross,quantity_net,unit").eq("recipe_id",recipe.id).limit(80);
    if (pe) return {error:"No se pudo consultar la composición de esta receta"};
    const ids = [...new Set((parts??[]).map(p=>p.ingredient_id).filter((id):id is string=>typeof id==="string"))];
    const {data:ingredients,error:ie} = ids.length
      ? await ctx.supabase.from("ingredients").select("id,name,unit").in("id",ids)
      : {data:[],error:null};
    if (ie) return {error:"No se pudo consultar el nombre de los ingredientes"};
    const names=new Map((ingredients??[]).map(i=>[i.id,i.name]));
    return {
      nombre:recipe.name,elaboracion:recipe.elaboration,presentacion:recipe.presentation,
      rendimiento:recipe.yield_quantity,unidad_rendimiento:recipe.yield_unit,
      precio_venta:recipe.sale_price,
      ingredientes:(parts??[]).map(p=>({nombre:names.get(p.ingredient_id)||"Ingrediente sin referencia",
        cantidad_bruta:p.quantity_gross,cantidad_neta:p.quantity_net,unidad:p.unit})),
      observacion: "Ingredientes leídos directamente de recipe_ingredients. No inventes cantidades ni omitas ingredientes desconocidos.",
    };
  }

  const dates = resolveDates(args as Dates, ctx.today || madridDate());
  if ("error" in dates) return dates;

  if (name === "consultar_ventas_productos") {
    const {data,error}=await ctx.supabase.rpc("get_full_period_ticket_sales_detail",{
      p_start_date:dates.inicio,p_end_date:dates.fin,
    });
    if (error) return {error:"No se ha podido acceder al desglose de líneas de TPV"};
    return {periodo:dates,...summarizeProductSales(data,typeof args.producto==="string"?args.producto:undefined)};
  }

  const isStaff=ctx.role==="staff";
  const given = filterName(String(args.empleado??""));
  let targetId=ctx.userId, display="Tus fichajes";
  if (!isStaff && given && !/^(yo|mi|mis|yo mismo)$/.test(given)) {
    // Solo responsables con acceso a identificación de plantilla.
    if (!canExecute(ctx.role,"consultar_usuarios")) return {error:"Sin permiso para consultar fichajes de terceros"};
    const {data:people,error} = await ctx.supabase.from("profiles")
      .select("id,first_name,last_name").limit(150);
    if (error) return {error:"No se pudo identificar al empleado"};
    const matches=(people??[]).filter(p=>normalize(`${p.first_name??""} ${p.last_name??""}`).includes(given));
    if (!matches.length) return {error:"Empleado no encontrado con ese nombre"};
    if (matches.length>1) return {error:"Nombre ambiguo; añade apellido",coincidencias:matches.map(p=>`${p.first_name} ${p.last_name}`)};
    targetId=matches[0].id;
    display=`${matches[0].first_name??""} ${matches[0].last_name??""}`.trim();
  } else if (isStaff && given && !/^(yo|mi|mis|yo mismo)$/.test(given)) {
    const {data:self,error}=await ctx.supabase.from("profiles").select("first_name,last_name").eq("id",ctx.userId).single();
    if (error || !self || !normalize(`${self.first_name??""} ${self.last_name??""}`).includes(given)) {
      return {error:"Sin permiso para consultar horas de otra persona"};
    }
  }
  // Esta RPC verifica también identidad/rol en Postgres, más allá del filtro de aplicación.
  const {data,error} = await ctx.supabase.rpc("consultar_registros_asistencia",{
    p_user_id:targetId,p_fecha_inicio:dates.inicio,p_fecha_fin:dates.fin,
  });
  if (error) return {error:"No se pudieron consultar los fichajes con tu nivel de acceso"};
  if (data && typeof data==="object" && !Array.isArray(data) && "error" in data) {
    return {error:"No tienes permiso para consultar estos fichajes"};
  }
  return {empleado:display,...calculateWorkedHours(data,dates.inicio,dates.fin)};
}
