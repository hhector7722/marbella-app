'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Minus, Plus, Search, Send } from 'lucide-react'
import { toast } from 'sonner'

type Product={id:number;nombre:string;precio_base:number;departamento_id:number|null}
type Department={id:number;nombre:string}
type Line={plu:number;quantity:number}
type Job={id:string;status:'queued'|'executing'|'confirmed'|'rejected'|'uncertain'|'expired';table_number:number;result?:{detail?:string}}
type Status={ready:boolean;detail:string;active:{status:string;table_number:number;request_key:string}|null;job:Job|null}
type Stored={requestKey:string;items:Line[]}
const money=(n:number)=>n.toLocaleString('es-ES',{style:'currency',currency:'EUR'})
const labels:Record<Job['status'],string>={queued:'En cola',executing:'Ejecutando en Handy',confirmed:'Confirmada en BDP',rejected:'No enviada',uncertain:'Resultado incierto: comprobar BDP',expired:'Caducada sin ejecutar'}

export function BdpOrderView({tableNumber,onBack}:{tableNumber:number;onBack:()=>void}){
  const storageKey='marbella-bdp-order-'+tableNumber
  const [products,setProducts]=useState<Product[]>([])
  const [departments,setDepartments]=useState<Department[]>([])
  const [search,setSearch]=useState('')
  const [department,setDepartment]=useState<number|null>(null)
  const [items,setItems]=useState<Line[]>([])
  const [requestKey,setRequestKey]=useState<string|null>(null)
  const [status,setStatus]=useState<Status|null>(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const submitting=useRef(false)

  useEffect(()=>{
    try{
      const raw=localStorage.getItem(storageKey)
      if(raw){
        const value=JSON.parse(raw) as Stored
        if(value.requestKey&&Array.isArray(value.items)){setItems(value.items);setRequestKey(value.requestKey)}
      }
    }catch{}
    let cancelled=false
    fetch('/api/staff/bdp',{cache:'no-store'}).then(async r=>{
      const data=await r.json()
      if(!r.ok)throw Error(data.error??'No se pudo cargar el catálogo')
      if(!cancelled){setProducts(data.products??[]);setDepartments(data.departments??[]);setStatus(data)}
    }).catch(e=>{if(!cancelled)setError(e.message)})
    return()=>{cancelled=true}
  },[storageKey])

  useEffect(()=>{
    let stopped=false
    let running=false
    const refresh=async()=>{
      if(running)return
      running=true
      try{
        const url=requestKey?'/api/staff/bdp?requestKey='+encodeURIComponent(requestKey):'/api/staff/bdp?status=1'
        const res=await fetch(url,{cache:'no-store'})
        const data=await res.json()
        if(!res.ok)throw Error(data.error??'No se pudo consultar BDP')
        if(!stopped)setStatus(data)
      }catch{if(!stopped)setStatus(null)}
      finally{running=false}
    }
    void refresh()
    const timer=setInterval(()=>void refresh(),2000)
    return()=>{stopped=true;clearInterval(timer)}
  },[requestKey])

  const units=items.reduce((sum,x)=>sum+x.quantity,0)
  const byId=new Map(products.map(p=>[p.id,p]))
  const total=items.reduce((sum,x)=>sum+(Number(byId.get(x.plu)?.precio_base)||0)*x.quantity,0)
  const filtered=products.filter(p=>(department===null||p.departamento_id===department)&&(!search.trim()||p.nombre.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())||String(p.id)===search.trim()))
  const current=status?.job
  const finished=current&&['confirmed','rejected','expired'].includes(current.status)
  const canSend=!!status?.ready&&!status.active&&units>0&&units<=20&&!busy&&!current
  const change=(plu:number,delta:number)=>{
    if(requestKey||busy)return
    if(delta>0&&units>=20){toast.error('Máximo 20 unidades en el piloto');return}
    setItems(old=>{
      const amount=(old.find(x=>x.plu===plu)?.quantity??0)+delta
      return amount<=0?old.filter(x=>x.plu!==plu):old.some(x=>x.plu===plu)?old.map(x=>x.plu===plu?{...x,quantity:amount}:x):[...old,{plu,quantity:amount}]
    })
  }
  const send=async()=>{
    if(!canSend||submitting.current)return
    if(!requestKey&&!window.confirm('¿Enviar esta comanda real a BDP?'))return
    submitting.current=true
    setBusy(true);setError('')
    try{
      const key=requestKey??crypto.randomUUID()
      localStorage.setItem(storageKey,JSON.stringify({requestKey:key,items}))
      setRequestKey(key)
      const res=await fetch('/api/staff/bdp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestKey:key,tableNumber,items})})
      const data=await res.json()
      if(!res.ok)throw Error(data.error??'No se pudo registrar la comanda')
      setStatus(old=>old?{...old,job:data.job}:null)
    }catch(e){setError(e instanceof Error?e.message:'Comprueba el estado de la petición antes de repetirla.')}
    finally{setBusy(false);submitting.current=false}
  }
  const reset=()=>{
    if(!finished)return
    localStorage.removeItem(storageKey)
    setRequestKey(null);setItems([]);setError('')
    setStatus(old=>old?{...old,job:null}:null)
  }
  return(
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden text-white">
      <header className="flex shrink-0 items-center gap-3">
        <button type="button" onClick={onBack} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15" aria-label="Volver al plano"><ArrowLeft size={22}/></button>
        <div className="min-w-0 flex-1"><h1 className="text-xl font-semibold">Mesa {tableNumber}</h1><p className="text-xs text-white/70">BDP · Comanda nueva</p></div>
        <span className="text-xs font-semibold">{status?.ready?'Handy conectado':'Handy no disponible'}</span>
      </header>
      <div className="shrink-0 rounded-lg bg-white/10 px-3 py-2 text-xs">
        {current?labels[current.status]:status?.active?'Otra comanda ocupa el ejecutor.':status?.ready?'Precios base del catálogo BDP. El importe se confirma en el TPV.':'Envío deshabilitado hasta conectar el ejecutor Handy.'}
        {current?.result?.detail&&<p className="mt-1">{current.result.detail}</p>}
        {error&&<p className="mt-1 text-rose-200" role="alert">{error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2 rounded-xl bg-white px-3 text-slate-900"><Search size={18}/><input className="h-12 min-w-0 flex-1 bg-transparent outline-none" placeholder="Buscar producto o PLU" value={search} onChange={e=>setSearch(e.target.value)}/></div>
      <div className="flex shrink-0 gap-2 overflow-x-auto pb-1">
        {[{id:null,nombre:'Todos'},...departments].map(d=><button type="button" key={d.id??'all'} onClick={()=>setDepartment(d.id)} className={'min-h-12 shrink-0 rounded-xl px-3 text-sm font-semibold '+(department===d.id?'bg-white text-slate-900':'bg-white/10')}>{d.nombre||'Otros'}</button>)}
      </div>
      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
        {filtered.map(p=><button key={p.id} type="button" disabled={!!requestKey||busy} onClick={()=>change(p.id,1)} className="flex min-h-16 flex-col justify-between rounded-xl bg-white/95 p-3 text-left text-slate-900 disabled:opacity-60"><span className="text-sm font-semibold">{p.nombre}</span><span className="text-xs text-slate-600">{money(Number(p.precio_base))}</span></button>)}
      </div>
      <div className="shrink-0 rounded-xl bg-white p-3 text-slate-900">
        <div className="mb-2 flex items-center justify-between"><span className="font-semibold">Nueva comanda · {units} uds.</span><span className="font-semibold">{money(total)}</span></div>
        <div className="max-h-[22dvh] overflow-y-auto">
          {items.map(x=><div key={x.plu} className="flex min-h-12 items-center gap-1 border-t border-slate-100"><span className="min-w-0 flex-1 text-sm">{byId.get(x.plu)?.nombre??'PLU '+x.plu}</span><button disabled={!!requestKey||busy} type="button" aria-label="Quitar unidad" onClick={()=>change(x.plu,-1)} className="flex h-12 w-12 items-center justify-center disabled:opacity-30"><Minus size={18}/></button><span className="w-5 text-center font-semibold">{x.quantity}</span><button disabled={!!requestKey||busy} type="button" aria-label="Añadir unidad" onClick={()=>change(x.plu,1)} className="flex h-12 w-12 items-center justify-center disabled:opacity-30"><Plus size={18}/></button></div>)}
        </div>
        {finished?<button type="button" onClick={reset} className="mt-2 h-12 w-full rounded-lg bg-slate-900 font-semibold text-white">Nueva comanda</button>:<button type="button" disabled={!canSend} onClick={()=>void send()} className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#0755f5] font-semibold text-white disabled:opacity-40"><Send size={18}/>{busy?'Registrando…':current?labels[current.status]:requestKey?'Consultar y reenviar la misma petición':'Enviar a BDP'}</button>}
      </div>
    </div>
  )
}
