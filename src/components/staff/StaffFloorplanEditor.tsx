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
      className={'group absolute flex items-center justify-center overflow-visible rounded-[5px] transition-shadow ' +
        (selected ? 'z-20 ring-2 ring-[#2478a9] ring-offset-1' : 'z-10') +
        (editing ? ' cursor-grab active:cursor-grabbing' : ' cursor-pointer active:scale-[.97]')}
      style={{
        left: table.x + '%', top: table.y + '%',
        width: table.width + '%', height: table.height + '%',
        touchAction: editing ? 'none' : 'manipulation',
      }}
    >
      <span className="pointer-events-none absolute inset-0 rounded-[4px] bg-[#e2c6a5] shadow-[0_1px_5px_rgba(31,43,53,.3)] ring-1 ring-[#bd9e80]/70" aria-hidden>
        <span className={'absolute inset-1 rounded-[2px] border border-[#ecd8bc]/85 ' +
          (double ? 'bg-[linear-gradient(to_bottom,transparent_49%,#b99168_49%,#b99168_51%,transparent_51%)]' : '')}
          style={{ transform: 'rotate(' + table.rotation + 'deg)' }} />
      </span>
      <span className={'pointer-events-none absolute border border-[#aeb5b8] bg-white shadow-sm ' +
        (sideways ? '-top-[7%] left-[24%] h-[9%] w-[23%] rounded-t-sm' : '-left-[7%] top-[24%] h-[23%] w-[9%] rounded-l-sm')} aria-hidden />
      <span className={'pointer-events-none absolute border border-[#aeb5b8] bg-white shadow-sm ' +
        (sideways ? '-bottom-[7%] right-[24%] h-[9%] w-[23%] rounded-b-sm' : '-right-[7%] bottom-[24%] h-[23%] w-[9%] rounded-r-sm')} aria-hidden />
      {double && (
        <>
          <span className={'pointer-events-none absolute border border-[#aeb5b8] bg-white ' +
            (sideways ? '-top-[7%] right-[15%] h-[9%] w-[21%] rounded-t-sm' : '-left-[7%] bottom-[15%] h-[21%] w-[9%] rounded-l-sm')} aria-hidden />
          <span className={'pointer-events-none absolute border border-[#aeb5b8] bg-white ' +
            (sideways ? '-bottom-[7%] left-[15%] h-[9%] w-[21%] rounded-b-sm' : '-right-[7%] top-[15%] h-[21%] w-[9%] rounded-r-sm')} aria-hidden />
        </>
      )}
      <span className={'relative z-10 flex h-[min(80%,34px)] min-h-[18px] min-w-[20px] items-center justify-center rounded-md px-1 text-[clamp(10px,1.8vw,17px)] font-bold shadow-sm ' +
        (table.number === null ? 'bg-white/95 text-slate-500' : 'bg-white/95 text-slate-900')}>
        {table.number ?? (editing ? '·' : '—')}
      </span>
    </button>
  )
}

function ZoneCanvas({ zone, layout, editing, selectedId, focusZone, onFocus, onSelect, onMove }: {
  zone: FloorplanZone
  layout: FloorplanLayout
  editing: boolean
  selectedId: string | null
  focusZone: FloorplanZone | null
  onFocus: (zone: FloorplanZone) => void
  onSelect: (id: string) => void
  onMove: (id: string, x: number, y: number) => void
}) {
  const drag = useRef<{ id: string; pointerId: number; startX: number; startY: number; originalX: number; originalY: number; bounds: DOMRect; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const tables = layout.tables.filter((item) => item.zone === zone)
  const isIndividuals = zone === 'individuales'

  const handleDown = (event: PointerEvent<HTMLButtonElement>, item: FloorplanTable) => {
    if (!editing) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const rect = event.currentTarget.parentElement?.getBoundingClientRect()
    if (!rect) return
    drag.current = {
      id: item.id, pointerId: event.pointerId, startX: event.clientX,
      startY: event.clientY, originalX: item.x, originalY: item.y,
      bounds: rect, moved: false,
    }
    onSelect(item.id)
  }

  const handleMove = (event: PointerEvent<HTMLButtonElement>, item: FloorplanTable) => {
    const state = drag.current
    if (!state || state.pointerId !== event.pointerId || state.id !== item.id) return
    const dx = event.clientX - state.startX
    const dy = event.clientY - state.startY
    if (Math.abs(dx) + Math.abs(dy) > 3) state.moved = true
    if (!state.moved) return
    onMove(item.id,
      clamp(Math.round((state.originalX + dx / state.bounds.width * 100) * 10) / 10, 0, 100 - item.width),
      clamp(Math.round((state.originalY + dy / state.bounds.height * 100) * 10) / 10, 0, 100 - item.height),
    )
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
    <section className="relative min-h-0 overflow-hidden rounded-xl border border-[#b8c8cd] bg-[#dae1e0] shadow-[inset_0_1px_3px_rgba(0,0,0,.09)]" aria-label={ZONE_LABELS[zone]}>
      <div className="absolute inset-0 opacity-35" aria-hidden
        style={{ backgroundImage: 'linear-gradient(#c2cbca 1px,transparent 1px),linear-gradient(90deg,#c2cbca 1px,transparent 1px)', backgroundSize: '21px 21px' }} />
      <div className="absolute left-2 top-2 z-30 flex items-center gap-2">
        <span className="rounded-md bg-white/90 px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-sm">
          {ZONE_LABELS[zone]}
        </span>
        {editing && <span className="rounded-md bg-white/80 px-1.5 py-1 text-[10px] text-slate-500">{tables.length} mesas</span>}
      </div>
      <button type="button" onClick={() => onFocus(zone)}
        className="absolute right-2 top-2 z-30 rounded-md bg-white/90 p-1.5 text-slate-700 shadow-sm"
        aria-label={(focusZone ? 'Volver al plano' : 'Ampliar') + ': ' + ZONE_LABELS[zone]}>
        {focusZone ? <Shrink size={16} /> : <Expand size={16} />}
      </button>
      <div className={'absolute inset-x-[3%] bottom-[4%] top-[13%] ' +
        (isIndividuals ? 'rounded-md border border-dashed border-slate-400/60 bg-white/15' : '')}>
        {isIndividuals && <div className="pointer-events-none absolute inset-0 opacity-20" aria-hidden
          style={{ backgroundImage: 'linear-gradient(90deg,transparent 32.8%,#64748b 33%,transparent 33.2%,transparent 65.8%,#64748b 66%,transparent 66.2%),linear-gradient(transparent 32.8%,#64748b 33%,transparent 33.2%,transparent 65.8%,#64748b 66%,transparent 66.2%)' }} />}
        {tables.map((item) => (
          <TableFurniture
            key={item.id}
            table={item}
            editing={editing}
            selected={selectedId === item.id}
            onPointerDown={(e) => handleDown(e, item)}
            onPointerMove={(e) => handleMove(e, item)}
            onPointerUp={handleUp}
            onClick={() => {
              if (suppressClick.current) { suppressClick.current = false; return }
              onSelect(item.id)
            }}
          />
        ))}
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
