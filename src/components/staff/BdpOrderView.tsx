'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Search, X } from 'lucide-react'
import { CartaCategoryCard, CartaCategoryGrid } from '@/components/carta/CartaCategoryGrid'
import { CartaMenuProductPhoto } from '@/components/carta/CartaMenuProductPhoto'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { CartaDualRacionPrices } from '@/components/carta/CartaDualRacionPrices'
import { toast } from 'sonner'

type Product={id:number;nombre:string;precio_base:number;departamento_id:number|null;photo_url?:string|null;carta_photo_scale?:string|null;category_parent_name?:string|null;sort_order?:number|null;medio_price?:number|null}
type Department={id:number;nombre:string;coverPhotoUrl?:string|null;coverPhotoScale?:string|null}
type Portion='entero'|'medio'
type Line={plu:number;quantity:number;portion?:Portion}
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
  const [portionPicker,setPortionPicker]=useState<{product:Product;delta:1|-1}|null>(null)
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
  const quantityOf=(plu:number,portion:Portion)=>items.find(x=>x.plu===plu&&(x.portion??'entero')===portion)?.quantity??0
  const hasHalf=items.some(x=>x.portion==='medio')
  const total=items.reduce((sum,x)=>sum+(Number(x.portion==='medio'?byId.get(x.plu)?.medio_price:byId.get(x.plu)?.precio_base)||0)*x.quantity,0)
  const categoryList=departments.filter(d=>products.some(p=>p.departamento_id===d.id))
  const orphaned=products.filter(p=>!categoryList.some(d=>d.id===p.departamento_id))
  const categories=orphaned.length?[...categoryList,{id:-1,nombre:'Otros',coverPhotoUrl:'/icons/bdp.svg',coverPhotoScale:'m'}]:categoryList
  const activeCategory=categories.find(d=>d.id===department)
  const filtered=products.filter(p=>(department===null||p.departamento_id===department||(department===-1&&orphaned.includes(p)))&&(!search.trim()||p.nombre.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())||String(p.id)===search.trim()))
    .sort((a,b)=>(a.sort_order??Number.MAX_SAFE_INTEGER)-(b.sort_order??Number.MAX_SAFE_INTEGER)||a.nombre.localeCompare(b.nombre,'es'))
  const showProducts=department!==null||Boolean(search.trim())
  const current=status?.job
  const finished=current&&['confirmed','rejected','expired'].includes(current.status)
  const canSend=!!status?.ready&&!status.active&&units>0&&units<=20&&!busy&&!current&&!hasHalf
  const change=(plu:number,delta:number,portion:Portion='entero')=>{
    if(requestKey||busy)return
    if(portion==='medio'&&!(Number(byId.get(plu)?.medio_price)>0))return
    if(delta>0&&units>=20){toast.error('Máximo 20 unidades en el piloto');return}
    setItems(old=>{
      const matches=(x:Line)=>x.plu===plu&&(x.portion??'entero')===portion
      const amount=(old.find(matches)?.quantity??0)+delta
      return amount<=0?old.filter(x=>!matches(x)):old.some(matches)?old.map(x=>matches(x)?{...x,quantity:amount}:x):[...old,{plu,quantity:amount,portion}]
    })
  }
  const selectPortion=(product:Product,delta:1|-1)=>{
    if(requestKey||busy)return
    if(!(Number(product.medio_price)>0)){change(product.id,delta);return}
    if(delta<0){
      const entero=quantityOf(product.id,'entero'),medio=quantityOf(product.id,'medio')
      if(!entero||!medio){if(entero||medio)change(product.id,-1,entero?'entero':'medio');return}
    }
    setPortionPicker({product,delta})
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
  const goBack=()=>{
    if(showProducts){setDepartment(null);setSearch('');return}
    onBack()
  }
  const handyLabel=status?.ready?'Handy conectado':'Handy no disponible'
  const locked=!!requestKey||busy
  return(
    <div className="carta-shared-scene flex h-full min-h-0 flex-1 flex-col overflow-hidden text-white" style={{background:'transparent'}}>
      <div className="flex h-full min-h-0 w-full flex-col gap-2">
        <header className="relative z-40 grid w-full shrink-0 grid-cols-[minmax(104px,1fr)_minmax(0,1.6fr)_minmax(104px,1fr)] items-center gap-1">
          <div className="flex min-w-0 items-center justify-start">
            <button type="button" onClick={goBack} className="flex h-12 w-10 shrink-0 items-center justify-center text-white" aria-label="Volver"><ArrowLeft size={22}/></button>
            <h1 className="min-w-0 whitespace-nowrap text-xs font-semibold text-white">M {tableNumber}</h1>
          </div>
          <div className="flex min-w-0 items-center justify-center">
            <div className="flex h-[var(--espacio-8)] w-full min-w-0 items-center gap-2 rounded-full border border-white/15 bg-[var(--buscador-global-fondo)] px-3 text-white/60 focus-within:ring-1 focus-within:ring-white/50">
              <Search aria-hidden size={14} className="shrink-0"/>
              <input type="search" autoComplete="off" aria-label="Buscar producto" placeholder="Buscar producto..." value={search}
                onChange={e=>setSearch(e.target.value)}
                className="h-full w-full min-w-0 bg-transparent text-xs text-white outline-none placeholder:text-white/60"/>
            </div>
          </div>
          <div role="status" aria-label={handyLabel} title={handyLabel} className="flex min-w-0 items-center justify-end gap-1.5 text-right text-[10px] font-semibold leading-tight text-white/75">
            <span>Handy</span>
            <span aria-hidden="true" className={'flex size-4 shrink-0 items-center justify-center rounded-full text-white '+(status?.ready?'bg-[var(--color-positivo)]':'bg-[var(--color-negativo)]')}>
              {status?.ready?<Check size={11} strokeWidth={3}/>:<X size={11} strokeWidth={3}/>}
            </span>
          </div>
        </header>
        {(error||current?.result?.detail||(!current&&status?.active))&&(
          <div className="shrink-0 text-center text-xs text-white/75" role="status">
            {!current&&status?.active&&<p>Otra comanda ocupa el ejecutor.</p>}
            {current?.result?.detail&&<p>{current.result.detail}</p>}
            {error&&<p className="text-rose-200" role="alert">{error}</p>}
          </div>
        )}
        {activeCategory&&<h2 className="shrink-0 text-center text-sm font-semibold">{activeCategory.nombre}</h2>}
        <div className="mx-auto min-h-0 w-full max-w-2xl flex-1 overflow-y-auto overscroll-contain custom-scrollbar">
          {!showProducts?(
            <CartaCategoryGrid compact layoutClassName="grid-cols-3">
              {categories.map(d=><CartaCategoryCard key={d.id} title={d.nombre||'Otros'} coverPhotoUrl={d.coverPhotoUrl??'/icons/bdp.svg'} coverPhotoScale={d.coverPhotoScale} compact nativeImg onClick={()=>setDepartment(d.id)}/>)}
            </CartaCategoryGrid>
          ):(
            <div className="carta-browse-modal">
              <div className="grid grid-cols-3 gap-x-2.5 gap-y-4">
                {filtered.map(p=>{
                  const quantity=quantityOf(p.id,'entero')+quantityOf(p.id,'medio')
                  return <div key={p.id} className="carta-square-product-card flex min-w-0 flex-col">
                    <div data-carta-product-photo>
                      <div className="relative min-h-0 w-full flex-1 overflow-hidden">
                        <div className="flex h-full w-full items-center justify-center p-1">
                          {p.photo_url&&<CartaMenuProductPhoto src={p.photo_url} alt="" scale={p.carta_photo_scale} articuloId={p.id} squareLayout/>}
                        </div>
                        {quantity>0&&<span className="pointer-events-none absolute right-1 top-1 z-10 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[10px] font-semibold tabular-nums leading-none text-white" aria-label={quantity+' unidades seleccionadas'}>{quantity}</span>}
                      </div>
                      <div data-carta-order-controls className={locked?'opacity-60':undefined} aria-label={'Unidades de '+p.nombre}>
                        {quantity===0?<button type="button" data-action="add" disabled={locked} onClick={()=>selectPortion(p,1)} aria-label={'Añadir '+p.nombre}>AÑADIR</button>:<>
                          <button type="button" data-action="remove" disabled={locked} onClick={()=>selectPortion(p,-1)} aria-label={'Quitar una unidad de '+p.nombre}>−</button>
                          <button type="button" data-action="increment" disabled={locked} onClick={()=>selectPortion(p,1)} aria-label={'Añadir una unidad de '+p.nombre}>+</button>
                        </>}
                      </div>
                    </div>
                    <div data-carta-product-info>
                      {Number(p.medio_price)>0?<CartaDualRacionPrices racionEntero="Entero" racionMedio="Medio" precio={p.precio_base} precioMedio={p.medio_price} variant="staff" singleLine/>:<p data-carta-display-price>{money(Number(p.precio_base))}</p>}
                      <p data-carta-display-name className={p.nombre.length>18?'carta-catalog-long-name':undefined} title={p.nombre}>{p.nombre}</p>
                    </div>
                  </div>
                })}
              </div>
              {!filtered.length&&<p className="py-6 text-center text-sm text-white/70">No hay productos.</p>}
            </div>
          )}
        </div>
        {hasHalf&&<p role="status" className="shrink-0 text-center text-xs text-amber-200">Envío de medias raciones pendiente de validar en Handy. No se enviará como entero.</p>}
        {(units>0||requestKey)&&(
          <footer className="flex shrink-0 items-center justify-between gap-2 text-white">
            <div className="min-w-0 text-xs tabular-nums"><span>{units} uds. · </span><strong>{money(total)}</strong></div>
            {finished?<Button type="button" variant="primary" instance="bdp-order-reset" onClick={reset}>Nueva comanda</Button>:<Button type="button" variant="primary" instance="bdp-order-send" disabled={!canSend} loading={busy} onClick={()=>void send()}>{current?labels[current.status]:requestKey?'Consultar y reenviar':'Enviar a BDP'}</Button>}
          </footer>
        )}
      </div>
      <Modal open={portionPicker!==null} onClose={()=>setPortionPicker(null)} title={portionPicker?.product.nombre??''} variant="compact" instance="bdp-portion-picker">
        {portionPicker&&<div className="grid grid-cols-2 gap-2">
          {(['entero','medio'] as const).map(portion=>{
            const p=portionPicker.product
            const quantity=quantityOf(p.id,portion)
            return <button key={portion} type="button" disabled={locked||(portionPicker.delta<0&&quantity===0)} onClick={()=>{change(p.id,portionPicker.delta,portion);setPortionPicker(null)}} className="flex min-h-[84px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-sky-200 bg-sky-50 px-2 py-3 text-sky-950 disabled:opacity-40">
              <span className="text-sm font-semibold">{portion==='entero'?'Entero':'Medio'}</span>
              <strong className="text-lg tabular-nums">{money(Number(portion==='entero'?p.precio_base:p.medio_price))}</strong>
              {quantity>0&&<span className="text-xs">{quantity} seleccionado{quantity===1?'':'s'}</span>}
            </button>
          })}
        </div>}
      </Modal>
    </div>
  )
}
