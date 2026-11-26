'use client'

import { useEffect, useRef, useState, type PointerEvent } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Check, ChevronDown, Expand, Grip, Minus, Pencil, Plus,
  RotateCw, Save, Shrink, Trash2, X,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  FLOORPLAN_ZONES, ZONE_LABELS, cloneFloorplan, initialFloorplanLayout,
  nextAvailableNumber, validateFloorplanLayout,
  type FloorplanLayout, type FloorplanRecord, type FloorplanShape,
  type FloorplanTable, type FloorplanZone,
} from '@/lib/staff/floorplan'
import { saveStaffFloorplanAction } from '@/app/staff/mesas/actions'
import { FloorplanScene } from '@/components/staff/FloorplanScene'

type Props = {
  record: FloorplanRecord
  canEdit: boolean
}

const SHAPES: Array<{ id: FloorplanShape; name: string }> = [
  { id: 'cuadrada', name: 'Individual' },
  { id: 'alargada', name: 'Alargada' },
  { id: 'doble', name: 'Doble' },
]

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
const furnitureLabel = (table: FloorplanTable) => (
  table.number === null ? 'Sin número' : 'Mesa ' + table.number
)

function TableFurniture({ table, editing, selected, onPointerDown, onPointerMove, onPointerUp, onClick }: {
  table: FloorplanTable
  editing: boolean
  selected: boolean
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void
  onClick: () => void
}) {
  const indoor = table.zone === 'interior' || table.zone === 'individuales'
  const elongated = table.zone === 'alargadas' || table.shape === 'alargada'
  const double = table.shape === 'doble'
  const sideways = table.rotation === 90 || table.rotation === 270
  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={(event)=>{event.stopPropagation();onClick()}}
      aria-label={furnitureLabel(table)}
      title={furnitureLabel(table)}
      className={'absolute z-10 flex items-center justify-center overflow-visible transition-[filter] ' +
        (selected && editing ? 'z-30 drop-shadow-[0_0_6px_rgba(0,108,197,.85)]' : '') +
        (editing ? ' cursor-grab active:cursor-grabbing' : ' cursor-pointer')}
      style={{
        left: table.x + '%', top: table.y + '%',
        width: table.width + '%', height: table.height + '%',
        touchAction: editing ? 'none' : 'manipulation',
      }}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        aria-hidden="true">
        <defs>
          <linearGradient id={'surface-' + table.id} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor={indoor ? '#ffffff' : '#ead0ad'}/>
            <stop offset=".55" stopColor={indoor ? '#e3e6e8' : '#d9b790'}/>
            <stop offset="1" stopColor={indoor ? '#bfc5c8' : '#c69f74'}/>
          </linearGradient>
        </defs>
        {elongated ? <>
          <rect x="3" y="9" width="11" height="82" rx="3" fill="#c6a078"/>
          <rect x="86" y="9" width="11" height="82" rx="3" fill="#c6a078"/>
          <rect x="18" y="5" width="64" height="90" rx="2" fill={'url(#surface-' + table.id + ')'} stroke="#b18b68" strokeWidth="2"/>
          <path d="M18 50H82M50 5V95" stroke="#c49d70" strokeWidth="1.1" opacity=".7"/>
        </> : indoor ? <>
          {[18,60].map((x,i) => <g key={i}>
            <rect x={x} y="0" width="24" height="16" rx="4" fill="#b52e30" stroke="#e4827a" strokeWidth="2.5"/>
            <rect x={x} y="84" width="24" height="16" rx="4" fill="#b52e30" stroke="#e4827a" strokeWidth="2.5"/>
          </g>)}
          {double ? <>
            <rect x="12" y="17" width="39" height="65" rx="4" fill={'url(#surface-' + table.id + ')'} stroke="#858e91" strokeWidth="2.5"/>
            <rect x="51" y="17" width="39" height="65" rx="4" fill={'url(#surface-' + table.id + ')'} stroke="#858e91" strokeWidth="2.5"/>
          </> : <rect x="16" y="17" width="68" height="65" rx="3" fill={'url(#surface-' + table.id + ')'} stroke="#858e91" strokeWidth="2.5"/>}
        </> : <>
          {(sideways ? [20,64] : [16,62]).map((pos, index) =>
            <g key={index}>
              <rect x="0" y={pos} width="13" height="23" rx="5" fill="#f3f3ef" stroke="#b7bec1" strokeWidth="2"/>
              <rect x="87" y={pos} width="13" height="23" rx="5" fill="#f3f3ef" stroke="#b7bec1" strokeWidth="2"/>
            </g>)}
          {double ? <>
            <rect x="20" y="6" width="60" height="44" rx="2" fill={'url(#surface-' + table.id + ')'} stroke="#c99f71" strokeWidth="1.6"/>
            <rect x="20" y="50" width="60" height="44" rx="2" fill={'url(#surface-' + table.id + ')'} stroke="#c99f71" strokeWidth="1.6"/>
          </> : <rect x="19" y="15" width="62" height="70" rx="2" fill={'url(#surface-' + table.id + ')'} stroke="#c99f71" strokeWidth="1.6"/>}
        </>}
      </svg>
      <span className={'pointer-events-none relative z-10 rounded-[4px] border border-slate-600/20 px-1 text-center text-[clamp(10px,1.5vw,16px)] font-black leading-5 shadow-sm ' +
        (selected && editing ? 'bg-[#136b96] text-white' : 'bg-white/95 text-slate-900')}>
        {table.number ?? (editing ? '·' : '—')}
      </span>
    </button>
  )
}

function ZoneCanvas({ zone, layout, editing, selectedId, active, onActivate, onSelect, onMove }: {
  zone: FloorplanZone
  layout: FloorplanLayout
  editing: boolean
  selectedId: string | null
  active: boolean
  onActivate: (zone: FloorplanZone) => void
  onSelect: (id: string) => void
  onMove: (id: string, x: number, y: number) => void
}) {
  const drag = useRef<{ id: string; pointerId: number; startX: number; startY: number; originalX: number; originalY: number; bounds: DOMRect; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const tables = layout.tables.filter((item) => item.zone === zone)

  const handleDown = (event: PointerEvent<HTMLButtonElement>, item: FloorplanTable) => {
    if (!editing) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const rect = event.currentTarget.parentElement?.getBoundingClientRect()
    if (!rect) return
    drag.current = { id: item.id, pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY, originalX: item.x,
      originalY: item.y, bounds: rect, moved: false }
    onActivate(zone)
    onSelect(item.id)
  }
  const handleMove = (event: PointerEvent<HTMLButtonElement>, item: FloorplanTable) => {
    const state = drag.current
    if (!state || state.pointerId !== event.pointerId || state.id !== item.id) return
    const dx = event.clientX - state.startX, dy = event.clientY - state.startY
    if (Math.abs(dx) + Math.abs(dy) > 3) state.moved = true
    if (!state.moved) return
    onMove(item.id,
      clamp(Math.round((state.originalX + dx / state.bounds.width * 100) * 10) / 10, 0, 100 - item.width),
      clamp(Math.round((state.originalY + dy / state.bounds.height * 100) * 10) / 10, 0, 100 - item.height))
  }
  const handleUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag.current?.pointerId === event.pointerId) {
      suppressClick.current = drag.current.moved
      drag.current = null
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }
  return (
    <section aria-label={ZONE_LABELS[zone]}
      onClick={() => editing && onActivate(zone)}
      className="relative h-full w-full min-h-0 min-w-0 overflow-hidden bg-[#aeb4b5]">
      <FloorplanScene zone={zone}/>
      {editing && active && <div className="pointer-events-none absolute inset-0 z-20 border-2 border-[#2d739e]" />}
      <div className="pointer-events-none absolute bottom-1 left-2 z-30 rounded bg-slate-900/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
        {ZONE_LABELS[zone]}
      </div>
      <div className="absolute inset-0">
        {tables.map((item) => <TableFurniture
          key={item.id} table={item} editing={editing} selected={selectedId===item.id}
          onPointerDown={(e)=>handleDown(e,item)}
          onPointerMove={(e)=>handleMove(e,item)}
          onPointerUp={handleUp}
          onClick={()=>{
            if(suppressClick.current) { suppressClick.current=false; return }
            onActivate(zone)
            onSelect(item.id)
          }}
        />)}
      </div>
    </section>
  )
}

export function StaffFloorplanEditor({ record, canEdit }: Props) {
  const firstSetup = !record.published
  const [layout, setLayout] = useState<FloorplanLayout>(() =>
    cloneFloorplan(record.draft ?? record.published ?? initialFloorplanLayout()))
  const [revision, setRevision] = useState(record.revision)
  const [published, setPublished] = useState<FloorplanLayout | null>(record.published)
  const [editing, setEditing] = useState(firstSetup && canEdit)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedZone, setSelectedZone] = useState<FloorplanZone>('terraza')
  const [focusZone, setFocusZone] = useState<FloorplanZone | null>(null)
  const [adding, setAdding] = useState(false)
  const [newShape, setNewShape] = useState<FloorplanShape>('cuadrada')
  const [newNumber, setNewNumber] = useState('')
  const [editNumber, setEditNumber] = useState('')
  const [busy, setBusy] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const selected = layout.tables.find((t) => t.id === selectedId) ?? null
  const displayed = editing ? layout : published
  const needsFirstPublish = published === null

  useEffect(() => { setEditNumber(selected?.number === null || !selected ? '' : String(selected.number)) }, [selected?.id, selected?.number])

  const updateTable = (id: string, patch: Partial<FloorplanTable>) => {
    setLayout((old) => ({
      ...old,
      tables: old.tables.map((item) => {
        if (item.id !== id) return item
        const next = { ...item, ...patch }
        return {
          ...next,
          x: clamp(next.x, 0, 100 - next.width),
          y: clamp(next.y, 0, 100 - next.height),
        }
      }),
    }))
  }

  const insertTable = () => {
    const num = newNumber.trim() === '' ? null : Number(newNumber)
    if ((!needsFirstPublish && num === null) || (num !== null && (!Number.isSafeInteger(num) || num < 1 || num > 9999))) {
      toast.error('Asigna un número de mesa válido.')
      return
    }
    const salon = layout.salons[selectedZone]
    if (num !== null && layout.tables.some((t) => t.number === num && layout.salons[t.zone] === salon)) {
      toast.error('Ese número ya está asignado en el mismo salón.')
      return
    }
    const count = layout.tables.filter((t) => t.zone === selectedZone).length
    const w = newShape === 'doble' ? 16 : newShape === 'alargada' ? 10 : 12
    const h = newShape === 'doble' ? 24 : newShape === 'alargada' ? 24 : 18
    const next: FloorplanTable = {
      id: 't-' + crypto.randomUUID().replaceAll('-', ''),
      number: num, zone: selectedZone, shape: newShape,
      x: clamp(8 + (count % 4) * 20, 0, 100 - w),
      y: clamp(16 + Math.floor(count / 4) * 24, 0, 100 - h),
      width: w, height: h, rotation: 0,
    }
    setLayout((old) => ({ ...old, tables: [...old.tables, next] }))
    setSelectedId(next.id)
    setAdding(false)
    setNewNumber('')
  }

  const save = async (publishNow: boolean) => {
    const mustBeComplete = publishNow || !!published
    const errors = validateFloorplanLayout(layout, mustBeComplete)
    if (errors.length) { toast.error(errors[0]); return }
    setBusy(true)
    try {
      const result = await saveStaffFloorplanAction(layout, revision, publishNow)
      if (!result.ok) { toast.error(result.error); return }
      setRevision(result.revision)
      if (publishNow) {
        setPublished(cloneFloorplan(layout))
        setEditing(false)
        setSelectedId(null)
        setAdding(false)
        setShowSettings(false)
        toast.success('Plano guardado y publicado.')
      } else {
        toast.success('Borrador guardado. Falta completar la numeración.')
      }
    } catch {
      toast.error('No se pudo conectar para guardar el plano.')
    } finally {
      setBusy(false)
    }
  }

  const selectTable = (id: string) => {
    if (editing) { setSelectedId(id); setAdding(false) }
    else {
      const item = displayed?.tables.find((t) => t.id === id)
      if (item?.number !== null && item?.number !== undefined) {
        toast.info('Mesa ' + item.number + ': el envío de comandas se habilitará al conectar el ejecutor BDP.')
      }
    }
  }

  return (
    <div data-component="MarbellaFloorplan" className="fixed inset-0 z-[120] isolate overflow-hidden bg-[#9ea6a9] text-slate-900">
      <div className="absolute inset-0 grid min-h-0 w-full grid-rows-3 gap-0">
        <div className="min-h-0 border-b border-[#34383b]">
          <ZoneCanvas zone="alargadas" layout={displayed ?? layout} editing={editing}
            selectedId={selectedId} active={selectedZone==='alargadas'}
            onActivate={(z)=>{setSelectedZone(z);setSelectedId(null)}}
            onSelect={selectTable} onMove={(id,x,y)=>updateTable(id,{x,y})}/>
        </div>
        <div className="min-h-0 border-b border-[#34383b]">
          <ZoneCanvas zone="terraza" layout={displayed ?? layout} editing={editing}
            selectedId={selectedId} active={selectedZone==='terraza'}
            onActivate={(z)=>{setSelectedZone(z);setSelectedId(null)}}
            onSelect={selectTable} onMove={(id,x,y)=>updateTable(id,{x,y})}/>
        </div>
        <div className="grid min-h-0 grid-cols-2 gap-0">
          <div className="min-h-0 min-w-0 border-r border-[#34383b]">
            <ZoneCanvas zone="interior" layout={displayed ?? layout} editing={editing}
              selectedId={selectedId} active={selectedZone==='interior'}
              onActivate={(z)=>{setSelectedZone(z);setSelectedId(null)}}
              onSelect={selectTable} onMove={(id,x,y)=>updateTable(id,{x,y})}/>
          </div>
          <div className="min-h-0 min-w-0">
            <ZoneCanvas zone="individuales" layout={displayed ?? layout} editing={editing}
              selectedId={selectedId} active={selectedZone==='individuales'}
              onActivate={(z)=>{setSelectedZone(z);setSelectedId(null)}}
              onSelect={selectTable} onMove={(id,x,y)=>updateTable(id,{x,y})}/>
          </div>
        </div>
      </div>

      {!editing && !published && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/65 p-5 text-center text-sm font-medium text-white">
          El plano aún no está publicado. Falta completar la numeración.
        </div>
      )}

      <div className="absolute left-2 top-[max(8px,env(safe-area-inset-top))] z-50 flex items-center gap-2">
        <Link href="/master/dashboard" aria-label="Volver a master"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/70 bg-white/95 text-slate-800 shadow">
          <ArrowLeft size={19}/>
        </Link>
        <span className="rounded-lg border border-white/60 bg-white/90 px-2.5 py-2 text-xs font-semibold shadow">
          Mesas{editing ? ' · Editar' : ''}
        </span>
      </div>

      {canEdit && (
        <div className="absolute right-2 top-[max(8px,env(safe-area-inset-top))] z-50 flex items-center gap-1.5">
          {editing ? (
            <>
              <button type="button" onClick={()=>{setAdding(!adding);setSelectedId(null);setShowSettings(false)}}
                title="Añadir mesa a la zona seleccionada" aria-label="Añadir mesa"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/70 bg-white/95 shadow">
                <Plus size={18}/>
              </button>
              <button type="button" onClick={()=>{setShowSettings(!showSettings);setAdding(false);setSelectedId(null)}}
                title="Salones BDP" aria-label="Configurar salones"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/70 bg-white/95 shadow">
                <Pencil size={17}/>
              </button>
              {needsFirstPublish && (
                <button type="button" disabled={busy} onClick={()=>void save(false)}
                  className="rounded-lg border border-white/70 bg-white/95 px-2.5 py-2.5 text-xs font-semibold shadow disabled:opacity-50">
                  Borrador
                </button>
              )}
              {!needsFirstPublish && (
                <button type="button" disabled={busy}
                  title="Descartar edición" aria-label="Descartar cambios"
                  onClick={()=>{setLayout(cloneFloorplan(published!));setEditing(false);setSelectedId(null);setAdding(false);setShowSettings(false)}}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/70 bg-white/95 shadow">
                  <X size={17}/>
                </button>
              )}
              <button type="button" disabled={busy} onClick={()=>void save(true)}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-[#1e6988] px-3 text-xs font-semibold text-white shadow-lg disabled:opacity-50">
                <Save size={15}/>{needsFirstPublish ? 'Publicar' : 'Guardar'}
              </button>
            </>
          ) : (
            <button type="button" onClick={()=>{setEditing(true);setSelectedId(null);setAdding(false)}}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-white/80 bg-white/95 px-3 text-xs font-semibold shadow">
              <Pencil size={16}/>Editar
            </button>
          )}
        </div>
      )}

      {editing && (adding || showSettings || selected) && (
        <div className="absolute right-2 top-[calc(max(8px,env(safe-area-inset-top))+44px)] z-[65] max-h-[min(65dvh,410px)] w-[min(340px,calc(100vw-16px))] overflow-y-auto rounded-xl border border-white/80 bg-white/95 p-3 shadow-[0_12px_44px_rgba(14,30,43,.30)] backdrop-blur">
          <div className="mb-2 flex items-center justify-between gap-2">
            <strong className="text-xs">
              {adding ? 'Nueva mesa · ' + ZONE_LABELS[selectedZone] :
                showSettings ? 'Salones BDP' :
                  selected ? 'Editar ' + furnitureLabel(selected) : ''}
            </strong>
            <button type="button" aria-label="Cerrar edición de mesa" className="rounded p-1 text-slate-500"
              onClick={()=>{setAdding(false);setShowSettings(false);setSelectedId(null)}}><X size={17}/></button>
          </div>

          {adding && (
            <div className="grid grid-cols-[1fr_100px] gap-2">
              <label className="text-[11px] text-slate-600">Forma
                <select value={newShape} onChange={(e)=>setNewShape(e.target.value as FloorplanShape)}
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-sm">
                  {SHAPES.map((sh)=><option key={sh.id} value={sh.id}>{sh.name}</option>)}
                </select>
              </label>
              <label className="text-[11px] text-slate-600">Número
                <input type="number" inputMode="numeric" min={1} max={9999}
                  value={newNumber} onChange={(e)=>setNewNumber(e.target.value)}
                  placeholder={needsFirstPublish ? 'Inicial' : 'Obligatorio'}
                  className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm"/>
              </label>
              <button type="button" onClick={insertTable}
                className="col-span-2 rounded-md bg-[#1e6988] px-3 py-2 text-sm font-semibold text-white">Añadir en {ZONE_LABELS[selectedZone]}</button>
              <span className="col-span-2 text-[11px] text-slate-500">Toca otra zona del plano para cambiar el lugar donde añades la mesa.</span>
            </div>
          )}

          {showSettings && (
            <div className="grid grid-cols-2 gap-2">
              {FLOORPLAN_ZONES.map((z)=>(
                <label key={z} className="text-[11px] text-slate-600">
                  {ZONE_LABELS[z]}
                  <input type="number" min={1} max={99} inputMode="numeric"
                    value={layout.salons[z] ?? ''}
                    onChange={(e)=>{
                      const n=e.target.value.trim()===''?null:Number(e.target.value)
                      if(n!==null && (!Number.isSafeInteger(n)||n<1||n>99))return
                      setLayout((old)=>({...old,salons:{...old.salons,[z]:n}}))
                    }}
                    className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm"/>
                </label>
              ))}
              <p className="col-span-2 text-[11px] text-slate-500">Configura la correspondencia con BDP antes de publicar.</p>
            </div>
          )}

          {selected && !adding && !showSettings && (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-[100px_1fr] gap-2">
                <label className="text-[11px] text-slate-600">N.º mesa
                  <input type="number" min={1} max={9999} inputMode="numeric"
                    value={editNumber}
                    onChange={(e)=>{
                      setEditNumber(e.target.value)
                      if(e.target.value.trim()==='' && needsFirstPublish) {
                        updateTable(selected.id,{number:null})
                      } else {
                        const n=Number(e.target.value)
                        if(e.target.value.trim()!=='' && Number.isSafeInteger(n) && n>0 && n<=9999)
                          updateTable(selected.id,{number:n})
                      }
                    }}
                    className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm"/>
                </label>
                <label className="text-[11px] text-slate-600">Forma
                  <select value={selected.shape}
                    onChange={(e)=>updateTable(selected.id,{shape:e.target.value as FloorplanShape})}
                    className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm">
                    {SHAPES.map((sh)=><option key={sh.id} value={sh.id}>{sh.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="flex items-center justify-between gap-1">
                <button type="button" onClick={()=>updateTable(selected.id,{rotation:((selected.rotation+90)%360) as FloorplanTable['rotation'],width:selected.height,height:selected.width})}
                  className="flex items-center gap-1 rounded-md border border-slate-200 p-2 text-xs"><RotateCw size={16}/>Girar</button>
                <button type="button" onClick={()=>updateTable(selected.id,{width:clamp(selected.width-2,4,60),height:clamp(selected.height-2,4,60)})}
                  aria-label="Reducir mesa" className="rounded-md border border-slate-200 p-2"><Minus size={16}/></button>
                <button type="button" onClick={()=>updateTable(selected.id,{width:clamp(selected.width+2,4,60),height:clamp(selected.height+2,4,60)})}
                  aria-label="Ampliar mesa" className="rounded-md border border-slate-200 p-2"><Plus size={16}/></button>
                <button type="button" aria-label="Eliminar mesa"
                  onClick={()=>{
                    if(window.confirm('¿Eliminar esta mesa del plano?')){
                      setLayout((old)=>({...old,tables:old.tables.filter((t)=>t.id!==selected.id)}))
                      setSelectedId(null)
                    }
                  }}
                  className="rounded-md border border-red-200 bg-red-50 p-2 text-red-700"><Trash2 size={16}/></button>
              </div>
              <p className="text-[11px] text-slate-500">Arrastra la mesa para moverla. El número se conserva al cambiar su posición.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
