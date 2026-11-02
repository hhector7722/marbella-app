'use client'

import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { COLA_LAYOUT } from '@/lib/replenishment/assisted-scan'
import type { CircleCandidate } from '@/lib/replenishment/vision'
import {
  grayFrame, nearestStackAt, observedPositions, projectImagePoint,
  stackImagePoint, trackImageQuad, validImageQuad,
  type ImagePoint, type ImageQuad,
} from '@/lib/replenishment/camera-grid'

const W=320
const H=240
type Mode = 'off' | 'calibrating' | 'tracking' | 'lost'
type Tracker = {
  mode: Mode
  quad: ImageQuad | null
  previous: Uint8Array | null
  markers: Map<string, number>
  stableSeen: Set<string>
}

function newTracker(): Tracker {
  return { mode:'off', quad:null, previous:null, markers:new Map(), stableSeen:new Set() }
}

export function useCocaColaGridTracking(selectedId: string, selectPosition: (id: string) => void) {
  const tracker=useRef<Tracker>(newTracker())
  const selectionRef=useRef(selectPosition)
  const activeRef=useRef(selectedId)
  useEffect(() => {
    selectionRef.current=selectPosition
    activeRef.current=selectedId
  }, [selectPosition, selectedId])
  const [mode,setMode]=useState<Mode>('off')
  const [corners,setCorners]=useState<ImagePoint[]>([])
  const [seenIds,setSeenIds]=useState<string[]>([])
  const [alignmentError,setAlignmentError]=useState<string | null>(null)

  const reset=useCallback(()=>{
    tracker.current=newTracker()
    setMode('off')
    setCorners([])
    setSeenIds([])
    setAlignmentError(null)
  },[])

  const calibrate=useCallback(()=>{
    tracker.current=newTracker()
    tracker.current.mode='calibrating'
    setMode('calibrating')
    setCorners([])
    setSeenIds([])
    setAlignmentError(null)
  },[])

  const onPointerUp=(event: PointerEvent<HTMLCanvasElement>)=>{
    if(tracker.current.mode!=='calibrating' && tracker.current.mode!=='tracking') return
    const rect=event.currentTarget.getBoundingClientRect()
    const pt={x:(event.clientX-rect.left)*W/rect.width,y:(event.clientY-rect.top)*H/rect.height}
    if(tracker.current.mode==='calibrating') {
      const next=[...corners,pt]
      if(next.length<4){setCorners(next);return}
      if(!validImageQuad(next)){
        setCorners([])
        setAlignmentError('Las cuatro esquinas deben rodear la rejilla en sentido horario y ocupar un área visible. Repite los puntos.')
        return
      }
      tracker.current.quad=next
      tracker.current.previous=null
      tracker.current.mode='tracking'
      setCorners([])
      setMode('tracking')
      setAlignmentError(null)
      return
    }
    const quad=tracker.current.quad
    if(!quad)return
    const matched=nearestStackAt(quad,COLA_LAYOUT,pt)
    if(matched)selectionRef.current(matched)
  }

  const renderFrame=useCallback((
    image: ImageData, overlay: CanvasRenderingContext2D,
    circles: CircleCandidate[],
  )=>{
    const t=tracker.current
    if(t.mode==='calibrating') {
      overlay.strokeStyle='rgba(255,255,255,0.9)'
      overlay.fillStyle='rgba(255,255,255,0.9)'
      overlay.lineWidth=2
      for(let i=0;i<corners.length;i++){
        const p=corners[i]
        overlay.beginPath()
        overlay.arc(p.x,p.y,6,0,2*Math.PI)
        overlay.fill()
        if(i){overlay.beginPath();overlay.moveTo(corners[i-1].x,corners[i-1].y);overlay.lineTo(p.x,p.y);overlay.stroke()}
      }
      return
    }
    if(t.mode!=='tracking' || !t.quad)return
    const gray=grayFrame(image)
    if(t.previous){
      const next=trackImageQuad(t.previous,gray,t.quad)
      if(!next){
        t.mode='lost'
        t.quad=null
        t.previous=null
        setMode('lost')
        setAlignmentError('Se perdió la referencia visual. Recalibra las cuatro esquinas antes de atribuir nuevas posiciones.')
        return
      }
      t.quad=next
    }
    t.previous=gray
    const quad=t.quad
    overlay.strokeStyle='rgba(255,255,255,0.85)'
    overlay.lineWidth=1.5
    overlay.beginPath()
    overlay.moveTo(quad[0].x,quad[0].y)
    for(let i=1;i<4;i++)overlay.lineTo(quad[i].x,quad[i].y)
    overlay.closePath()
    overlay.stroke()
    // Projected grid guides are geometry aids, NOT counts or stack-depth estimates.
    overlay.strokeStyle='rgba(255,255,255,0.32)'
    overlay.lineWidth=1
    for(let idx=1;idx<7;idx++){
      for(const vertical of [true,false]){
        const from=projectImagePoint(quad,vertical?idx/7:0,vertical?0:idx/7)
        const to=projectImagePoint(quad,vertical?idx/7:1,vertical?1:idx/7)
        if(!from||!to)continue
        overlay.beginPath();overlay.moveTo(from.x,from.y);overlay.lineTo(to.x,to.y);overlay.stroke()
      }
    }
    const found=observedPositions(quad,COLA_LAYOUT,circles)
    const currentIds=new Set(found)
    for(const id of t.markers.keys()) if(!currentIds.has(id)) t.markers.delete(id)
    for(const id of found){
      const occurrences=(t.markers.get(id)??0)+1
      t.markers.set(id,occurrences)
      if(occurrences>=3 && !t.stableSeen.has(id)){
        t.stableSeen.add(id)
        setSeenIds([...t.stableSeen])
      }
    }
    // A position is only marked "seen". No quantities are assigned on visual hints.
    for(const pos of COLA_LAYOUT){
      const p=stackImagePoint(quad,pos)
      if(!p)continue
      overlay.beginPath()
      overlay.arc(p.x,p.y,activeRef.current===pos.id?6:3,0,2*Math.PI)
      overlay.strokeStyle=activeRef.current===pos.id?
        'rgba(255,255,255,1)':t.stableSeen.has(pos.id)?
          'rgba(34,197,94,0.9)':'rgba(255,255,255,0.45)'
      overlay.lineWidth=activeRef.current===pos.id?3:1.5
      overlay.stroke()
    }
  },[corners])

  return {mode,corners,seenIds,alignmentError,calibrate,reset,onPointerUp,renderFrame}
}
