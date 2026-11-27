'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  ZONE_LABELS, INDIVIDUAL_SLOT_COUNT, cloneFloorplan, initialFloorplanLayout, alignFloorplanToPhotos,
  fixedIndividualTable, validateFloorplanLayout, type FloorplanLayout,
  type FloorplanRecord, type FloorplanTable, type FloorplanZone,
} from '@/lib/staff/floorplan'
import { saveStaffFloorplanAction } from '@/app/staff/mesas/actions'

type Props = { record: FloorplanRecord; canEdit: boolean }

// El tamaño visual se calcula sobre el ancho de la fotografía, no sobre
// el área táctil (que también abarca las sillas). Conserva margen sobre el tablero.
function TableMarker({ number, zone }: { number: number | null; zone: FloorplanZone }) {
  const relativeDiameter = zone === 'interior' || zone === 'individuales' ? 8 : 4.5
  const diameter = `min(20px, ${relativeDiameter}cqw)`
  const digits = number === null ? 1 : String(number).length
  const fontRatio = digits >= 4 ? 0.34 : digits === 3 ? 0.43 : 0.58
  return (
    <span aria-hidden="true" className="pointer-events-none box-border flex shrink-0 items-center justify-center rounded-full tabular-nums leading-none" style={{
      width: diameter, height: diameter, border: '1px solid #FFFFFF',
      backgroundColor: '#2563EB', color: '#FFFFFF', fontWeight: 600,
      fontSize: `min(${20 * fontRatio}px, ${relativeDiameter * fontRatio}cqw)`,
    }}>{number ?? ''}</span>
  )
}

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
    <section aria-label={ZONE_LABELS[zone]} className="relative w-full min-h-0 min-w-0 overflow-hidden rounded-[14px] bg-[#85888a]" style={{aspectRatio: ZONE_ASPECT[zone], containerType: 'inline-size'}}>
      <div className="relative h-full w-full overflow-hidden">
        <img src={ZONE_IMAGES[zone]} alt="" aria-hidden="true" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"/>
        {editing && zone === 'individuales' && Array.from({length: INDIVIDUAL_SLOT_COUNT}, (_, slot) => {
          const t = fixedIndividualTable(slot, null)
          if (tables.some(item => item.id === t.id)) return null
          return <button key={t.id} type="button" aria-label="Añadir número a esta posición" onClick={() => onEmptySlot?.(slot)} className="absolute z-10 rounded-lg focus-visible:outline-2 focus-visible:outline-white" style={{left:t.x+'%',top:t.y+'%',width:t.width+'%',height:t.height+'%'}}><span className="flex h-full w-full items-center justify-center"><TableMarker number={null} zone={zone}/></span></button>
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
              {(editing || table.number !== null) && <TableMarker number={table.number} zone={zone}/>}
            </button>
          )
        })}
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
  }

  const setNumber = () => {
    if (!selected) return
    const value = numberInput.trim()
    if (!value) {
      clearNumber()
      return
    }
    const num = Number(value)
    if (!Number.isSafeInteger(num) || num < 1 || num > 9999) {toast.error('Introduce un número entre 1 y 9999.');return}
    if (layout.tables.some(t=>t.id!==selected.id&&t.number===num)) {
      toast.error('El número de mesa ya existe en el plano.')
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
    toast.info('Asigna un número a la nueva mesa antes de guardar.')
  }

  const clearNumber = () => {
    if (!selected) return
    // Las posiciones fotografiadas se conservan. Una plaza individual vuelve a estar disponible.
    setLayout(prev=>({...prev,tables:selected.zone==='individuales'
      ? prev.tables.filter(t=>t.id!==selected.id)
      : prev.tables.map(t=>t.id===selected.id?{...t,number:null}:t)}))
    setSelectedId(null)
    setNumberInput('')
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
              {firstSetup && (
                <button type="button" disabled={busy} onClick={()=>void save(false)}
                  className="h-9 rounded-lg bg-white/15 px-2 text-xs font-bold text-white shadow-md disabled:opacity-50">Borrador</button>
              )}
              {!firstSetup && (
                <button type="button" onClick={()=>{
                  setLayout(cloneFloorplan(published!));setEditing(false);setSelectedId(null)
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

      {editing && selected && (
        <div className="absolute right-2 top-[calc(env(safe-area-inset-top)+56px)] z-50
          w-[min(325px,calc(100vw-16px))] rounded-xl border border-white/80 bg-white/95 p-3
          shadow-[0_8px_30px_rgba(0,0,0,.32)] backdrop-blur-sm">
          <div className="mb-2 flex items-center justify-between text-xs font-bold">
            {(selected.number === null ? 'Asignar número' : 'Editar mesa ' + selected.number) + ' · ' + ZONE_LABELS[selected.zone]}
            <button type="button" aria-label="Cerrar" onClick={()=>{setSelectedId(null)}}>
              <X size={17}/>
            </button>
          </div>
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
                {selected.number !== null && (
                  <button type="button" aria-label="Quitar número de mesa" title="Quitar número" onClick={clearNumber}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-700">
                    <Trash2 size={18}/>
                  </button>
                )}
              </div>
              {firstSetup && <p className="mt-2 text-[11px] text-slate-500">
                Puedes guardar el borrador sin terminar, pero no publicar con mesas sin número.
              </p>}
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
