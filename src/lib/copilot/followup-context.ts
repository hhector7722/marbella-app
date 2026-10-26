/**
 * Interpreta seguimientos cortos sin delegar al modelo la elección
 * del dominio, la fecha o la identidad del trabajador.
 * No autoriza herramientas: la autorización sigue en el servidor.
 */
export type CopilotFollowup = {
  query: string;
  toolName: "consultar_ventas_productos" | "consultar_horas_trabajadas";
  args: Record<string, string>;
  continued: boolean;
};

const norm=(v:string):string=>v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();

type Domain="sales"|"hours";
function domainOf(question:string):Domain|null{
  const q=norm(question);
  if(/\b(horas?|fichaj\w*|turnos?)\b/.test(q)&&/trabaj|fich|hiz|emplead|semana|horas/.test(q))return "hours";
  if(/vend|venta|croissant|cafe|cortado|bocadill|refresc|producto/.test(q)
    && /vend|venta|cuant|unidades/.test(q))return "sales";
  return null;
}
function weekdayInQuestion(q:string):number|null{
  const names=["domingo","lunes","martes","miercoles","jueves","viernes","sabado"];
  for(let i=0;i<names.length;i++){
    if(new RegExp("\\b"+names[i]+"\\b").test(norm(q)))return i;
  }
  return null;
}
function latestWeekday(weekday:number,today:string):string{
  const day=new Date(today+"T00:00:00.000Z");
  const delta=(day.getUTCDay()-weekday+7)%7;
  day.setUTCDate(day.getUTCDate()-delta);
  return day.toISOString().slice(0,10);
}
function dateArgs(text:string,today:string):Record<string,string>{
  const q=norm(text);
  if(/semana pasada|semana anterior|ultima semana/.test(q))return {periodo:"semana_pasada"};
  if(/esta semana|semana actual/.test(q))return {periodo:"esta_semana"};
  if(/anteayer/.test(q)){
    const d=new Date(today+"T00:00:00.000Z");
    d.setUTCDate(d.getUTCDate()-2);
    const s=d.toISOString().slice(0,10);
    return {periodo:"rango",fecha_inicio:s,fecha_fin:s};
  }
  if(/\bayer\b/.test(q))return {periodo:"ayer"};
  const day=weekdayInQuestion(q);
  if(day!==null){
    const date=latestWeekday(day,today);
    return {periodo:"rango",fecha_inicio:date,fecha_fin:date};
  }
  if(/\bhoy\b/.test(q))return {periodo:"hoy"};
  return {};
}

function salesProduct(text:string):string|null{
  const q=norm(text);
  const byCount=q.match(/\bcuantos?\s+(.+?)\s+(?:llevamos\s+)?(?:se\s+)?(?:han\s+)?(?:vendim\w*|vendid\w*|vendem\w*|venden)\b/);
  if(byCount){
    const candidate=byCount[1].replace(/^(de|los|las|el|la)\s+/,"").trim();
    if(candidate.length>2 && candidate.length<60)return candidate;
  }
  const terms=["croissant","cafe","cortado","bravas","bocadillo","refresco","cerveza","sangria","agua","zumo"];
  return terms.find(token=>q.includes(token))??null;
}
function hoursEmployee(text:string):string|null{
  const q=norm(text);
  const match=q.match(/\b(?:trabajo|trabajado|trabaja|ficho|hizo|trabajo)\s+([a-zñáéíóúü]+)\b/);
  if(match && !["el","la","en","por","durante","esta","ayer","semana"].includes(match[1]))return match[1];
  const other=q.match(/\b(?:de|del|para)\s+([a-zñáéíóúü]+)\s+(?:la\s+)?(?:semana|ayer|hoy|el\s+)/);
  return other?.[1]??null;
}
function followupName(text:string):string|null{
  const q=norm(text).replace(/[¿?!.]/g,"").trim();
  const match=q.match(/^(?:y\s+)?(?:las?\s+horas?\s+de\s+)?([a-zñáéíóúü]+)(?:\s+tambien)?$/);
  if(!match || ["domingo","sabado","lunes","martes","miercoles","jueves","viernes",
    "ayer","hoy","semana","eso","ellos","ella","cual","cuantos","cuantas"].includes(match[1]))return null;
  return match[1];
}

/** earlierUserMessages no incluye el mensaje actual; solo se consulta la conversación del usuario autenticado. */
export function resolveCopilotFollowup(
  current:string,
  earlierUserMessages:string[],
  today:string,
):CopilotFollowup|null{
  const last=earlierUserMessages.slice(-12).reverse();
  const currentDomain=domainOf(current);
  const anchor=last.find(m=>domainOf(m)!==null);
  const oldDomain=anchor?domainOf(anchor):null;
  const q=norm(current).replace(/^[¿?!. ]+/, "");
  const short= q.length<50 && /^(y\b|el\s+|la\s+|las\s+horas\s+de\b)/.test(q);
  const canContinue=Boolean(anchor && oldDomain && short && !currentDomain);
  const domain=currentDomain??(canContinue?oldDomain:null);
  if(!domain)return null;
  const base=canContinue?anchor!:current;
  const previousArgs=dateArgs(base,today);
  const currentArgs=dateArgs(current,today);
  const dates=Object.keys(currentArgs).length?currentArgs:previousArgs;
  if(domain==="sales"){
    const producto=salesProduct(current)??salesProduct(base);
    const args={...dates,...(producto?{producto}:{})};
    return {toolName:"consultar_ventas_productos",args,
      query:canContinue?`Ventas del producto ${producto??"consultado anteriormente"}: ${current}. Referencia: ${base}. Fecha resuelta: ${dates.fecha_inicio??dates.periodo??"sin definir"}.`:current,
      continued:canContinue};
  }
  const empleado=(canContinue?followupName(current):hoursEmployee(current))??hoursEmployee(base);
  const args={...dates,...(empleado?{empleado}:{})};
  return {toolName:"consultar_horas_trabajadas",args,
    query:canContinue?`Horas trabajadas por ${empleado??"el empleado consultado"} durante ${dates.periodo??dates.fecha_inicio??"el periodo anterior"}. Consulta de seguimiento: ${current}.`:current,
    continued:canContinue};
}
