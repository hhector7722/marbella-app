import {
  Bell,
  CalendarDays,
  Clock3,
  Home,
  Package,
  Search,
  UserRound,
  Video,
  Wifi,
  Signal,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
} from 'lucide-react';
import styles from './estilo.module.css';

// Reproducción puramente visual de la referencia aportada.
// Sin event handlers, consultas, datos reales ni dependencias de widgets operativos.
const products = [
  { name: 'CAFÉ LLET', count: '54', total: '92,4€', percent: 100 },
  { name: 'ALHAMBRA', count: '10', total: '38€', percent: 48 },
  { name: 'MENÚ TRUITA I...', count: '1', total: '35€', percent: 33 },
];
const hours = [
  { label: '14 - 15', units: '4 u', total: '9€', highlighted: true },
  { label: '9 - 10', units: '45 u', total: '108€', highlighted: false },
  { label: '11 - 12', units: '48 u', total: '107€', highlighted: false },
];
const days = [
  [26, 27, 28, 29, 30, 31, 1],
  [2, 3, 4, 5, 6, 7, 8],
  [9, 10, 11, 12, 13, 14, 15],
  [16, 17, 18, 19, 20, 21, 22],
];
const shortcuts = [
  { name: 'Reservas', img: '/icons/reservas.png', tint: 'teal' },
  { name: 'Ingredientes', img: '/icons/ingrediente.png', tint: 'slate' },
  { name: 'Recetas', img: '/icons/recipes.png', tint: 'rose' },
  { name: 'Albaranes', img: '/icons/scan.png', tint: 'blue' },
  { name: 'Otros', img: '/icons/more.png', tint: 'ice' },
  { name: 'Cajas Cambio', img: '', tint: 'gold' },
  { name: 'Plantilla', img: '/icons/admin.png', tint: 'sand' },
  { name: 'Cambio', img: '/icons/change.png', tint: 'teal' },
] as const;

function SummaryMetric({ label, value, tone }: {label:string; value:string; tone:'blue'|'green'|'purple'}) {
  return (
    <div className={`${styles.summaryMetric} ${styles[tone]}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function MicroStat({label, value}: {label:string;value:string}) {
  return <div className={styles.microStat}><span>{label}</span><strong>{value}</strong></div>;
}
function Closing() {
  return (
    <section className={styles.summaryCard} aria-label="Último cierre de ejemplo">
      <div className={styles.summaryHeading}>
        <strong>Último cierre</strong>
        <div className={styles.closingMeta}><span className={styles.weather}>🌤️</span><span>16 nov</span><span>84 t</span></div>
      </div>
      <div className={styles.summaryMetrics}>
        <SummaryMetric label="Ventas" value="425,30€" tone="blue"/>
        <SummaryMetric label="Venta neta" value="386,64€" tone="green"/>
        <SummaryMetric label="Rendimiento" value="▼ 14,9%" tone="purple"/>
      </div>
      <div className={styles.summaryMicrostats}>
        <MicroStat label="Efectivo" value="284,39€"/>
        <MicroStat label="Tarjeta" value="63,20€"/>
        <MicroStat label="Diferencia" value="16,29€"/>
      </div>
    </section>
  );
}
function Monthly() {
  return (
    <section className={styles.summaryCard} aria-label="Ventas mensuales de ejemplo">
      <div className={`${styles.summaryHeading} ${styles.monthTitle}`}>
        <ChevronLeft aria-hidden="true"/>
        <strong>Noviembre 2026</strong>
        <ChevronRight aria-hidden="true"/>
      </div>
      <div className={`${styles.summaryMetrics} ${styles.twoSummaryMetrics}`}>
        <SummaryMetric label="Ventas" value="25.857,50€" tone="blue"/>
        <SummaryMetric label="Venta neta" value="22.865,54€" tone="green"/>
      </div>
      <div className={styles.summaryMicrostats}>
        <MicroStat label="Media" value="1.572,01€"/>
        <MicroStat label="Tickets" value="4.561"/>
        <MicroStat label="T. medio" value="5,67€"/>
      </div>
    </section>
  );
}
function Sales() {
  return (
    <section className={styles.salesCard} aria-label="Ventas de ejemplo">
      <div className={styles.salesHeading}>
        <span>14:23:56</span>
        <div className={styles.salesDate}><ChevronLeft/><strong>MAR 17 NOV</strong><ChevronRight/></div>
        <span className={styles.salesChip}>Ventas</span>
      </div>
      <div className={styles.salesContent}>
        <div className={styles.salesLeft}>
          <div className={styles.salesStats}>
            <div className={`${styles.salesPill} ${styles.salesBlue}`}><span>Ventas</span><strong>505,20€</strong></div>
            <div className={`${styles.salesPill} ${styles.salesGreen}`}><span>Venta neta</span><strong>459,27€</strong></div>
          </div>
          <div className={styles.productRows}>
            {products.map((p,i) => (
              <div className={styles.productRow} key={p.name}>
                <span className={styles.productName}>{i + 1}.&nbsp; {p.name}</span>
                <div className={styles.barTrack}><span style={{width:`${p.percent}%`}}/></div>
                <span className={styles.productCount}>{p.count}</span>
                <strong>{p.total}</strong>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.salesRight}>
          <div className={styles.salesChart}>
            <svg viewBox="0 0 360 74" preserveAspectRatio="none" aria-hidden="true">
              <defs><linearGradient id="estiloChartFill" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#53b8ff" stopOpacity=".25"/><stop offset="1" stopColor="#53b8ff" stopOpacity="0"/></linearGradient></defs>
              <path d="M4 67 L34 35 L64 50 L91 40 L113 18 L139 47 L171 29 L193 68 L356 68 Z" fill="url(#estiloChartFill)"/>
              <path d="M4 67 L34 35 L64 50 L91 40 L113 18 L139 47 L171 29 L193 68 L356 68" stroke="#56b9ff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
            <div className={styles.chartLabels}><span>7h</span><span>23h</span></div>
          </div>
          <div className={styles.hourRows}>
            {hours.map((h)=><div className={styles.hourRow} key={h.label}>
              <span>{h.label}</span><span>{h.units}</span><strong className={h.highlighted ? styles.positiveText : undefined}>{h.total}</strong>
            </div>)}
          </div>
        </div>
      </div>
    </section>
  );
}
function Calendar() {
  return (
    <section className={styles.calendarCard} aria-label="Calendario de ejemplo">
      <div className={styles.calendarHeading}><ChevronLeft/><strong>NOVIEMBRE 2026</strong><ChevronRight/></div>
      <div className={styles.calendarDays}>
        {['LUN','MAR','MIE','JUE','VIE','SAB','DOM','EXT'].map(d=><span key={d}>{d}</span>)}
      </div>
      <div className={styles.calendarWeeks}>
        {days.map((week,wi)=>(
          <div className={styles.calendarWeek} key={wi}>
            {week.map((n,di)=>{
              const isToday=wi===3&&n===17;
              const hasEvent=(wi===0&&n===31)||(wi===1&&n===7)||(wi===2&&(n===14||n===15));
              return <span className={`${styles.calDay} ${isToday?styles.today:''} ${hasEvent?styles.eventDay:''}`} key={di}>{n}</span>;
            })}
            <span className={styles.extCell}>{wi<3?<><strong>{['317€','847€','450€'][wi]}</strong><span className={wi===2?styles.failStatus:styles.okStatus}>{wi===2?<X/>:<Check/>}</span></>:null}</span>
          </div>
        ))}
      </div>
      <div className={styles.eventRow}>
        <div className={styles.eventBox}>
          <strong>Sábado 21</strong>
          <span>Cursa de la dona</span>
          <small>10h - 20h&nbsp; / &nbsp;30000 pax&nbsp; / &nbsp;senior</small>
        </div>
        <div className={styles.eventBox}>
          <strong>Domingo 22</strong>
          <span>Afac</span>
          <small>9h - 14:30&nbsp; / &nbsp;50 pax&nbsp; / &nbsp;senior,...</small>
        </div>
      </div>
    </section>
  );
}
function Attendance() {
  return (
    <div className={styles.attendance}>
      <div className={styles.attendanceSheet}>
        <div className={styles.attendanceTitle}>Mar 17 de nov</div>
        <div className={styles.attendanceBody}>
          <div><span>Hector</span><b><em>3:30</em> - <i>8</i></b></div>
          <div><span>Alba</span><b>7</b></div>
          <div><span>Fernando</span><b>8</b></div>
          <div><span>Willy</span><b>13</b></div>
        </div>
      </div>
      <strong className={styles.railLabel}>Asistencia</strong>
    </div>
  );
}
function InitialCash() {
  return (
    <div className={styles.cashInitial}>
      <span className={`${styles.cashPill} ${styles.balancePill}`}>-21.81€</span>
      <span className={`${styles.cashPill} ${styles.actionPill}`}>ACCIÓN</span>
      <strong className={styles.railLabel}>C Inicial</strong>
    </div>
  );
}
function Shortcut({name,img,tint}: {name:string;img:string;tint:string}) {
  return (
    <div className={styles.shortcut}>
      <div className={`${styles.shortcutTile} ${styles[`tint_${tint}`]} `}>
        {img ? <img src={img} alt="" draggable={false}/> :
          <div className={styles.cashInside}><span>300€</span><span>215€</span></div>}
      </div>
      <strong>{name}</strong>
    </div>
  );
}
function FakeNavigation() {
  return <div className={styles.bottomNav} aria-label="Vista previa de la navegación">
    <div><CalendarDays/><span>Calendario</span></div>
    <div><Clock3/><span>Asistencia</span></div>
    <div className={styles.activeNav}><Home/><strong>Inicio</strong></div>
    <div><Package/><span>Pedidos</span></div>
    <div><UserRound/><span>Perfil</span></div>
  </div>;
}
export default function EstiloPage() {
  return (
    <div className={styles.previewOverlay}>
      <div className={styles.screen}>
        <div className={styles.statusbar} aria-hidden="true">
          <strong>14:23</strong>
          <div className={styles.statusIcons}><Signal/><Wifi/><span className={styles.battery}>50</span></div>
        </div>
        <div className={styles.topbar}>
          <div className={styles.identity}>
            <div className={styles.avatar}>bar<br/>la marbella</div>
            <strong>Hector</strong>
          </div>
          <div className={styles.search}><Search/><span>Buscar...</span></div>
          <div className={styles.headerIcons}>
            <div className={styles.camera}><Video fill="white" strokeWidth={2.5}/></div>
            <div className={styles.ai}><span>IA</span></div>
            <div className={styles.bell}><Bell/><i/></div>
          </div>
        </div>
        <div className={styles.content}>
          <div className={styles.topCards}><Closing/><Monthly/></div>
          <Sales/>
          <div className={styles.calendarAndRail}><Calendar/><div className={styles.rail}><Attendance/><InitialCash/></div></div>
          <div className={styles.shortcuts}>{shortcuts.map(s=><Shortcut key={s.name} {...s}/>)}</div>
          <div className={styles.dots} aria-hidden="true"><i className={styles.currentDot}/><i/><i/></div>
        </div>
        <FakeNavigation/>
        <span className={styles.previewIndicator}>Maqueta visual · Datos ficticios · Sin interacciones</span>
      </div>
    </div>
  );
}
