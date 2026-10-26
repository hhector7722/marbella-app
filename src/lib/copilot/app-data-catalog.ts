/**
 * Catálogo de lectura del asistente (sin SQL arbitrario).
 *
 * El LLM solamente elige un módulo: tabla, columnas y filtros quedan fijados
 * en el servidor. En cada consulta se revalida el rol y Supabase aplica RLS
 * con el JWT de la sesión. No se usa service_role.
 */
import type { createClient } from "@/utils/supabase/server";
import type { RoleName } from "./permissions";
import type { GroqTool } from "./groq-chat";
import { resolveDates, madridDate } from "./knowledge-tools.ts";

type Client=Awaited<ReturnType<typeof createClient>>;
const ADMIN_ONLY: readonly RoleName[]=["manager","admin"];
const OPERATIVE:readonly RoleName[]=["staff","supervisor","chef","manager","admin"];
const MANAGEMENT:readonly RoleName[]=["supervisor","chef","manager","admin"];
export const APP_DATA_SOURCE_NAMES=[
  "catalogo","plantilla","horas_extras","contratos","costes_personal","nominas","resumen_nominas",
  "fichajes","horario_previsto","caja","albaranes","lineas_albaranes",
  "compras","recetas","ingredientes","proveedores","reservas","inventario",
  "movimientos_stock",
] as const;
export type AppDataSource=typeof APP_DATA_SOURCE_NAMES[number];
type SourceConfig={
  table:string;
  columns:string;
  roles:readonly RoleName[];
  label:string;
  dateColumn?:string;
  searchColumn?:string;
  employeeColumn?:string;
  desc:string;
};
const SOURCES:Record<Exclude<AppDataSource,"catalogo">,SourceConfig>={
  plantilla:{table:"profiles",columns:"first_name,last_name,role,visible_in_plantilla,joining_date,end_date,staffing_mode",roles:MANAGEMENT,label:"Plantilla",searchColumn:"first_name",desc:"Directorio de trabajadores y estado de plantilla, sin DNI, banco, teléfono ni datos privados"},
  horas_extras:{table:"weekly_snapshots",columns:"week_start,week_end,total_hours,ordinary_hours,extra_hours,contracted_hours_snapshot,overtime_rate_effective,total_cost,is_paid,has_missing_rate,final_balance,prefer_stock_effective",roles:ADMIN_ONLY,label:"Horas extras y liquidación",dateColumn:"week_start",employeeColumn:"user_id",desc:"Proyección semanal oficial del motor de horas; total_cost es el coste/importe de extras, no la nómina entera"},
  contratos:{table:"hours_contract_terms",columns:"effective_from,effective_to,weekly_hours,bag_mode,regime,overtime_rate_per_hour",roles:ADMIN_ONLY,label:"Contratos y tarifas",dateColumn:"effective_from",employeeColumn:"user_id",desc:"Historial de condiciones y tarifa extra por tramos de vigencia"},
  costes_personal:{table:"profile_labor_cost_terms",columns:"valid_from,valid_to,monthly_cost,overtime_cost_per_hour",roles:ADMIN_ONLY,label:"Costes laborales",dateColumn:"valid_from",employeeColumn:"user_id",desc:"Costes laborables por vigencia"},
  nominas:{table:"employee_payroll_facts",columns:"period_ym,settlement_type,status,total_company_cost,gross_salary,net_salary,ss_employee,ss_company",roles:ADMIN_ONLY,label:"Nóminas",employeeColumn:"user_id",desc:"Datos oficiales de nóminas; no inferir importe neto a partir del coste empresa"},
  resumen_nominas:{table:"payroll_monthly_totals",columns:"period_ym,total_company_cost,source",roles:ADMIN_ONLY,label:"Coste mensual de nóminas",desc:"Importes mensuales oficiales agregados"},
  fichajes:{table:"time_logs",columns:"clock_in,clock_out,event_type,total_hours,justified_hours,is_manual_entry",roles:ADMIN_ONLY,label:"Fichajes",dateColumn:"clock_in",employeeColumn:"user_id",desc:"Registros de presencia; no se envían coordenadas ni notas personales"},
  horario_previsto:{table:"weekly_expected_hours",columns:"week_start,day,expected_hours",roles:ADMIN_ONLY,label:"Horas previstas",dateColumn:"day",employeeColumn:"user_id",desc:"Calendario de horas esperadas por jornada"},
  caja:{table:"cash_closings",columns:"closing_date,tpv_terminal,net_sales,tpv_sales,cash_expected,cash_counted,card_payments,difference,status,tickets_count,tpv2_purchase_total",roles:ADMIN_ONLY,label:"Cierres de caja",dateColumn:"closing_date",desc:"Histórico de cierres, arqueos y ventas por terminal"},
  albaranes:{table:"purchase_invoices",columns:"id,invoice_date,invoice_number,total_amount,base_amount,tax_amount,status,supplier_id,source,expected_pages",roles:ADMIN_ONLY,label:"Albaranes y facturas de compra",dateColumn:"invoice_date",desc:"Documentos de proveedores y sus importes"},
  lineas_albaranes:{table:"purchase_invoice_lines",columns:"original_name,quantity,unit_price,total_price,line_unit,status,invoice_id",roles:ADMIN_ONLY,label:"Artículos de albaranes",searchColumn:"original_name",desc:"Desglose de productos facturados por proveedor"},
  compras:{table:"purchase_orders",columns:"order_date,order_number,supplier_name,status,total_amount,total_items,expected_delivery_date",roles:MANAGEMENT,label:"Pedidos de compra",dateColumn:"order_date",searchColumn:"supplier_name",desc:"Pedidos realizados a proveedores"},
  recetas:{table:"recipes",columns:"name,category,servings,preparation_time,sale_price,sale_price_half,elaboration,presentation,is_sellable",roles:OPERATIVE,label:"Recetas",searchColumn:"name",desc:"Fichas de receta; ingredientes detallados disponibles en consultar_receta_detallada"},
  ingredientes:{table:"ingredients",columns:"name,unit,unit_type,base_unit,current_price,stock_current,category,supplier,archived_at",roles:MANAGEMENT,label:"Ingredientes",searchColumn:"name",desc:"Catálogo de ingredientes, precios de compra y unidades"},
  proveedores:{table:"suppliers",columns:"name,delivery_schedule,lead_time,order_deadline,min_order,order_channel,category,notes",roles:MANAGEMENT,label:"Proveedores",searchColumn:"name",desc:"Proveedores, condiciones de pedidos y entregas"},
  reservas:{table:"reservations",columns:"reservation_date,reservation_time,pax,status,notes",roles:OPERATIVE,label:"Reservas",dateColumn:"reservation_date",desc:"Reservas y aforos sin nombres ni teléfonos de clientes"},
  inventario:{table:"ingredients",columns:"name,stock_current,unit,unit_type,recommended_stock,inventory_visible,category",roles:OPERATIVE,label:"Stock e inventario",searchColumn:"name",desc:"Existencias de ingredientes y nivel recomendado"},
  movimientos_stock:{table:"stock_movements",columns:"movement_date,movement_type,quantity,unit,unit_price,total_amount,original_description,origin,reference_type",roles:ADMIN_ONLY,label:"Movimientos de stock",dateColumn:"movement_date",searchColumn:"original_description",desc:"Kardex y movimientos de entrada/salida"},
};

export const APP_DATA_TOOL:GroqTool={
  type:"function",
  function:{
    name:"consultar_datos_aplicacion",
    description:"Consulta REAL de datos de Marbella App por fuentes autorizadas. Permite cruzar hasta 4 fuentes en una petición: extras + contratos + costes, nóminas, fichajes, compras, albaranes, líneas, proveedores, caja, recetas, stock y reservas. Para saber qué se puede consultar usa fuente catalogo. Las horas extras a pagar están en horas_extras.total_cost, calculadas por el motor, no multiplicar horas trabajadas por una tarifa supuesta. No puede modificar registros.",
    parameters:{
      type:"object",
      properties:{
        fuentes:{type:"array",items:{type:"string",enum:[...APP_DATA_SOURCE_NAMES]},minItems:1,maxItems:4},
        empleado:{type:"string",description:"Nombre del empleado cuando se trate de información laboral; sin UUID"},
        busqueda:{type:"string",description:"Texto por el que filtrar, p.ej. ingrediente o proveedor"},
        periodo:{type:"string",enum:["hoy","ayer","esta_semana","semana_pasada","rango"],description:"Periodo para fuentes con fecha"},
        fecha_inicio:{type:"string",description:"YYYY-MM-DD solo para rango"},
        fecha_fin:{type:"string",description:"YYYY-MM-DD solo para rango"},
        limite:{type:"integer",minimum:1,maximum:30,description:"Registros por fuente, máximo 30"},
      },
      required:["fuentes"],additionalProperties:false,
    },
  },
};

/** No anunciar al LLM fuentes que el usuario actual no tiene permiso de consultar. */
export function appDataToolForRole(role:RoleName):GroqTool{
  const allowed=APP_DATA_SOURCE_NAMES.filter(source=>appSourceAllowed(role,source));
  return {
    ...APP_DATA_TOOL,
    function:{
      ...APP_DATA_TOOL.function,
      description:`Consulta de solo lectura de Marbella App. Fuentes disponibles para el usuario: ${allowed.join(", ")}. Cruza varias fuentes (p.ej. horas_extras + contratos) para contestar sin inventar datos. Para el importe de horas extras usa exclusivamente horas_extras.importe_extras_eur que procede de la proyección oficial. Siempre hay permisos y límites del servidor.`,
      parameters:{
        ...APP_DATA_TOOL.function.parameters,
        properties:{
          ...(APP_DATA_TOOL.function.parameters.properties as Record<string,unknown>),
          fuentes:{type:"array",items:{type:"string",enum:allowed},minItems:1,maxItems:4},
        },
      },
    },
  };
}
export function appSourceAllowed(role:RoleName, source:AppDataSource):boolean {
  return source==="catalogo" || SOURCES[source].roles.includes(role);
}
export function visibleAppSources(role:RoleName):Array<{fuente:string;descripcion:string}>{
  return (Object.entries(SOURCES) as Array<[Exclude<AppDataSource,"catalogo">,SourceConfig]>)
    .filter(([name])=>appSourceAllowed(role,name))
    .map(([fuente,c])=>({fuente,descripcion:c.desc}));
}
const clean=(s:string)=>s.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
function isYmd(s:string){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+"T00:00:00Z"));}
export function normalizeAppCatalogInput(input:unknown):{fuentes:AppDataSource[];empleado?:string;busqueda?:string;periodo?:string;fecha_inicio?:string;fecha_fin?:string;limite:number}|{error:string}{
  if(!input || typeof input!=="object" || Array.isArray(input))return {error:"Argumentos no válidos"};
  const a=input as Record<string,unknown>;
  const raw=a.fuentes;
  if(!Array.isArray(raw)||raw.length<1||raw.length>4||raw.some(x=>typeof x!=="string"||!(APP_DATA_SOURCE_NAMES as readonly string[]).includes(x)))return {error:"Fuentes de consulta no válidas"};
  if(a.empleado!==undefined && (typeof a.empleado!=="string"||a.empleado.length>100))return {error:"Nombre no válido"};
  if(a.busqueda!==undefined && (typeof a.busqueda!=="string"||a.busqueda.length>100))return {error:"Búsqueda no válida"};
  const limite=a.limite===undefined?12:Number(a.limite);
  if(!Number.isInteger(limite)||limite<1||limite>30)return {error:"Límite no válido"};
  if(a.periodo!==undefined && !["hoy","ayer","esta_semana","semana_pasada","rango"].includes(String(a.periodo)))return {error:"Periodo no válido"};
  if(a.fecha_inicio!==undefined && (typeof a.fecha_inicio!=="string"||!isYmd(a.fecha_inicio)))return {error:"Fecha inicial inválida"};
  if(a.fecha_fin!==undefined && (typeof a.fecha_fin!=="string"||!isYmd(a.fecha_fin)))return {error:"Fecha final inválida"};
  return {fuentes:[...new Set(raw as AppDataSource[])],empleado:typeof a.empleado==="string"?a.empleado.trim():undefined,
    busqueda:typeof a.busqueda==="string"?a.busqueda.trim():undefined,
    periodo:typeof a.periodo==="string"?a.periodo:undefined,
    fecha_inicio:typeof a.fecha_inicio==="string"?a.fecha_inicio:undefined,
    fecha_fin:typeof a.fecha_fin==="string"?a.fecha_fin:undefined,limite};
}
export function summarizeAppData(source:AppDataSource,records:unknown[]):unknown{
  if(source==="horas_extras"){
    return records.map(entry=>{
      const r=entry as Record<string,unknown>;
      return {semana:r.week_start,fin:r.week_end,horas_trabajadas:r.total_hours,
        horas_ordinarias:r.ordinary_hours,horas_extras:r.extra_hours,
        contrato_horas:r.contracted_hours_snapshot,tarifa_extra:r.overtime_rate_effective,
        importe_extras_eur:r.total_cost,pagado:r.is_paid,tarifa_pendiente:r.has_missing_rate,
        saldo_horas:r.final_balance,preferir_bolsa:r.prefer_stock_effective};
    });
  }
  return records;
}
export async function runAppDataTool(
  args:unknown,ctx:{supabase:Client;role:RoleName;userId:string;today?:string},
):Promise<unknown>{
  const parsed=normalizeAppCatalogInput(args);
  if("error" in parsed)return parsed;
  const {supabase,role,userId}=ctx;
  if(!userId)return {error:"Sesión no autorizada"};
  let employeeId:string|undefined;
  let employeeName:string|undefined;
  const requestedEmployee=parsed.empleado && !/^(yo|mi|mis|mio|misma)$/i.test(parsed.empleado)?parsed.empleado:undefined;
  const needsEmployee=parsed.fuentes.some(source=>source!=="catalogo" && Boolean(SOURCES[source].employeeColumn));
  if(requestedEmployee && needsEmployee){
    // NO permitir enumerar los empleados cuando el usuario solo puede ver sus fichajes.
    if(role!=="manager"&&role!=="admin")return {error:"No tienes permiso para consultar datos laborales de otras personas"};
    const {data:people,error}=await supabase.from("profiles").select("id,first_name,last_name").limit(250);
    if(error)return {error:"No se pudo identificar el trabajador con los permisos disponibles"};
    const searched=clean(requestedEmployee);
    const found=(people??[]).filter(p=>clean(`${p.first_name??""} ${p.last_name??""}`).includes(searched));
    if(found.length!==1)return {error:found.length?"Nombre ambiguo; indica el apellido":"Empleado no encontrado"};
    employeeId=found[0].id;employeeName=`${found[0].first_name??""} ${found[0].last_name??""}`.trim();
  }
  const dates=parsed.periodo
    ? resolveDates({periodo:parsed.periodo as "hoy"|"ayer"|"esta_semana"|"semana_pasada"|"rango",fecha_inicio:parsed.fecha_inicio,fecha_fin:parsed.fecha_fin},ctx.today||madridDate())
    : null;
  if(dates && "error" in dates)return dates;
  const results:Array<Record<string,unknown>>=[];
  for(const source of parsed.fuentes){
    if(source==="catalogo"){results.push({fuente:source,disponibles:visibleAppSources(role)});continue;}
    if(!appSourceAllowed(role,source)){results.push({fuente:source,error:"No autorizado para tu rol"});continue;}
    const c=SOURCES[source];
    // No proporcionar indiscriminadamente datos individuales de terceros:
    // solo fuentes de RRHH con búsqueda por persona propia o de gerencia.
    if(c.employeeColumn&&!requestedEmployee && source!=="horas_extras"){
      results.push({fuente:source,error:"Indica el nombre del empleado"});continue;
    }
    if(c.employeeColumn && source==="horas_extras" && !requestedEmployee){
      results.push({fuente:source,error:"Indica el nombre del empleado para liquidar sus horas extras"});continue;
    }
    let query=supabase.from(c.table).select(c.columns).limit(parsed.limite);
    if(employeeId&&c.employeeColumn)query=query.eq(c.employeeColumn,employeeId);
    if(parsed.busqueda&&c.searchColumn){
      const needle=parsed.busqueda.replace(/[%_,]/g," ").trim();
      if(needle)query=query.ilike(c.searchColumn,`%${needle}%`);
    }
    if(dates && !("error" in dates) && c.dateColumn){
      if(source==="contratos" || source==="costes_personal") {
        const untilColumn=source==="contratos"?"effective_to":"valid_to";
        query=query.lte(c.dateColumn,dates.fin)
          .or(`${untilColumn}.is.null,${untilColumn}.gte.${dates.inicio}`);
      } else query=query.gte(c.dateColumn,dates.inicio).lte(c.dateColumn,dates.fin);
    }
    if(dates && !("error" in dates) && (source==="nominas"||source==="resumen_nominas")){
      query=query.gte("period_ym",dates.inicio.slice(0,7)).lte("period_ym",dates.fin.slice(0,7));
    }
    if(c.dateColumn)query=query.order(c.dateColumn,{ascending:false});
    else if(source==="nominas" || source==="resumen_nominas")query=query.order("period_ym",{ascending:false});
    const {data,error}=await query;
    if(error){results.push({fuente:source,error:"No se pueden consultar estos datos con los permisos de tu sesión"});continue;}
    results.push({fuente:source,descripcion:c.desc,empleado:employeeName||null,
      periodo:dates&&!('error' in dates)?dates:null,
      registros:summarizeAppData(source,data??[]),
      registros_devueltos:(data??[]).length,
      advertencia:(data??[]).length===parsed.limite?"Resultado limitado; acota fecha/búsqueda para una respuesta exhaustiva":undefined,
    });
  }
  return {catalogo:"Marbella App, sesión autenticada, consulta de solo lectura",resultados:results};
}
