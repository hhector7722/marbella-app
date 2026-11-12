import type {createClient} from "@/utils/supabase/server";
import type {RoleName} from "./permissions";
import {madridDayUtcRangeIso,formatMadridHmFromIso} from "../madrid-date-bounds.ts";

type Client=Awaited<ReturnType<typeof createClient>>;

/** Solo datos de asistencia: nunca inferir horarios programados de fichajes. */
export async function tryDirectTodayAttendanceAnswer(
 question:string,
 ctx:{supabase:Client;role:RoleName;today:string},
):Promise<string|null>{
 const q=question.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g,"");
 if(!/(?:quien(?:es)?|que empleados?).*(?:trabaj|turno|horario).*(?:hoy)/.test(q))return null;
 if(ctx.role!=="manager"&&ctx.role!=="admin"){
  return "Tu perfil no tiene permiso para consultar los fichajes de otros empleados.";
 }
 const {startIso,endIso}=madridDayUtcRangeIso(ctx.today);
 const {data,error}=await ctx.supabase.from("time_logs").select("user_id,clock_in,clock_out")
   .gte("clock_in",startIso).lte("clock_in",endIso).order("clock_in").limit(500);
 if(error||!Array.isArray(data))return "No se han podido consultar los fichajes de hoy.";
 if(!data.length)return "No constan fichajes hoy ("+ctx.today+"). Esto no demuestra que no haya personal programado.";
 const ids=[...new Set(data.map(x=>x.user_id).filter((x):x is string=>typeof x==="string"))];
 if(!ids.length)return "Hay fichajes, pero no he podido asociarlos a empleados.";
 const {data:profiles,error:pe}=await ctx.supabase.from("profiles")
  .select("id,first_name,last_name").in("id",ids).limit(200);
 if(pe||!Array.isArray(profiles))return "Hay fichajes, pero no se han podido identificar los empleados.";
 const names=new Map(profiles.map(x=>[x.id,(String(x.first_name??"")+" "+String(x.last_name??"")).trim()]));
 const lines=data.map(x=>{
  const name=names.get(x.user_id);
  if(!name)return null;
  const start=formatMadridHmFromIso(x.clock_in)||"sin entrada";
  const end=formatMadridHmFromIso(x.clock_out);
  return "• "+name+": entrada "+start+(end?", salida "+end:", sin salida registrada");
 }).filter((x):x is string=>typeof x==="string");
 if(!lines.length)return "No he podido asociar los fichajes de hoy a usuarios visibles.";
 return "Fichajes registrados hoy ("+ctx.today+"):\n"+lines.join("\n")+
 "\nEstas horas son de asistencia real, NO los turnos programados; para saber el horario previsto hay que consultar los turnos publicados.";
}
