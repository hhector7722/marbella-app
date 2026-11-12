import {test} from "node:test";
import assert from "node:assert/strict";
import {tryDirectTodayAttendanceAnswer} from "./direct-attendance.ts";
import type {createClient} from "@/utils/supabase/server";
type Client=Awaited<ReturnType<typeof createClient>>;
function mock(){
 const calls:string[]=[];
 const m={
  from:(table:string)=>{
   calls.push(table);
   if(table==="time_logs")return {select:()=>({gte:()=>({lte:()=>({order:()=>({limit:async()=>({
    data:[{user_id:"a",clock_in:"2026-11-12T06:00:00Z",clock_out:"2026-11-12T15:00:00Z"}],error:null,
   })})})})})};
   if(table==="profiles")return {select:()=>({in:()=>({limit:async()=>({
     data:[{id:"a",first_name:"Alba",last_name:"M"}],error:null,
   })})})};
   throw Error(table);
  },
 } as unknown as Client;
 return {m,calls};
}
test("quién trabaja hoy: distingue fichaje real de horario publicado",async()=>{
 const f=mock();
 const result=await tryDirectTodayAttendanceAnswer("¿Quién trabaja hoy y en qué horario?",{
  supabase:f.m,role:"manager",today:"2026-11-12",
 });
 assert.match(result??"",/Alba M: entrada 07:00, salida 16:00/);
 assert.match(result??"",/NO los turnos programados/);
 assert.deepEqual(f.calls,["time_logs","profiles"]);
});
test("staff/supervisor/chef no consultan asistencia de compañeros",async()=>{
 for(const role of ["staff","supervisor","chef"] as const){
  const f=mock();const answer=await tryDirectTodayAttendanceAnswer("Quien trabaja hoy y en que horario?",{
   supabase:f.m,role,today:"2026-11-12",
  });
  assert.match(answer??"",/no tiene permiso/);
  assert.equal(f.calls.length,0);
 }
});
