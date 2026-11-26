'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, Pencil, Plus, Save, Settings2, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  FLOORPLAN_ZONES, ZONE_LABELS, cloneFloorplan, initialFloorplanLayout,
  fixedIndividualTable, validateFloorplanLayout, type FloorplanLayout,
  type FloorplanRecord, type FloorplanTable, type FloorplanZone,
} from '@/lib/staff/floorplan'
import { saveStaffFloorplanAction } from '@/app/staff/mesas/actions'

type Props = { record: FloorplanRecord; canEdit: boolean }

type PhotoCrop = {
  src: string
  sourceWidth: number
  sourceHeight: number
  x: number
  y: number
  width: number
  height: number
}

/**
 * Los dos originales se conservan en JPEG a su resolución nativa
 * (1536 × 778 y 1254 × 1254). Los recortes son virtuales:
 * el navegador no distorsiona ni recomprime las mesas.
 */
const PHOTO_CROPS: Record<FloorplanZone, PhotoCrop> = {
  alargadas: {
    src: '/images/mesas/terraza-original-1536.jpeg',
    sourceWidth: 1536, sourceHeight: 778,
    x: 0, y: 0, width: 550, height: 450,
  },
  terraza: {
    src: '/images/mesas/terraza-original-1536.jpeg',
    sourceWidth: 1536, sourceHeight: 778,
    x: 542, y: 0, width: 994, height: 778,
  },
  interior: {
    src: '/images/mesas/interior-original-1254.jpeg',
    sourceWidth: 1254, sourceHeight: 1254,
    x: 0, y: 0, width: 1254, height: 1254,
  },
  individuales: {
    src: '/images/mesas/interior-original-1254.jpeg',
    sourceWidth: 1254, sourceHeight: 1254,
    x: 540, y: 355, width: 280, height: 340,
  },
}

function ZonePhoto({
  zone, layout, editing, selectedId, onSelect,
}: {
  zone: FloorplanZone
  layout: FloorplanLayout
  editing: boolean
  selectedId: string | null
  onSelect: (table: FloorplanTable) => void
}) {
  const tables = layout.tables.filter((t) => t.zone === zone)
  const photo = PHOTO_CROPS[zone]
  const responsiveWidthDvh = (100 / 3 * photo.width / photo.height).toFixed(5)
  return (
    <section
      aria-label={ZONE_LABELS[zone]}
      className="relative flex h-full w-full min-h-0 min-w-0 items-center justify-center overflow-hidden bg-[#a8abad]"
    >
      <div
        className="relative max-h-full shrink-0 overflow-hidden"
        style={{
          aspectRatio: `${photo.width} / ${photo.height}`,
          width: `min(100%, ${responsiveWidthDvh}dvh)`,
        }}
      >
        <img
          src={photo.src}
          alt=""
          aria-hidden="true"
          draggable={false}
          decoding="async"
          className="pointer-events-none absolute block max-w-none select-none"
          style={{
            width: `${photo.sourceWidth / photo.width * 100}%`,
            height: `${photo.sourceHeight / photo.height * 100}%`,
            left: `-${photo.x / photo.width * 100}%`,
            top: `-${photo.y / photo.height * 100}%`,
          }}
        />
        {tables.map((table) => {
          const active = table.id === selectedId
          return (
            <button
              key={table.id}
              type="button"
              aria-label={table.number === null ? 'Mesa pendiente de numerar' : 'Mesa ' + table.number}
              title={table.number === null ? 'Asignar número' : 'Mesa ' + table.number}
              onClick={() => onSelect(table)}
              className="absolute z-10 flex items-center justify-center rounded-md outline-offset-2 focus-visible:outline-2 focus-visible:outline-sky-700"
              style={{
                left: table.x + '%', top: table.y + '%',
                width: table.width + '%', height: table.height + '%',
              }}
            >
              <span className={'pointer-events-none flex min-h-[21px] min-w-[23px] items-center justify-center rounded-[5px] border px-1 text-center text-[clamp(11px,1.5vw,18px)] font-extrabold leading-5 shadow-[0_1px_5px_rgba(0,0,0,.42)] ' +
                (active && editing
                  ? 'border-white bg-[#1e729b] text-white ring-2 ring-[#1e729b]'
                  : table.number === null
                    ? 'border-slate-300 bg-white/85 text-slate-500'
                    : 'border-white/80 bg-white/95 text-slate-950')}>
                {table.number ?? (editing ? '·' : '—')}
              </span>
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
    cloneFloorplan(record.draft ?? record.published ?? initialFloorplanLayout()))
  const [published, setPublished] = useState<FloorplanLayout|null>(record.published)
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

  const addIndividual = () => {
    const used = new Set(layout.tables.filter(t=>t.zone==='individuales').map(t=>t.id))
    const slot = Array.from({length:12},(_,i)=>i).find(i=>!used.has('individual-'+i))
    if (slot === undefined) {toast.error('No quedan posiciones individuales disponibles.');return}
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
    <main className="fixed inset-0 z-[120] isolate h-[100dvh] w-full overflow-hidden bg-[#a7a9a8]">
      <div className="absolute inset-0 grid h-full w-full grid-rows-3 gap-0">
        <ZonePhoto zone="alargadas" layout={displayed} editing={editing} selectedId={selectedId} onSelect={choose}/>
        <ZonePhoto zone="terraza" layout={displayed} editing={editing} selectedId={selectedId} onSelect={choose}/>
        <div className="grid min-h-0 grid-cols-2 gap-0">
          <ZonePhoto zone="interior" layout={displayed} editing={editing} selectedId={selectedId} onSelect={choose}/>
          <ZonePhoto zone="individuales" layout={displayed} editing={editing} selectedId={selectedId} onSelect={choose}/>
        </div>
      </div>

      <div className="absolute left-2 top-[max(8px,env(safe-area-inset-top))] z-40 flex items-center gap-1.5">
        <Link href="/master/dashboard" aria-label="Volver a Master"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/70 bg-white/95 text-slate-800 shadow-md">
          <ArrowLeft size={18}/>
        </Link>
        <span className="rounded-lg border border-white/70 bg-white/95 px-2 py-2 text-xs font-bold shadow-md">
          Mesas{editing ? ' · Numerar' : ''}
        </span>
      </div>

      {canEdit && (
        <div className="absolute right-2 top-[max(8px,env(safe-area-inset-top))] z-40 flex items-center gap-1.5">
          {editing ? (
            <>
              <button type="button" onClick={addIndividual} aria-label="Añadir mesa individual"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/70 bg-white/95 shadow-md">
                <Plus size={19}/>
              </button>
              <button type="button" onClick={()=>{setSettings(!settings);setSelectedId(null)}} aria-label="Configurar salones BDP"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/70 bg-white/95 shadow-md">
                <Settings2 size={19}/>
              </button>
              {firstSetup && (
                <button type="button" disabled={busy} onClick={()=>void save(false)}
                  className="h-9 rounded-lg border border-white/70 bg-white/95 px-2 text-xs font-bold shadow-md disabled:opacity-50">Borrador</button>
              )}
              {!firstSetup && (
                <button type="button" onClick={()=>{
                  setLayout(cloneFloorplan(published!));setEditing(false);setSelectedId(null);setSettings(false)
                }} aria-label="Cancelar edición"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/70 bg-white/95 shadow-md">
                  <X size={19}/>
                </button>
              )}
              <button type="button" disabled={busy} onClick={()=>void save(true)}
                className="flex h-9 items-center gap-1 rounded-lg bg-[#1d6688] px-3 text-xs font-bold text-white shadow-lg disabled:opacity-50">
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

      {editing && (selected || settings) && (
        <div className="absolute right-2 top-[calc(max(8px,env(safe-area-inset-top))+44px)] z-50
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
                  className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#1d6688] text-white">
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

      {editing && missing>0 && (
        <div className="pointer-events-none absolute bottom-[max(6px,env(safe-area-inset-bottom))] left-1/2 z-30 -translate-x-1/2 rounded-lg bg-slate-900/80 px-3 py-1.5 text-[11px] font-semibold text-white">
          {missing} mesas por numerar
        </div>
      )}
    </main>
  )
}
