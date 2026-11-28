export type BdpGridLayout = {
  columns:number; gap:number; rowHeight:number; photoHeight:number; controlsHeight:number
  infoHeight:number; nameSize:number; priceSize:number; dualPriceSize:number; nameLines:number
  visibleCount:number; fits:boolean
}

const clamp=(min:number,value:number,max:number)=>Math.min(max,Math.max(min,value))

/** Optimize complete visible cards, then maximize useful photo area.
 * The viewport is the product area, not the entire device screen.
 */
export function calculateBdpGrid(count:number,width:number,height:number,hasDual=false):BdpGridLayout {
  const n=Math.max(1,Math.floor(count))
  const w=Math.max(1,Math.floor(width)),h=Math.max(1,Math.floor(height))
  const maxColumns=Math.max(1,Math.min(6,Math.floor((w+6)/88)))
  const minColumns=Math.min(n===1?1:2,maxColumns)
  let best:BdpGridLayout|undefined
  let bestArea=-1
  for(let columns=minColumns;columns<=Math.min(maxColumns,Math.max(minColumns,n));columns++){
    const gap=columns>=4?6:8
    const cellWidth=Math.floor((w-(columns-1)*gap)/columns)
    if(cellWidth<82&&columns>1)continue
    const dense=cellWidth<108
    const controlsHeight=dense?40:48
    const nameSize=clamp(11,Math.floor(cellWidth/11),16)
    const priceSize=clamp(12,Math.floor(cellWidth/9),19)
    const dualPriceSize=clamp(11,Math.floor(cellWidth/10),16)
    const nameLines=dense?2:3
    const priceHeight=hasDual?Math.max(priceSize+3,dualPriceSize*2+3):priceSize+3
    const infoHeight=priceHeight+Math.ceil(nameSize*1.15*nameLines)+4
    const minHeight=controlsHeight+22+infoHeight
    const idealHeight=Math.max(minHeight,Math.min(cellWidth,220)+infoHeight)
    const rows=Math.ceil(n/columns)
    const completeRows=Math.max(0,Math.floor((h+gap)/(minHeight+gap)))
    const shownRows=Math.max(1,Math.min(rows,completeRows))
    const rowHeight=clamp(minHeight,Math.floor((h-gap*(shownRows-1))/shownRows),idealHeight)
    const visibleCount=Math.min(count,Math.floor((h+gap)/(rowHeight+gap))*columns)
    const photoHeight=rowHeight-infoHeight
    const area=cellWidth*(photoHeight-controlsHeight)
    const next={columns,gap,rowHeight,photoHeight,controlsHeight,infoHeight,nameSize,priceSize,dualPriceSize,nameLines,visibleCount,fits:visibleCount>=count}
    if(!best||visibleCount>best.visibleCount||(visibleCount===best.visibleCount&&area>bestArea)){
      best=next;bestArea=area
    }
  }
  return best??{columns:1,gap:8,rowHeight:142,photoHeight:88,controlsHeight:48,infoHeight:54,nameSize:11,priceSize:12,dualPriceSize:11,nameLines:3,visibleCount:0,fits:false}
}
