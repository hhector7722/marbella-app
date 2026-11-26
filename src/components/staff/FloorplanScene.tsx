'use client'

import type { FloorplanZone } from '@/lib/staff/floorplan'

/**
 * Escenografía edit-proof: suelo y elementos fijos independientes de las mesas.
 * Las mesas y sus números son capas individuales sobre el decorado.
 */
export function FloorplanScene({ zone }: { zone: FloorplanZone }) {
  const tile = 'tile-' + zone
  const grass = 'grass-' + zone
  const steel = 'steel-' + zone
  const outdoor = zone === 'alargadas' || zone === 'terraza'
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1000 600" preserveAspectRatio="none">
      <defs>
        <pattern id={tile} width="49" height="37" patternUnits="userSpaceOnUse">
          <rect width="49" height="37" fill={outdoor ? '#aeb3b5' : '#b7b7b6'} />
          <path d="M0 0H49M0 0V37" stroke={outdoor ? '#83898c' : '#97999a'} strokeWidth="1.25" opacity=".68" fill="none"/>
          <path d="M22 2V35M3 18H47" stroke="#dededb" strokeWidth=".7" opacity=".2" />
        </pattern>
        <pattern id={grass} width="62" height="35" patternUnits="userSpaceOnUse">
          <rect width="62" height="35" fill="#798d3f"/>
          {Array.from({length:29},(_,i)=>{
            const x=(i*23+3)%62, y=(i*17+6)%35
            return <path key={i} d={`M${x} ${y}l${i%3-1} -${3+i%4}M${x} ${y}l2 -3`}
              stroke={i%2?'#b7b26b':'#456e39'} strokeWidth="1.8" opacity=".75"/>
          })}
        </pattern>
        <linearGradient id={steel} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#56616a"/><stop offset=".21" stopColor="#c0c5c5"/>
          <stop offset=".65" stopColor="#68747c"/><stop offset="1" stopColor="#c4c7c7"/>
        </linearGradient>
      </defs>
      <rect width="1000" height="600" fill={`url(#${tile})`}/>
      {zone==='alargadas'&&<>
        <rect width="1000" height="86" fill={`url(#${grass})`}/>
        <rect y="83" width="1000" height="11" fill="#373938"/>
        <rect y="94" width="1000" height="18" fill="#777e7e"/>
        <path d="M0 118H1000" stroke="#313434" strokeDasharray="5 5" strokeWidth="3"/>
        <rect x="30" y="180" width="67" height="103" rx="4" fill="#ecebea" stroke="#adb2b5" strokeWidth="4"/>
        {Array.from({length:17},(_,i)=><path key={i} d={`M${36+i*3.2} 190V274`} stroke="#a0a7ac" strokeWidth="1.7"/>)}
        <path d="M0 598V110H1000" stroke="#373a3c" opacity=".22" strokeWidth="9" fill="none"/>
      </>}
      {zone==='terraza'&&<>
        <rect width="1000" height="12" fill={`url(#${grass})`}/>
        <rect y="12" width="1000" height="9" fill="#323636"/>
        <path d="M6 62H994M6 304H994M6 565H994" stroke="#205a8f" strokeWidth="5" fill="none"/>
        {Array.from({length:7},(_,i)=>{
          const x=6+i*164.6
          return <g key={i}>
            <path d={`M${x} 62V565`} stroke="#235e96" strokeWidth="3.5"/>
            {[62,304,565].map(y=><circle key={y} cx={x} cy={y} r="7"
              fill="#b9c4c8" stroke="#185081" strokeWidth="3"/>)}
          </g>
        })}
        {Array.from({length:9},(_,i)=>{
          const x=10+i*120
          return <g key={i} transform={`translate(${x} ${i%2===0?302:65})`}>
            <rect width="30" height="7" rx="2" fill="#597543" stroke="#346a43" strokeWidth="1.5"/>
            {Array.from({length:7},(_,j)=><path key={j} d={`M${j*4+2} 5l2 -8 3 8`}
              fill="#527a3b" stroke="#3c7843" strokeWidth=".6"/>)}
          </g>
        })}
        <path d="M0 592H1000" stroke="#505757" strokeWidth="15"/>
        <rect x="360" y="578" width="520" height="22" fill={`url(#${steel})`} opacity=".85"/>
      </>}
      {zone==='interior'&&<>
        <rect width="1000" height="16" fill="#34353a"/>
        <rect y="584" width="1000" height="16" fill="#2c3136"/>
        <rect width="24" height="600" fill="#40434a"/>
        <rect x="974" width="26" height="600" fill="#32383d"/>
        <path d="M72 36V562" stroke="#819a9d" strokeWidth="8"/>
        <path d="M104 30V563" stroke="#e6e8e8" strokeWidth="16"/>
        <path d="M112 30L155 40V520L112 558Z" fill="#81989d" opacity=".45"/>
        <rect x="160" y="25" width="195" height="340" fill="#b6b2af" stroke="#696a6b" strokeWidth="12"/>
        {Array.from({length:11},(_,i)=><g key={i}>
          <rect x="174" y={33+i*30} width="167" height="26" fill="#dcdad7" stroke="#9e9e9e" strokeWidth="1.6"/>
          <path d={`M176 ${55+i*30}H338`} stroke="#777d7d" strokeWidth="2"/>
        </g>)}
        <rect x="366" width="72" height="403" fill="#414345"/>
        <rect x="434" width="6" height="405" fill="#22282b"/>
        {Array.from({length:6},(_,i)=><rect key={i} x="377" y={22+i*55}
          width="45" height="33" fill={i%2?'#a95437':'#d6c2aa'} stroke="#71645d"/>)}
        <rect x="451" y="75" width="49" height="68" rx="5" fill="#267a3c" stroke="#1a512b" strokeWidth="5"/>
        <path d="M469 105h12m-6 -8v15" stroke="#e9eddb" strokeWidth="5"/>
        <rect x="545" y="15" width="392" height="45" rx="2" fill="#0f5995" stroke="#e1e3e3" strokeWidth="4"/>
        <text x="570" y="47" fill="white" fontSize="25" fontWeight="700">la MARBELLA</text>
        <rect x="929" y="25" width="45" height="534" fill="#9bafb4" opacity=".33"/>
        {Array.from({length:7},(_,i)=><path key={i} d={`M937 ${24+i*76}L968 ${24+i*76}`}
          stroke="#53666d" strokeWidth="4"/>)}
      </>}
      {zone==='individuales'&&<>
        <rect width="1000" height="16" fill="#34383b"/>
        <rect y="584" width="1000" height="16" fill="#34383b"/>
        <rect x="980" width="20" height="600" fill="#383c40"/>
        <path d="M0 18V584" stroke="#a1a4a5" strokeWidth="2"/>
      </>}
    </svg>
  )
}
