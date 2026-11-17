'use strict'; // Static visual sandbox: there are no handlers or data fetches.
import type { CSSProperties } from 'react';
import styles from './estilo.module.css';

const iconItems = [
  { key: 'ingredients', area: 'ingredients', label: 'Ingredientes', src: '/icons/ingrediente.png' },
  { key: 'reservations', area: 'reservations', label: 'Reservas', src: '/icons/reservas.png' },
  { key: 'recipes', area: 'recipes', label: 'Recetas', src: '/icons/recipes.png' },
  { key: 'invoices', area: 'invoices', label: 'Albaranes', src: '/icons/scan.png' },
  { key: 'change', area: 'change', label: 'Cambio', src: '/icons/change.png' },
  { key: 'staff', area: 'staff', label: 'Plantilla', src: '/icons/admin.png' },
  { key: 'stock', area: 'stock', label: 'Stock', src: '/icons/suplier.png' },
  { key: 'menu', area: 'menu', label: 'Carta', src: '/icons/menu.png' },
  { key: 'labor', area: 'labor', label: 'M obra', src: '/icons/overtime.png' },
  { key: 'purchase', area: 'purchase', label: 'Compra', src: '/icons/shop.png' },
  { key: 'closed', area: 'closed', label: 'Cierre', src: '/icons/lock.png' },
  { key: 'usage', area: 'usage', label: 'Uso app', src: '/icons/uso.png' },
  { key: 'profitability', area: 'profitability', label: 'Rentabilidad', src: '/icons/rent.png' },
  { key: 'info', area: 'info', label: 'Info', src: '/icons/information.png' },
  { key: 'others', area: 'others', label: 'Otros', src: '/icons/more.png' },
] as const;

const weeks = [
  { dates: [26,27,28,29,30,31,1], total: '317€' },
  { dates: [2,3,4,5,6,7,8], total: '847€' },
  { dates: [9,10,11,12,13,14,15], total: '450€' },
  { dates: [16,17,18,19,20,21,22], total: '' },
  { dates: [23,24,25,26,27,28,29], total: '' },
];

function Icon({ label, src, area }: { label: string; src: string; area: string }) {
  return (
    <div className={styles.iconItem} style={{ gridArea: area } as CSSProperties}>
      <div className={styles.iconTile}><img src={src} alt="" draggable={false} /></div>
      <span className={styles.iconLabel}>{label}</span>
    </div>
  );
}

function TwinPills({ kind, first, second, label }: {
  kind: 'initial' | 'cashchange'; first: string; second: string; label: string;
}) {
  return (
    <div className={styles.pairSlot} style={{ gridArea: kind }}>
      <div className={styles.twinPills}>
        <span className={kind === 'initial' ? styles.greenPill : styles.goldPill}>{first}</span>
        <span className={kind === 'initial' ? styles.orangePill : styles.purplePill}>{second}</span>
      </div>
      <span className={styles.iconLabel}>{label}</span>
    </div>
  );
}

function MiniMetric({ title, value, tone }: {title:string;value:string;tone:'sales'|'net'|'plain'}) {
  return (
    <div className={[styles.miniMetric, tone==='sales'?styles.blueMetric:tone==='net'?styles.greenMetric:styles.plainMetric].join(' ')}>
      <span>{title}</span><strong>{value}</strong>
    </div>
  );
}

function ClosingCard({ monthly }: {monthly:boolean}) {
  return (
    <section className={styles.closingCard}>
      <div className={styles.closingHeading}>
        {monthly
          ? <><span className={styles.mutedArrow}>‹</span><b>Noviembre 2026</b><span className={styles.mutedArrow}>›</span></>
          : <><b>Último cierre</b><small>☀️ 16 nov · 84 t</small></>}
      </div>
      <div className={styles.miniMetrics}>
        <MiniMetric title="Ventas" value={monthly?'25.968,60€':'425,30€'} tone="sales" />
        <MiniMetric title="Venta neta" value={monthly?'22.865,54€':'386,64€'} tone="net" />
        <MiniMetric title={monthly?'Mes anterior':'Rendimiento'} value={monthly?'▲ 38,1%':'▼ 14,9%'} tone="plain" />
      </div>
      <div className={styles.microStats}>
        {monthly
          ? <><div><small>Media</small><b>1.572,01€</b></div><div><small>Tickets</small><b>4.577</b></div><div><small>T. medio</small><b>5,67€</b></div></>
          : <><div><small>Efectivo</small><b>284,39€</b></div><div><small>Tarjeta</small><b>63,20€</b></div><div><small>Diferencia</small><b>16,29€</b></div></>}
      </div>
    </section>
  );
}

function Sales() {
  return (
    <section className={styles.salesPanel} style={{gridArea:'sales'}}>
      <div className={styles.salesHeader}>
        <small>16:15:34</small>
        <b><span>‹</span> MAR 17 NOV <span>›</span></b>
        <span className={styles.salesTag}>Ventas</span>
      </div>
      <div className={styles.bigMetrics}>
        <div className={styles.bigSales}><span>Ventas</span><strong>616,30€</strong></div>
        <div className={styles.bigNet}><span>Venta neta</span><strong>560,27€</strong></div>
      </div>
      <div className={styles.chart}>
        <svg viewBox="0 0 400 42" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 35 L18 27 L39 16 L60 24 L78 9 L103 21 L123 13 L149 17 L173 30 L191 20 L217 36 L236 29 L261 14 L282 21 L310 16 L330 23 L357 27 L380 14 L400 20" fill="none" stroke="#56aaff" strokeWidth="2"/>
        </svg>
        <div className={styles.chartHours}><span>7h</span><span>23h</span></div>
      </div>
      <div className={styles.salesBottom}>
        <div className={styles.productList}>
          <div><span>☕ CAFÉ LLET</span><strong>92,4€</strong></div>
          <div><span>🥤 ESTRELLA DAMM</span><strong>39,2€</strong></div>
          <div><span>🍽️ PLAT.MARBELLA</span><strong>38,7€</strong></div>
        </div>
        <div className={styles.hourList}>
          <div><span>16 - 17</span><strong>5€</strong></div>
          <div><span>9 - 10</span><strong>108€</strong></div>
          <div><span>11 - 12</span><strong>107€</strong></div>
        </div>
      </div>
    </section>
  );
}

function Attendance() {
  return (
    <div className={styles.registerSlot} style={{gridArea:'register'}}>
      <div className={styles.registerTile}>
        <div>Mar 17 nov</div>
        <span>Héctor <b>3:30 – 0</b></span>
        <span>Alba <b>7 – 16</b></span>
        <span>Fernando <b>8</b></span>
        <span>Willy <b>13</b></span>
      </div>
      <span className={styles.iconLabel}>Registros</span>
    </div>
  );
}

function Calendar() {
  return (
    <section className={styles.calendarPanel} style={{gridArea:'calendar'}}>
      <div className={styles.calendarTitle}><span>‹</span>NOVIEMBRE 2026<span>›</span></div>
      <div className={styles.weekLabels}>{['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM','EXT'].map(day=><b key={day}>{day}</b>)}</div>
      <div className={styles.calendarWeeks}>
        {weeks.map((week,wi)=>(
          <div key={wi} className={[styles.calendarWeek,wi===3?styles.expandedWeek:''].join(' ')}>
            <div className={styles.dateGrid}>
              {week.dates.map((day,i)=>(
                <span className={[styles.date,day===17&&wi===3?styles.today:'',i>=5&&[7,14,15,31].includes(day)?styles.eventDay:''].filter(Boolean).join(' ')} key={i}>{day}</span>
              ))}
              <span className={styles.extra}>{week.total}{week.total?<span className={wi===2?styles.redDot:styles.greenDot}/>:null}</span>
            </div>
            {wi===3?<div className={styles.eventsRow}>
              <div><strong>Sábado 21</strong><span>Cursa de la dona</span><small>10h - 20h <em>30000 pax</em></small></div>
              <div><strong>Domingo 22</strong><span>Afac</span><small>9h - 14:30 <em>50 pax</em></small></div>
            </div>:null}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function EstiloPage() {
  return (
    <div className={styles.page}>
      <div className={styles.stage} aria-label="Maqueta estática del dashboard Master">
        <div className={styles.grid}>
          <Sales />
          <div className={styles.closings} style={{gridArea:'closings'}}>
            <ClosingCard monthly />
            <ClosingCard monthly={false} />
          </div>
          <Attendance />
          <Calendar />
          <TwinPills kind="initial" first="-21,81€" second="ACCIÓN" label="C Inicial" />
          <TwinPills kind="cashchange" first="300€" second="215€" label="Cajas Cambio" />
          {iconItems.map(item=><Icon key={item.key} area={item.area} label={item.label} src={item.src} />)}
        </div>
        <div className={styles.pagination} aria-hidden="true"><span/> <span className={styles.activeDot}/> <span/></div>
      </div>
      <div className={styles.sandboxNote}>/estilo · Maqueta visual independiente · Datos ficticios · Sin botones ni operaciones</div>
    </div>
  );
}
