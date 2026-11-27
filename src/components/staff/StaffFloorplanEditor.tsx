'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, Pencil, Plus, Save, Settings2, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  FLOORPLAN_ZONES, ZONE_LABELS, INDIVIDUAL_SLOT_COUNT, cloneFloorplan, initialFloorplanLayout, alignFloorplanToPhotos,
  fixedIndividualTable, validateFloorplanLayout, type FloorplanLayout,
  type FloorplanRecord, type FloorplanTable, type FloorplanZone,
} from '@/lib/staff/floorplan'
import { saveStaffFloorplanAction } from '@/app/staff/mesas/actions'

type Props = { record: FloorplanRecord; canEdit: boolean }

const ZONE_IMAGES: Record<FloorplanZone, string> = {
  alargadas: '/images/mesas/original-final-alargadas-v3.jpeg',
  terraza: '/images/mesas/original-final-terraza-v2.jpeg',
  interior: '/images/mesas/original-final-interior.jpeg',
  individuales: '/images/mesas/original-final-individuales-v2.jpeg',
}

// Keep the artwork and interactive coordinates in the same intrinsic frame.
const ZONE_ASPECT: Record<FloorplanZone, string> = {
  alargadas: '1536 / 762',
  terraza: '1536 / 780',
  interior: '1104 / 1104',
  individuales: '1254 / 1254',
}

function ZonePhoto({
  zone, layout, editing, selectedId, onSelect, onEmptySlot,
}: {
  zone: FloorplanZone
  layout: FloorplanLayout
  editing: boolean
  selectedId: string | null
  onSelect: (table: FloorplanTable) => void
  onEmptySlot?: (slot: number) => void
}) {
  const tables = layout.tables.filter((t) => t.zone === zone)
  return (
    <section aria-label={ZONE_LABELS[zone]} className="relative w-full min-h-0 min-w-0 overflow-hidden rounded-[14px] bg-[#85888a]" style={{aspectRatio: ZONE_ASPECT[zone]}}>
      <div className="relative h-full w-full overflow-hidden">
        <img src={ZONE_IMAGES[zone]} alt="" aria-hidden="true" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"/>
        {editing && zone === 'individuales' && Array.from({length: INDIVIDUAL_SLOT_COUNT}, (_, slot) => {
          const t = fixedIndividualTable(slot, null)
          if (tables.some(item => item.id === t.id)) return null
          return <button key={t.id} type="button" aria-label="Añadir número a esta posición" onClick={() => onEmptySlot?.(slot)} className="absolute z-10 rounded-lg focus-visible:outline-2 focus-visible:outline-white" style={{left:t.x+'%',top:t.y+'%',width:t.width+'%',height:t.height+'%'}} />
        })}
        {tables.map((table) => {
          return (
            <button
              key={table.id}
              type="button"
              aria-label={table.number === null ? 'Mesa pendiente de numerar' : 'Mesa ' + table.number}
              title={table.number === null ? 'Asignar número' : 'Mesa ' + table.number}
              onClick={() => onSelect(table)}
              aria-pressed={editing && table.id === selectedId}
              className="absolute z-10 flex items-center justify-center rounded-md outline-offset-2 focus-visible:outline-2 focus-visible:outline-sky-700"
              style={{
                left: table.x + '%', top: table.y + '%',
                width: table.width + '%', height: table.height + '%',
              }}
            >
              {table.number !== null && (
                <span className={'pointer-events-none flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white bg-[#064b96] text-center font-extrabold text-white shadow-[0_2px_6px_rgba(0,0,0,.38)] ' +
                  (table.number >= 1000 ? 'text-[9px]' : table.number >= 100 ? 'text-[10px]' : 'text-xs')}>
                  {table.number}
                </span>
              )}
            </button>
          )
        })}
        {editing && (
          <span className="pointer-events-none absolute bottom-1 left-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {ZONE_LABELS[zone]}
          </span>
        )}
      </div>
    </section>
  )
}

export function StaffFloorplanEditor({ record, canEdit }: Props) {
  const [layout, setLayout] = useState<FloorplanLayout>(() =>
    alignFloorplanToPhotos(record.draft ?? record.published ?? initialFloorplanLayout()))
  const [published, setPublished] = useState<FloorplanLayout|null>(() => record.published ? alignFloorplanToPhotos(record.published) : null)
  const [revision, setRevision] = useState(record.revision)
  const [editing, setEditing] = useState(!record.published && canEdit)
  const [selectedId, setSelectedId] = useState<string|null>(null)
  const [numberInput, setNumberInput] = useState('')
  const [settings, setSettings] = useState(false)
  const [busy, setBusy] = useState(false)

  const firstSetup = !published
  const displayed = editing ? layout : (published ?? layout)
  const selected = layout.tables.find(t=>t.id === selectedId) ?? null
  const missing = layout.tables.filter(t=>t.number === null).length

  const choose = (table: FloorplanTable) => {
    if (!editing) {
      if (table.number !== null) toast.info('Mesa ' + table.number + ': comandas todavía no habilitadas.')
      return
    }
    setSelectedId(table.id)
    setNumberInput(table.number === null ? '' : String(table.number))
    setSettings(false)
  }

  const setNumber = () => {
    if (!selected) return
    const value = numberInput.trim()
    if (!value) {
      if (!firstSetup) {toast.error('Todas las mesas deben tener número.');return}
      setLayout(prev=>({...prev,tables:prev.tables.map(t=>t.id===selected.id?{...t,number:null}:t)}))
      setSelectedId(null)
      return
    }
    const num = Number(value)
    if (!Number.isSafeInteger(num) || num < 1 || num > 9999) {toast.error('Introduce un número entre 1 y 9999.');return}
    const salon = layout.salons[selected.zone]
    if (layout.tables.some(t=>t.id!==selected.id&&t.number===num&&layout.salons[t.zone]===salon)) {
      toast.error('El número ya existe en el mismo salón BDP.')
      return
    }
    setLayout(prev=>({...prev,tables:prev.tables.map(t=>t.id===selected.id?{...t,number:num}:t)}))
    setSelectedId(null)
  }

  const addIndividual = (requestedSlot?: number) => {
    const used = new Set(layout.tables.filter(t=>t.zone==='individuales').map(t=>t.id))
    const slot = requestedSlot ?? Array.from({length:INDIVIDUAL_SLOT_COUNT},(_,i)=>i).find(i=>!used.has('individual-'+i))
    if (slot === undefined || slot < 0 || slot >= INDIVIDUAL_SLOT_COUNT || used.has('individual-'+slot)) {toast.error('No quedan posiciones individuales disponibles.');return}
    const newTable = fixedIndividualTable(slot,null)
    setLayout(prev=>({...prev,tables:[...prev.tables,newTable]}))
    setSelectedId(newTable.id)
    setNumberInput('')
    setSettings(false)
    toast.info('Asigna un número a la nueva mesa antes de guardar.')
  }

  const removeIndividual = () => {
    if (!selected || selected.zone!=='individuales') return
    if (!window.confirm('¿Eliminar la mesa individual del plano? No modifica BDP.')) return
    setLayout(prev=>({...prev,tables:prev.tables.filter(t=>t.id!==selected.id)}))
    setSelectedId(null)
  }

  const save = async (publishNow:boolean) => {
    if (!canEdit) return
    const invalid=validateFloorplanLayout(layout,publishNow||!!published)
    if(invalid.length){toast.error(invalid[0]);return}
    setBusy(true)
    try {
      const result=await saveStaffFloorplanAction(layout,revision,publishNow)
      if(!result.ok){toast.error(result.error);return}
      setRevision(result.revision)
      if(publishNow){
        setPublished(cloneFloorplan(layout))
        setEditing(false)
        setSelectedId(null)
        setSettings(false)
        toast.success('Numeración publicada.')
      }else toast.success('Borrador guardado.')
    }catch{toast.error('Error al guardar el plano.')}
    finally{setBusy(false)}
  }

  // Rehidrata campos únicamente cuando se abre una mesa concreta.
  useEffect(()=>{
    if(!selected) setNumberInput('')
  },[selectedId,selected])

  return (
    <main className="fixed inset-0 z-[120] isolate flex h-[100dvh] w-full flex-col overflow-hidden bg-[radial-gradient(ellipse_at_top,#153c65_0%,#06264c_45%,#031a39_100%)] px-2.5 pt-[calc(env(safe-area-inset-top)+12px)] pb-[calc(env(safe-area-inset-bottom)+12px)]">
      <header className="relative z-40 flex w-full shrink-0 items-center justify-between gap-1">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <Link href="/master/dashboard" aria-label="Volver a Master"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white shadow-md">
          <ArrowLeft size={18}/>
        </Link>
        <span className="min-w-0 truncate rounded-lg px-1 py-2 text-xs font-semibold text-white" title={editing ? 'Mesas · Numeración' : 'Mesas'}>
          Mesas<span className="hidden sm:inline">{editing ? ' · Numeración' : ''}</span>
        </span>
      </div>

      {canEdit && (
        <div className="flex shrink-0 items-center gap-1.5">
          {editing ? (
            <>
              <button type="button" onClick={()=>addIndividual()} aria-label="Añadir mesa individual"
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-white shadow-md">
                <Plus size={19}/>
              </button>
              <button type="button" onClick={()=>{setSettings(!settings);setSelectedId(null)}} aria-label="Configurar salones BDP"
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-white shadow-md">
                <Settings2 size={19}/>
              </button>
              {firstSetup && (
                <button type="button" disabled={busy} onClick={()=>void save(false)}
                  className="h-9 rounded-lg bg-white/15 px-2 text-xs font-bold text-white shadow-md disabled:opacity-50">Borrador</button>
              )}
              {!firstSetup && (
                <button type="button" onClick={()=>{
                  setLayout(cloneFloorplan(published!));setEditing(false);setSelectedId(null);setSettings(false)
                }} aria-label="Cancelar edición"
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-white shadow-md">
                  <X size={19}/>
                </button>
              )}
              <button type="button" disabled={busy} onClick={()=>void save(true)}
                className="flex h-9 items-center gap-1 rounded-lg bg-[#0755f5] px-3 text-xs font-bold text-white shadow-lg disabled:opacity-50">
                <Save size={15}/>{firstSetup?'Publicar':'Guardar'}
              </button>
            </>
          ): (
            <button type="button" onClick={()=>setEditing(true)}
              className="flex h-9 items-center gap-1 rounded-lg border border-white/70 bg-white/95 px-3 text-xs font-bold shadow-md">
              <Pencil size={16}/>Editar números
            </button>
          )}
        </div>
      )}

      </header>

      {/* The available area excludes the toolbar, status and both safe-area margins.
          Width is bounded by the intrinsic artwork height, so no zone gets cropped. */}
      <div className="flex min-h-0 flex-1 items-center justify-center py-3">
        <div className="flex h-full w-full items-center justify-center" style={{containerType: 'size'}}>
          <div className="flex shrink-0 flex-col gap-4" style={{width: 'min(100cqw, calc((100cqh - 32px) * 0.66))'}}>
            <ZonePhoto zone="alargadas" layout={displayed} editing={editing} selectedId={selectedId} onSelect={choose}/>
            <ZonePhoto zone="terraza" layout={displayed} editing={editing} selectedId={selectedId} onSelect={choose}/>
            <div className="grid min-h-0 grid-cols-2 items-center gap-2">
              <ZonePhoto zone="interior" layout={displayed} editing={editing} selectedId={selectedId} onSelect={choose}/>
              <ZonePhoto zone="individuales" layout={displayed} editing={editing} selectedId={selectedId} onSelect={choose} onEmptySlot={addIndividual}/>
            </div>
          </div>
        </div>
      </div>

      {editing && (selected || settings) && (
        <div className="absolute right-2 top-[calc(env(safe-area-inset-top)+56px)] z-50
          w-[min(325px,calc(100vw-16px))] rounded-xl border border-white/80 bg-white/95 p-3
          shadow-[0_8px_30px_rgba(0,0,0,.32)] backdrop-blur-sm">
          <div className="mb-2 flex items-center justify-between text-xs font-bold">
            {settings ? 'Salones BDP' : 'Número de mesa · ' + ZONE_LABELS[selected!.zone]}
            <button type="button" aria-label="Cerrar" onClick={()=>{setSelectedId(null);setSettings(false)}}>
              <X size={17}/>
            </button>
          </div>
          {settings ? (
            <div className="grid grid-cols-2 gap-2">
              {FLOORPLAN_ZONES.map(zone=>(
                <label key={zone} className="text-[11px] text-slate-600">
                  {ZONE_LABELS[zone]}
                  <input type="number" min={1} max={99} inputMode="numeric" value={layout.salons[zone]??''}
                    onChange={(e)=>{
                      const value=e.target.value.trim()===''?null:Number(e.target.value)
                      if(value!==null&&(!Number.isSafeInteger(value)||value<1||value>99))return
                      setLayout(prev=>({...prev,salons:{...prev.salons,[zone]:value}}))
                    }}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"/>
                </label>
              ))}
              <p className="col-span-2 text-[11px] text-slate-500">El número del salón debe corresponder al de BDP.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <input type="number" min={1} max={9999} inputMode="numeric" autoFocus
                  aria-label="Número de mesa" value={numberInput}
                  onChange={e=>setNumberInput(e.target.value)}
                  onKeyDown={e=>{if(e.key==='Enter')setNumber()}}
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-lg font-bold"/>
                <button type="button" onClick={setNumber} aria-label="Confirmar número"
                  className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#0755f5] text-white">
                  <Check size={20}/>
                </button>
                {selected?.zone==='individuales' && (
                  <button type="button" aria-label="Eliminar mesa individual" onClick={removeIndividual}
                    className="flex h-11 w-11 items-center justify-center rounded-lg bg-red-50 text-red-700">
                    <Trash2 size={18}/>
                  </button>
                )}
              </div>
              {firstSetup && <p className="mt-2 text-[11px] text-slate-500">
                Puedes guardar el borrador sin terminar, pero no publicar con mesas sin número.
              </p>}
            </>
          )}
        </div>
      )}

      <footer className="flex h-7 shrink-0 items-center justify-center">
        {editing && missing>0 && (
          <span className="rounded-lg bg-slate-900/80 px-3 py-1.5 text-[11px] font-semibold text-white">
            {missing} mesas por numerar
          </span>
        )}
      </footer>
    </main>
  )
}
