'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Minus, Plus, Search, Send } from 'lucide-react'
import { CartaCategoryCard, CartaCategoryGrid } from '@/components/carta/CartaCategoryGrid'
import { CartaStaffMenuProductCard } from '@/components/carta/CartaStaffMenuProductCard'
import { EventEncargoViewOrderButton } from '@/components/eventos/EventEncargoCartFooter'
import { Button } from '@/components/ui/button'
import { formatCartaOrderProductName } from '@/lib/carta-menu-i18n'
import type { EventOrderCartaControl } from '@/lib/event-order-carta'
import { toast } from 'sonner'

type Product={id:number;nombre:string;precio_base:number;departamento_id:number|null;photo_url?:string|null;carta_photo_scale?:string|null;category_parent_name?:string|null;sort_order?:number|null}
type Department={id:number;nombre:string;coverPhotoUrl?:string|null;coverPhotoScale?:string|null}
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
  const [cartOpen,setCartOpen]=useState(false)
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
  const categoryList=departments.filter(d=>products.some(p=>p.departamento_id===d.id))
  const orphaned=products.filter(p=>!categoryList.some(d=>d.id===p.departamento_id))
  const categories=orphaned.length?[...categoryList,{id:-1,nombre:'Otros',coverPhotoUrl:'/icons/bdp.svg',coverPhotoScale:'m'}]:categoryList
  const activeCategory=categories.find(d=>d.id===department)
  const filtered=products.filter(p=>(department===null||p.departamento_id===department||(department===-1&&orphaned.includes(p)))&&(!search.trim()||p.nombre.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())||String(p.id)===search.trim()))
    .sort((a,b)=>(a.sort_order??Number.MAX_SAFE_INTEGER)-(b.sort_order??Number.MAX_SAFE_INTEGER)||a.nombre.localeCompare(b.nombre,'es'))
  const showProducts=department!==null||Boolean(search.trim())
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
  // The reservation product card is purely visual here. Quantity always refers
  // to one real BDP PLU; no virtual half portions or reservation-specific options.
  const eventOrder:EventOrderCartaControl={
    qtyByProductId:Object.fromEntries(items.map(x=>[String(x.plu),x.quantity])),
    photoControls:true,tapToAdd:true,totalUnits:units,openCart:()=>setCartOpen(true),
    onQuantityChange:(plu,quantity,options)=>{
      if(options?.portion==='medio'||!byId.has(plu)||requestKey||busy)return
      const previous=items.find(x=>x.plu===plu)?.quantity??0
      const delta=quantity-previous
      if(delta===1||delta===-1)change(plu,delta)
    },
  }
  const goBack=()=>{
    if(cartOpen){setCartOpen(false);return}
    if(showProducts){setDepartment(null);setSearch('');return}
    onBack()
  }
  return(
    <div className="carta-shared-scene flex h-full min-h-0 flex-1 flex-col overflow-hidden text-white">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-2xl flex-col gap-2 px-2">
        <header className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={goBack} className="flex h-12 w-12 shrink-0 items-center justify-center" aria-label="Volver"><ArrowLeft size={22}/></button>
          <div className="min-w-0 flex-1 text-center">
            <h1 className="truncate text-xl font-semibold">{cartOpen?'Tu pedido':activeCategory?.nombre||'Mesa '+tableNumber}</h1>
            {(cartOpen||showProducts)&&<p className="text-xs text-white/70">Mesa {tableNumber}</p>}
          </div>
          <div className="w-12 shrink-0"/>
        </header>
        <div className="shrink-0 text-center text-xs" role="status">
          <span>{current?labels[current.status]:status?.active?'Otra comanda ocupa el ejecutor.':status?.ready?'Handy conectado':'Handy no disponible'}</span>
          {current?.result?.detail&&<p className="mt-1">{current.result.detail}</p>}
          {error&&<p className="mt-1 text-rose-200" role="alert">{error}</p>}
        </div>
        {!cartOpen&&<div className="flex shrink-0 items-center gap-2 rounded-xl bg-white px-3 text-slate-900"><Search size={18}/><input className="h-12 min-w-0 flex-1 bg-transparent outline-none" placeholder="Buscar producto o PLU" value={search} onChange={e=>setSearch(e.target.value)}/></div>}
        {cartOpen?(
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-white p-3 text-slate-900">
            <div className="min-h-0 flex-1 overflow-y-auto">
              {items.map(x=>{
                const p=byId.get(x.plu)
                return <div key={x.plu} className="flex min-h-12 items-center gap-1 border-b border-zinc-100">
                  {p?.photo_url&&<img src={p.photo_url} alt="" loading="lazy" className="h-8 w-8 shrink-0 object-contain"/>}
                  <span className="min-w-0 flex-1 text-xs font-semibold">{formatCartaOrderProductName(p?.nombre??'PLU '+x.plu)}</span>
                  <button disabled={!!requestKey||busy} type="button" aria-label="Quitar unidad" onClick={()=>change(x.plu,-1)} className="flex h-12 w-10 shrink-0 items-center justify-center disabled:opacity-30"><Minus size={16}/></button>
                  <span className="w-5 text-center text-xs font-semibold tabular-nums">{x.quantity}</span>
                  <button disabled={!!requestKey||busy} type="button" aria-label="Añadir unidad" onClick={()=>change(x.plu,1)} className="flex h-12 w-10 shrink-0 items-center justify-center disabled:opacity-30"><Plus size={16}/></button>
                  <span className="shrink-0 text-xs font-semibold tabular-nums">{money((Number(p?.precio_base)||0)*x.quantity)}</span>
                </div>
              })}
              {!items.length&&<p className="py-6 text-center text-sm text-zinc-500">Aún no hay productos.</p>}
            </div>
            <div className="shrink-0">
              <div className="flex items-center justify-between border-t border-zinc-100 py-3"><span className="text-xs text-zinc-500">{units} uds.</span><span className="font-semibold">Total {money(total)}</span></div>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="secondary" layout="fill" instance="bdp-cart-continue" onClick={()=>setCartOpen(false)}>Seguir eligiendo</Button>
                {finished?<Button type="button" variant="primary" layout="fill" instance="bdp-cart-reset" onClick={()=>{reset();setCartOpen(false)}}>Nueva comanda</Button>:<Button type="button" variant="primary" layout="fill" instance="bdp-cart-send" disabled={!canSend} loading={busy} onClick={()=>void send()}><Send size={16}/>{current?labels[current.status]:requestKey?'Consultar y reenviar':'Enviar a BDP'}</Button>}
              </div>
            </div>
          </div>
        ):(
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain custom-scrollbar">
            {!showProducts?(
              <CartaCategoryGrid compact layoutClassName="grid-cols-3">
                {categories.map(d=><CartaCategoryCard key={d.id} title={d.nombre||'Otros'} coverPhotoUrl={d.coverPhotoUrl??'/icons/bdp.svg'} coverPhotoScale={d.coverPhotoScale} compact nativeImg onClick={()=>setDepartment(d.id)}/>)}
              </CartaCategoryGrid>
            ):(
              <div className="carta-browse-modal">
                <div className={'grid grid-cols-3 gap-x-2.5 gap-y-4 '+(requestKey||busy?'pointer-events-none opacity-80':'')}>
                  {filtered.map(p=><CartaStaffMenuProductCard key={p.id} lang="es" squareLayout rowDensity="compact" photoFrameStyle={{aspectRatio:1}} row={{
                    articulo_id:p.id,carta_nombre:p.nombre,carta_nombre_es:p.nombre,carta_nombre_ca:null,carta_nombre_en:null,
                    precio:p.precio_base,photo_url:p.photo_url??null,carta_photo_scale:p.carta_photo_scale,
                  }} eventOrder={eventOrder}/>)}
                </div>
                {!filtered.length&&<p className="py-6 text-center text-sm text-white/70">No hay productos.</p>}
              </div>
            )}
          </div>
        )}
        {!cartOpen&&<div className="flex shrink-0 justify-center pb-1"><EventEncargoViewOrderButton instance="bdp-ver-pedido" units={units} onClick={()=>setCartOpen(true)}/></div>}
      </div>
    </div>
  )
}
