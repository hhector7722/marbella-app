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
      onClick={onClick}
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
      className="relative min-h-0 min-w-0 overflow-hidden bg-[#aeb4b5]">
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
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#edf1f2] text-slate-900">
      <header className="flex h-[60px] shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/staff/dashboard" aria-label="Volver a inicio"
            className="rounded-lg p-2 text-slate-700 hover:bg-slate-100"><ArrowLeft size={20} /></Link>
          <div>
            <h1 className="text-[17px] font-semibold leading-tight">Mesas</h1>
            <p className="text-[10px] text-slate-500">{editing ? (needsFirstPublish ? 'Configuración inicial' : 'Editar distribución') : 'Plano del establecimiento'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              {!needsFirstPublish && <button type="button" disabled={busy}
                className="rounded-lg px-2 py-2 text-sm text-slate-600"
                onClick={() => {
                  setLayout(cloneFloorplan(published!))
                  setEditing(false); setSelectedId(null); setAdding(false)
                }}><X size={19}/></button>}
              {needsFirstPublish && (
                <button type="button" disabled={busy} onClick={() => void save(false)}
                  className="rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-medium disabled:opacity-50">Borrador</button>
              )}
              <button type="button" disabled={busy} onClick={() => void save(true)}
                className="flex items-center gap-1.5 rounded-lg bg-[#1f627f] px-3 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-50">
                <Save size={15}/>{needsFirstPublish ? 'Publicar' : 'Guardar'}
              </button>
            </>
          ) : canEdit ? (
            <button type="button" onClick={() => {setEditing(true);setFocusZone(null)}}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold">
              <Pencil size={15}/> Editar
            </button>
          ) : null}
        </div>
      </header>

      {!displayed && !editing ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-slate-600">
          El plano todavía no está publicado. Se mostrará cuando se hayan numerado todas las mesas.
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-rows-3 gap-2 p-2 sm:gap-3 sm:p-3" style={focusZone ? {gridTemplateRows:'minmax(0,1fr)'}:undefined}>
          {(!focusZone || focusZone === 'alargadas') && (
            <ZoneCanvas zone="alargadas" layout={displayed ?? layout} editing={editing}
              selectedId={selectedId} focusZone={focusZone} onFocus={(z)=>setFocusZone(focusZone ? null:z)}
              onSelect={selectTable} onMove={(id,x,y)=>updateTable(id,{x,y})}/>
          )}
          {(!focusZone || focusZone === 'terraza') && (
            <ZoneCanvas zone="terraza" layout={displayed ?? layout} editing={editing}
              selectedId={selectedId} focusZone={focusZone} onFocus={(z)=>setFocusZone(focusZone ? null:z)}
              onSelect={selectTable} onMove={(id,x,y)=>updateTable(id,{x,y})}/>
          )}
          {(!focusZone || focusZone === 'interior' || focusZone === 'individuales') && (
            <div className={'grid min-h-0 gap-2 ' + (focusZone ? 'grid-cols-1' : 'grid-cols-2')} >
              {(!focusZone || focusZone === 'interior') &&
                <ZoneCanvas zone="interior" layout={displayed ?? layout} editing={editing}
                  selectedId={selectedId} focusZone={focusZone} onFocus={(z)=>setFocusZone(focusZone ? null:z)}
                  onSelect={selectTable} onMove={(id,x,y)=>updateTable(id,{x,y})}/>}
              {(!focusZone || focusZone === 'individuales') &&
                <ZoneCanvas zone="individuales" layout={displayed ?? layout} editing={editing}
                  selectedId={selectedId} focusZone={focusZone} onFocus={(z)=>setFocusZone(focusZone ? null:z)}
                  onSelect={selectTable} onMove={(id,x,y)=>updateTable(id,{x,y})}/>}
            </div>
          )}
        </div>
      )}

      {editing && (
        <div className="z-40 shrink-0 border-t border-slate-200 bg-white px-3 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-3px_12px_rgba(15,23,42,.08)]">
          <div className="flex items-center gap-2">
            <select aria-label="Zona en edición" value={selectedZone}
              onChange={(e)=>{setSelectedZone(e.target.value as FloorplanZone);setSelectedId(null)}}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-semibold">
              {FLOORPLAN_ZONES.map((z)=><option value={z} key={z}>{ZONE_LABELS[z]}</option>)}
            </select>
            <button type="button" onClick={()=>{setAdding((old)=>!old);setSelectedId(null)}}
              className="flex items-center gap-1 rounded-lg border border-[#96bdcd] bg-[#e9f3f8] px-3 py-2 text-xs font-semibold text-[#185977]">
              <Plus size={16}/> Mesa
            </button>
            <button type="button" onClick={()=>setShowSettings((v)=>!v)}
              className="rounded-lg border border-slate-200 p-2 text-slate-600" aria-label="Salones BDP">
              <ChevronDown size={16} className={showSettings ? 'rotate-180' : ''}/>
            </button>
          </div>

          {showSettings && (
            <div className="mt-2 grid grid-cols-2 gap-2 border-t pt-2 sm:grid-cols-4">
              {FLOORPLAN_ZONES.map((z)=>(
                <label className="text-[11px] text-slate-600" key={z}>
                  Salón BDP · {ZONE_LABELS[z]}
                  <input type="number" inputMode="numeric" min={1} max={99}
                    value={layout.salons[z] ?? ''}
                    onChange={(e)=>{
                      const n=e.target.value.trim()===''?null:Number(e.target.value)
                      if(n!==null && (!Number.isSafeInteger(n)||n<1||n>99))return
                      setLayout((old)=>({...old,salons:{...old.salons,[z]:n}}))
                    }}
                    className="mt-0.5 w-full rounded-md border border-slate-200 p-1.5 text-sm" />
                </label>
              ))}
              <p className="col-span-2 text-[10px] text-slate-500 sm:col-span-4">
                Las zonas pueden compartir salón. La correspondencia BDP se confirma antes de enviar comandas.
              </p>
            </div>
          )}

          {adding && (
            <div className="mt-2 flex flex-wrap items-end gap-2 border-t pt-2">
              <label className="min-w-[115px] flex-1 text-[11px] text-slate-600">Tipo de mesa
                <select className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                  value={newShape} onChange={(e)=>setNewShape(e.target.value as FloorplanShape)}>
                  {SHAPES.map((s)=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="w-28 text-[11px] text-slate-600">Número {needsFirstPublish ? '(opcional)' : ''}
                <input type="number" min={1} max={9999} inputMode="numeric" value={newNumber}
                  onChange={(e)=>setNewNumber(e.target.value)}
                  placeholder="N.º"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
              </label>
              <button type="button" onClick={insertTable}
                className="rounded-lg bg-[#1f627f] px-3 py-2 text-sm font-semibold text-white">Añadir</button>
            </div>
          )}

          {selected && !adding && (
            <div className="mt-2 flex flex-wrap items-end gap-2 border-t pt-2">
              <label className="w-24 text-[11px] text-slate-600">N.º mesa
                <input type="number" inputMode="numeric" min={1} max={9999}
                  value={editNumber}
                  onChange={(e)=>{
                    setEditNumber(e.target.value)
                    if (e.target.value.trim() === '' && needsFirstPublish) {
                      updateTable(selected.id, { number: null })
                    } else {
                      const n=Number(e.target.value)
                      if (Number.isSafeInteger(n) && n>=1 && n<=9999) updateTable(selected.id,{number:n})
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
              </label>
              <label className="min-w-[112px] flex-1 text-[11px] text-slate-600">Forma
                <select value={selected.shape} onChange={(e)=>updateTable(selected.id,{shape:e.target.value as FloorplanShape})}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm">
                  {SHAPES.map((s)=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <button type="button" onClick={()=>updateTable(selected.id,{rotation:((selected.rotation+90)%360) as FloorplanTable['rotation'],width:selected.height,height:selected.width})}
                className="rounded-lg border border-slate-200 p-2 text-slate-600" aria-label="Girar mesa 90 grados">
                <RotateCw size={19}/>
              </button>
              <button type="button" onClick={()=>updateTable(selected.id,{width:clamp(selected.width-2,4,60),height:clamp(selected.height-2,4,60)})}
                className="rounded-lg border border-slate-200 p-2 text-slate-600" aria-label="Reducir tamaño">
                <Minus size={19}/>
              </button>
              <button type="button" onClick={()=>updateTable(selected.id,{width:clamp(selected.width+2,4,60),height:clamp(selected.height+2,4,60)})}
                className="rounded-lg border border-slate-200 p-2 text-slate-600" aria-label="Aumentar tamaño">
                <Plus size={19}/>
              </button>
              <button type="button" onClick={()=>{
                if(window.confirm('¿Eliminar la mesa del plano? No se alterará su comanda en BDP.')){
                  setLayout((old)=>({...old,tables:old.tables.filter((t)=>t.id!==selected.id)}))
                  setSelectedId(null)
                }
              }} className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-700" aria-label="Eliminar mesa">
                <Trash2 size={19}/>
              </button>
            </div>
          )}

          <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
            <Grip size={12}/> Arrastra las mesas para moverlas. Los cambios solo se aplican al pulsar Guardar.
          </p>
        </div>
      )}
    </div>
  )
}
