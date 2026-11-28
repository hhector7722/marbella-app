import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { isMasterDashboardUser } from '@/lib/master-dashboard'
import { loadEventCartaMenu } from '@/lib/load-event-carta-menu'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function response(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
}
function db() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY
  if(!url || !key) throw new Error('BDP queue backend not configured')
  return createAdminClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}})
}
async function master() {
  const supabase=await createClient()
  const {data:{user},error}=await supabase.auth.getUser()
  return !error && user && isMasterDashboardUser(user.email) ? user : null
}
function isFresh(state: {ready?:boolean;checked_at?:string}|null) {
  const age=Date.now()-Date.parse(state?.checked_at??'')
  return state?.ready===true && Number.isFinite(age) && age>=-5000 && age<15000
}
type InputLine={plu:number;quantity:number;portion?:'entero'|'medio'}
// Verified against BDP Articulos.PVP1_Proporcion_2 on 2026-11-28.
// Preview-only snapshot: half-portion submission stays disabled until the
// official Handy proportion selection and live price reconciliation are verified.
const verifiedHalfPrices:Readonly<Record<number,number>>={79:3.4,80:3.4,81:4.2,83:4,84:3.4,94:3.5,95:7.3,96:3.5,97:3.5,98:4.4,99:3.2,100:3.4,101:4.6,102:3.4,103:4,104:4,215:4.2}
type CatalogLine={id:number;nombre:string;precio_base:number;departamento_id:number|null}
async function catalog(database:ReturnType<typeof db>) {
  const [a,d]=await Promise.all([
    database.from('bdp_articulos').select('id,nombre,precio_base,departamento_id').gt('id',0).gt('precio_base',0).order('nombre'),
    database.from('bdp_departamentos').select('id,nombre').order('nombre'),
  ])
  if(a.error||d.error) throw new Error('BDP catalog unavailable')
  // Read the exact same image catalogue as /pedido; BDP still owns PLUs and prices.
  const carta=await loadEventCartaMenu(database,[]).catch(()=>null)
  const menu=carta?.ok?carta.data:null
  const rows=menu?.items??[]
  const byPlu=new Map(rows.map(row=>[row.articulo_id,row]))
  const products=((a.data??[]) as CatalogLine[]).map(p=>{
    const row=byPlu.get(p.id)
    return {...p,photo_url:row?.photo_url??null,carta_photo_scale:row?.carta_photo_scale??null,
      category_parent_name:row?.category_parent_name??null,sort_order:row?.sort_order??null,
      medio_price:verifiedHalfPrices[p.id]??null}
  })
  // Explicit matches verified against the existing BDP department and carta catalogues.
  const covers:Record<number,string>={
    1:'Cafetería',2:'Snacks',3:'Bebidas - Refrescos',4:'Bebidas - Cervezas',
    6:'Tapas',8:'Extras',10:'Platos',11:'Helados',12:'Bebidas - Aperitivos',
    13:'Bocadillos - Calientes',14:'Bocadillos - Fríos',15:'Bocadillos - Especiales',
  }
  const departments=(d.data??[]).map(department=>{
    const name=covers[department.id]
    const category=menu?.menuCategories.find(x=>x.name===name)
    const ownPhoto=products.find(p=>p.departamento_id===department.id&&p.photo_url)?.photo_url
    return {...department,coverPhotoUrl:(category?menu?.categoryCoverById[category.id]:null)??ownPhoto??'/icons/bdp.svg',
      coverPhotoScale:category?menu?.categoryCoverScaleById[category.id]??'m':'m'}
  })
  return {products,departments}
}
export async function GET(req:Request) {
  try {
    const user=await master()
    if(!user) return response({error:'No autorizado'},401)
    const database=db()
    const key=new URL(req.url).searchParams.get('requestKey')
    if(key && !UUID.test(key))return response({error:'Petición inválida'},400)
    const [state,active,job]=await Promise.all([
      database.from('bdp_handy_agent_state').select('ready,checked_at,detail').eq('id',true).maybeSingle(),
      database.from('bdp_handy_jobs').select('id,status,table_number,request_key').in('status',['queued','executing','uncertain']).maybeSingle(),
      key ? database.from('bdp_handy_jobs').select('id,status,table_number,result,items').eq('request_key',key).eq('created_by',user.id).maybeSingle() : Promise.resolve({data:null,error:null}),
    ])
    if(state.error||active.error||job.error)throw new Error('BDP queue unavailable')
    const data={ready:isFresh(state.data),detail:state.data?.detail??'Handy no conectado al agente',active:active.data,job:job.data}
    if(key||new URL(req.url).searchParams.get('status')==='1') return response(data)
    return response({...data,...await catalog(database)})
  } catch(e) {
    console.error('BDP GET',e)
    return response({error:'No se pudo consultar BDP'},503)
  }
}

export async function POST(req:Request) {
  try {
    const user=await master()
    if(!user)return response({error:'No autorizado'},401)
    const input=await req.json() as {requestKey?:unknown;tableNumber?:unknown;items?:unknown}
    if(typeof input.requestKey!=='string'||!UUID.test(input.requestKey)||typeof input.tableNumber!=='number'||!Number.isSafeInteger(input.tableNumber)||input.tableNumber<1||input.tableNumber>9999||!Array.isArray(input.items)||!input.items.length||input.items.length>20)return response({error:'Comanda inválida'},400)
    const lines=new Map<number,number>()
    for(const row of input.items as InputLine[]) {
      if(!row||typeof row.plu!=='number'||!Number.isSafeInteger(row.plu)||row.plu<1||typeof row.quantity!=='number'||!Number.isSafeInteger(row.quantity)||row.quantity<1||row.quantity>20)return response({error:'Producto o cantidad inválidos'},400)
      if(row.portion!==undefined&&row.portion!=='entero')return response({error:'El envío de medias raciones aún no está validado en Handy. No se ha enviado la comanda.'},400)
      lines.set(row.plu,(lines.get(row.plu)??0)+row.quantity)
    }
    if([...lines.values()].reduce((a,b)=>a+b,0)>20)return response({error:'Máximo 20 unidades por comanda durante la fase inicial'},400)
    const database=db()
    const existing=await database.from('bdp_handy_jobs').select('id,status,table_number,items,result').eq('request_key',input.requestKey).eq('created_by',user.id).maybeSingle()
    if(existing.error)throw existing.error
    if(existing.data) {
      const old=existing.data.items as InputLine[]
      if(existing.data.table_number!==input.tableNumber||old.length!==lines.size||old.some(x=>lines.get(x.plu)!==x.quantity))return response({error:'Esta petición ya está asociada a otra comanda'},409)
      return response({job:existing.data})
    }
    const [plan,state,products]=await Promise.all([
      database.from('staff_floorplans').select('published').eq('id','principal').maybeSingle(),
      database.from('bdp_handy_agent_state').select('ready,checked_at').eq('id',true).maybeSingle(),
      database.from('bdp_articulos').select('id,nombre,precio_base').in('id',[...lines.keys()]).gt('precio_base',0),
    ])
    if(plan.error||state.error||products.error)throw new Error('BDP preflight unavailable')
    const published=plan.data?.published as {tables?:{number?:number}[]}|null
    // The published plan enables the pilot; it is not a registry of every BDP table.
    // Manual numbers use the same authenticated, bounded and reconciled Handy flow.
    if(!Array.isArray(published?.tables))return response({error:'Plano no publicado'},400)
    if(!published.tables.some(t=>t.number===input.tableNumber)&&input.tableNumber>999)return response({error:'Número fuera del rango configurado en BDP'},400)
    if(!isFresh(state.data))return response({error:'El agente Handy no está disponible. No se ha enviado la comanda.'},503)
    const byId=new Map((products.data??[]).map(p=>[p.id,p]))
    if([...lines.keys()].some(id=>!byId.has(id)))return response({error:'Uno de los productos no está disponible'},400)
    const items=[...lines].sort(([a],[b])=>a-b).map(([plu,quantity])=>{
      const product=byId.get(plu)!
      return {plu,quantity,name:product.nombre,price:Number(product.precio_base)}
    })
    if(items.some(x=>!Number.isFinite(x.price)||x.price<=0))return response({error:'Precio BDP inválido'},400)
    const {data,error}=await database.from('bdp_handy_jobs').insert({
      request_key:input.requestKey,created_by:user.id,table_number:input.tableNumber,items
    }).select('id,status,table_number,items,result').single()
    if(error?.code==='23505') {
      const retry=await database.from('bdp_handy_jobs').select('id,status,table_number,items,result').eq('request_key',input.requestKey).eq('created_by',user.id).maybeSingle()
      if(retry.data&&retry.data.table_number===input.tableNumber&&Array.isArray(retry.data.items)&&retry.data.items.length===lines.size&&retry.data.items.every((x:InputLine)=>lines.get(x.plu)===x.quantity))return response({job:retry.data})
      return response({error:'Hay otra comanda pendiente o con resultado incierto. No se ha enviado una nueva.'},409)
    }
    if(error||!data)throw error??new Error('Queue insert failed')
    return response({job:data},202)
  }catch(e){
    console.error('BDP POST',e)
    return response({error:'No se pudo registrar la petición. Consulta su estado antes de volver a enviarla.'},503)
  }
}
