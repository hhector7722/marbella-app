'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ChevronDown, ChevronUp, Eye, EyeOff, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { type MobileCatalog, type MobileCategoryDisplay, type MobileCatalogProduct, unassignedIds } from '@/lib/staff/bdp-mobile-catalog'

const normalize=(s:string)=>s.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
export function BdpCatalogAdmin(){
  const [categories,setCategories]=useState<MobileCategoryDisplay[]>([])
  const [products,setProducts]=useState<MobileCatalogProduct[]>([])
  const [revision,setRevision]=useState(0)
  const [selected,setSelected]=useState<string|null>(null)
  const [search,setSearch]=useState('')
  const [onlyUnassigned,setOnlyUnassigned]=useState(false)
  const [busy,setBusy]=useState(false)
  const [dirty,setDirty]=useState(false)
  const [error,setError]=useState('')
  useEffect(()=>{
    let alive=true
    fetch('/api/staff/bdp',{cache:'no-store'}).then(async res=>{
      const data=await res.json()
      if(!res.ok)throw Error(data.error??'No se pudo cargar el catálogo')
      if(alive){const catalog=data as MobileCatalog;setCategories(catalog.categories);setProducts(catalog.products);setRevision(catalog.revision);setSelected(catalog.categories.find(c=>c.parentId===null)?.id??null)}
    }).catch(e=>{if(alive)setError(e.message)})
    return()=>{alive=false}
  },[])
  useEffect(()=>{
    if(!dirty)return
    const handler=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''}
    window.addEventListener('beforeunload',handler)
    return()=>window.removeEventListener('beforeunload',handler)
  },[dirty])
  const current=categories.find(c=>c.id===selected)
  const unassigned=new Set(unassignedIds(categories,products))
  const byId=new Map(products.map(p=>[p.id,p]))
  const update=(fn:(old:MobileCategoryDisplay[])=>MobileCategoryDisplay[])=>{
    if(busy||!revision)return
    setCategories(fn);setDirty(true);setError('')
  }
  const add=(parentId:string|null)=>{
    if(categories.length>=200)return
    const id=crypto.randomUUID()
    update(old=>[...old,{id,parentId,sourceId:null,name:parentId?'Nueva subcategoría':'Nueva categoría',hidden:false,products:[]}])
    setSelected(id)
  }
  const patch=(id:string,change:Partial<MobileCategoryDisplay>)=>update(old=>old.map(c=>c.id===id?{...c,...change}:c))
  const remove=(id:string)=>{
    if(!window.confirm('¿Eliminar esta categoría y sus subcategorías? Los productos seguirán en el catálogo.'))return
    update(old=>old.filter(c=>c.id!==id&&c.parentId!==id))
    if(selected===id||current?.parentId===id)setSelected(null)
  }
  const moveCategory=(id:string,delta:number)=>{
    update(old=>{
      const row=old.find(c=>c.id===id)
      if(!row)return old
      const siblings=old.filter(c=>c.parentId===row.parentId)
      const i=siblings.findIndex(c=>c.id===id),j=i+delta
      if(j<0||j>=siblings.length)return old
      const next=[...old],a=old.findIndex(c=>c.id===id),b=old.findIndex(c=>c.id===siblings[j].id)
      ;[next[a],next[b]]=[next[b],next[a]]
      return next
    })
  }
  const toggle=(id:number)=>{
    if(!current)return
    patch(current.id,{products:current.products.includes(id)?current.products.filter(p=>p!==id):[...current.products,id]})
  }
  const moveProduct=(id:number,delta:number)=>{
    if(!current)return
    const next=[...current.products],i=next.indexOf(id),j=i+delta
    if(i<0||j<0||j>=next.length)return
    ;[next[i],next[j]]=[next[j],next[i]]
    patch(current.id,{products:next})
  }
  const save=async()=>{
    if(!dirty||busy)return
    setBusy(true);setError('')
    try{
      const res=await fetch('/api/staff/bdp/catalog',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,categories})})
      const data=await res.json()
      if(!res.ok)throw Error(data.error??'No se pudo guardar')
      setRevision(data.revision);setDirty(false);toast.success('Catálogo guardado')
    }catch(e){setError(e instanceof Error?e.message:'No se pudo guardar')}
    finally{setBusy(false)}
  }
  const term=normalize(search.trim())
  const candidates=products.filter(p=>(!onlyUnassigned||unassigned.has(p.id))&&(!term||normalize(p.display_name??p.nombre).includes(term)||normalize(p.nombre).includes(term)||String(p.id)===term))
  const roots=categories.filter(c=>c.parentId===null)
  const treeRow=(c:MobileCategoryDisplay)=>{
    const siblings=categories.filter(x=>x.parentId===c.parentId),index=siblings.findIndex(x=>x.id===c.id)
    return <div key={c.id} className={'flex min-w-0 items-center gap-1 rounded-lg border '+(selected===c.id?'border-sky-500 bg-sky-50':'border-slate-200 bg-white')}>
      <button type="button" onClick={()=>setSelected(c.id)} className="min-h-12 min-w-0 flex-1 px-2 text-left text-sm font-medium">{c.name} <span className="text-xs text-slate-500">({c.products.length})</span></button>
      <button type="button" disabled={busy||index===0} aria-label={'Subir '+c.name} onClick={()=>moveCategory(c.id,-1)} className="flex size-12 shrink-0 items-center justify-center disabled:opacity-25"><ChevronUp size={17}/></button>
      <button type="button" disabled={busy||index===siblings.length-1} aria-label={'Bajar '+c.name} onClick={()=>moveCategory(c.id,1)} className="flex size-12 shrink-0 items-center justify-center disabled:opacity-25"><ChevronDown size={17}/></button>
      <button type="button" disabled={busy} aria-label={c.hidden?'Mostrar '+c.name:'Ocultar '+c.name} onClick={()=>patch(c.id,{hidden:!c.hidden})} className="flex size-12 shrink-0 items-center justify-center">{c.hidden?<EyeOff size={17}/>:<Eye size={17}/>}</button>
    </div>
  }
  return <main className="fixed inset-0 z-[120] flex h-[100dvh] flex-col overflow-hidden bg-[var(--color-envolvente-bajo)] px-3 pt-[calc(env(safe-area-inset-top)+12px)] pb-[calc(env(safe-area-inset-bottom)+12px)]">
    <header className="flex shrink-0 items-center gap-2 text-white">
      <Link href="/master/dashboard" aria-label="Volver" onClick={e=>{if(dirty&&!window.confirm('¿Salir sin guardar los cambios?'))e.preventDefault()}} className="flex size-12 shrink-0 items-center justify-center"><ArrowLeft size={22}/></Link>
      <h1 className="min-w-0 flex-1 text-lg font-semibold">Catálogo BDP</h1>
      <Button variant="primary" instance="bdp-catalog-save" disabled={!dirty||!revision||busy} loading={busy} onClick={()=>void save()}>Guardar</Button>
    </header>
    {error&&<p role="alert" className="shrink-0 py-2 text-sm text-rose-200">{error}</p>}
    {!revision?<p className="py-6 text-center text-white/75">{error?'No se ha cargado el catálogo.':'Cargando catálogo…'}</p>:
    <div className="min-h-0 flex-1 overflow-y-auto rounded-xl bg-white p-3 text-slate-900 custom-scrollbar">
      <p className="mb-3 text-xs text-slate-600">{products.length} artículos BDP · {unassigned.size} sin clasificar</p>
      <div className="grid gap-4 lg:grid-cols-[minmax(260px,1fr)_minmax(0,2fr)]">
        <section className="min-w-0 space-y-2">
          <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Categorías</h2><Button variant="secondary" instance="bdp-catalog-add-root" onClick={()=>add(null)} disabled={busy}>Añadir categoría</Button></div>
          {roots.map(root=><div key={root.id} className="space-y-1">{treeRow(root)}{categories.filter(c=>c.parentId===root.id).map(c=><div key={c.id} className="pl-3">{treeRow(c)}</div>)}</div>)}
        </section>
        <section className="min-w-0 space-y-3">
          {!current?<p className="text-sm text-slate-500">Selecciona una categoría para editarla y asignar productos.</p>:<>
            <div className="flex items-center gap-2">
              {current.coverPhotoUrl&&<img src={current.coverPhotoUrl} alt="" className="size-12 shrink-0 object-contain"/>}
              <input aria-label="Nombre de categoría" value={current.name} maxLength={100} disabled={busy} onChange={e=>patch(current.id,{name:e.target.value})} className="h-12 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm font-semibold"/>
              <button type="button" disabled={busy} onClick={()=>remove(current.id)} aria-label="Eliminar categoría" className="flex size-12 shrink-0 items-center justify-center text-rose-700"><Trash2 size={18}/></button>
            </div>
            {current.parentId===null&&<Button variant="secondary" instance="bdp-catalog-add-child" disabled={busy} onClick={()=>add(current.id)}>Añadir subcategoría</Button>}
            <h3 className="text-sm font-semibold">Orden de productos ({current.products.length})</h3>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
              {current.products.map((id,i)=>{
                const p=byId.get(id)
                return <div key={id} className="flex min-h-12 items-center gap-1 border-b border-slate-100 px-1">
                  {p?.photo_url&&<img src={p.photo_url} alt="" className="size-8 shrink-0 object-contain"/>}
                  <span className="min-w-0 flex-1 text-xs font-medium">{p?.display_name??p?.nombre??'PLU '+id}</span>
                  <button type="button" aria-label="Subir producto" disabled={busy||i===0} onClick={()=>moveProduct(id,-1)} className="flex size-12 items-center justify-center disabled:opacity-25"><ChevronUp size={17}/></button>
                  <button type="button" aria-label="Bajar producto" disabled={busy||i===current.products.length-1} onClick={()=>moveProduct(id,1)} className="flex size-12 items-center justify-center disabled:opacity-25"><ChevronDown size={17}/></button>
                  <button type="button" aria-label="Quitar de esta categoría" disabled={busy} onClick={()=>toggle(id)} className="flex size-12 items-center justify-center text-rose-700"><Trash2 size={16}/></button>
                </div>
              })}
              {!current.products.length&&<p className="p-3 text-xs text-slate-500">Sin productos asignados.</p>}
            </div>
            <h3 className="text-sm font-semibold">Asignar productos</h3>
            <input type="search" placeholder="Buscar producto o PLU..." value={search} onChange={e=>setSearch(e.target.value)} className="h-12 w-full rounded-lg border border-slate-300 px-3 text-sm"/>
            <label className="flex min-h-12 items-center gap-2 text-sm"><input type="checkbox" checked={onlyUnassigned} onChange={e=>setOnlyUnassigned(e.target.checked)}/>Solo sin clasificar</label>
            <div className="max-h-[50dvh] overflow-y-auto rounded-lg border border-slate-200">
              {candidates.map(p=><label key={p.id} className="flex min-h-12 items-center gap-2 border-b border-slate-100 px-2 text-xs">
                <input type="checkbox" disabled={busy} checked={current.products.includes(p.id)} onChange={()=>toggle(p.id)}/>
                {p.photo_url&&<img src={p.photo_url} alt="" className="size-8 shrink-0 object-contain"/>}
                <span className="min-w-0 flex-1">{p.display_name??p.nombre}<span className="block text-[10px] text-slate-500">PLU {p.id}{Number(p.precio_base)<=0?' · Sin precio positivo':''}</span></span>
              </label>)}
            </div>
          </>}
        </section>
      </div>
    </div>}
  </main>
}
