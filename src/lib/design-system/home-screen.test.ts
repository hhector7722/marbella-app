import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    HOME_SCREEN_COMPONENT_ID,
    HOME_SCREEN_COLUMNS,
    HOME_SCREEN_ROWS,
    HOME_SCREEN_SLOT_SPAN,
    resolveHomeWidgetScheme,
} from './home-screen.ts';

const SRC_ROOT = join(process.cwd(), 'src');

describe('HomeScreen — rejilla de inicio iOS', () => {
    it('expone 4 columnas, 6 filas y huecos de icono', () => {
        assert.equal(HOME_SCREEN_COMPONENT_ID, 'HomeScreen');
        assert.equal(HOME_SCREEN_COLUMNS, 4);
        assert.equal(HOME_SCREEN_ROWS, 6);
        assert.deepEqual(HOME_SCREEN_SLOT_SPAN.icon, { cols: 1, rows: 1 });
        assert.deepEqual(HOME_SCREEN_SLOT_SPAN.small, { cols: 2, rows: 2 });
        assert.deepEqual(HOME_SCREEN_SLOT_SPAN.medium, { cols: 4, rows: 2 });
        assert.deepEqual(HOME_SCREEN_SLOT_SPAN.large, { cols: 4, rows: 4 });
        assert.deepEqual(HOME_SCREEN_SLOT_SPAN.wide, { cols: 4, rows: 1 });
        assert.deepEqual(HOME_SCREEN_SLOT_SPAN.half, { cols: 2, rows: 1 });
        assert.deepEqual(HOME_SCREEN_SLOT_SPAN.panel, { cols: 3, rows: 2 });
        assert.deepEqual(HOME_SCREEN_SLOT_SPAN.tile, { cols: 1, rows: 1 });
    });

    it('el CSS fija una sola rejilla de 4 columnas', () => {
        const css = readFileSync(join(SRC_ROOT, 'app/globals.css'), 'utf8');
        const home =
            css.match(
                /\/\*\n \* HomeScreen[\s\S]*?(?=\n\/\*\n \* DashboardShortcut)/
            )?.[0] ?? '';
        assert.ok(home.length > 0, 'el CSS de HomeScreen está acotado');
        assert.match(home, /grid-template-columns:\s*repeat\(4,/);
        assert.match(home, /grid-auto-rows:\s*var\(--home-row-track\)/);
        assert.match(home, /--home-row-track:\s*calc\(var\(--home-icon-size\) \+ var\(--home-shortcut-label-band\)\)/);
        assert.match(home, /\[data-slot='icon'\][\s\S]*?span 1/);
        assert.match(home, /\[data-slot='small'\][\s\S]*?span 2/);
        assert.match(home, /\[data-slot='medium'\][\s\S]*?span 4/);
        assert.match(home, /\[data-slot='large'\][\s\S]*?span 4/);
        assert.match(home, /\[data-slot='wide'\][\s\S]*?span 4/);
        assert.match(home, /\[data-slot='half'\][\s\S]*?span 2/);
        assert.match(home, /\[data-slot='panel'\][\s\S]*?span 3/);
        assert.match(home, /\[data-slot='tile'\][\s\S]*?span 1/);
        assert.match(home, /\[data-element='body'\][\s\S]*?position:\s*absolute/);
        assert.match(home, /> \[data-element='slot'\] \{[\s\S]*?max-height:\s*100%/);
        assert.match(home, /--home-name-band:\s*calc\(var\(--espacio-1\) \+ var\(--home-name\)\)/);
        assert.match(home, /--home-row-gap:\s*var\(--espacio-4\)/);
        assert.match(
            home,
            /row-gap:\s*var\(--home-row-gap\)/
        );
        assert.doesNotMatch(
            home,
            /row-gap:\s*calc\(var\(--home-name-band\) \+ var\(--home-row-gap\)\)/
        );
        assert.match(
            home,
            /\[data-named='true'\] > \[data-element='body'\][\s\S]*?height:\s*var\(--home-icon-size\)/,
            'tile con etiqueta: el cristal es solo el squircle'
        );
        assert.doesNotMatch(
            home,
            /:not\(\[data-named='true'\]\) > \[data-element='body'\][\s\S]*?bottom:\s*calc\(-1 \* var\(--home-name-band\)\)/,
            'el widget llena la pista; no prolonga el cristal al row-gap'
        );
        assert.doesNotMatch(
            home,
            /--home-row-after-widget-push/,
            'el aire entre filas sale de la pista y del row-gap, no de parches por instancia'
        );
        assert.match(home, /data-layout='ops-admin'/);
        assert.match(home, /data-layout='staff'/);
        assert.match(home, /data-layout='master'/);
        assert.match(
            home,
            /hextras hextras hextras plant[\s\S]*hextras hextras hextras albaranes[\s\S]*cambio1 cambio2 recetas asis[\s\S]*mas mobra stock ingredientes/,
            'H. extras en filas 3–4; Plantilla y Albaranes a la derecha; Cambio 1/2 en la fila de Recetas'
        );
        assert.doesNotMatch(
            home,
            /2 \* var\(--home-icon-size\) \+ var\(--home-row-gap\)/,
            'H. extras ya no va en una pista doble: son dos filas de icono'
        );
        assert.match(
            home,
            /--home-shortcut-label-band:\s*calc\(var\(--espacio-1\) \+ 11px \* 1\.2\)/,
            'franja de nombre de un atajo de una línea'
        );
        assert.doesNotMatch(
            home,
            /dashboard-horas-extras'\][\s\S]*?bottom:\s*calc\(-1 \* var\(--home-shortcut-label-band\)\)/,
            'el panel ocupa dos pistas enteras; no prolonga el cristal'
        );
        assert.match(
            home,
            /grid-template-areas:[\s\S]*hextras hextras hextras plant[\s\S]*hextras hextras hextras albaranes/
        );
        assert.match(
            home,
            /\[data-layout='master'\][\s\S]*grid-template-rows:[\s\S]*repeat\(6, var\(--home-row-track\)\)/,
            'el Master fija sus seis filas en la misma rejilla'
        );
        assert.match(
            home,
            /grid-template-areas:[\s\S]*asis     asis     asis     asis[\s\S]*horario  horario  horario  caja[\s\S]*horario  horario  horario  hextras/,
            'Master: asistencia 4×1 y horarios 3×2 (filas 3–4, columnas 1–3)'
        );
        assert.match(
            home,
            /\[data-instance='master-asistencia'\][\s\S]*month-cal-grid-wrap[\s\S]*border:\s*0/,
            'la semana Master llena el hueco como la de Staff: un solo canto'
        );
        assert.match(
            home,
            /\[data-instance='master-asistencia'\][\s\S]*month-cal-day-clocks span[\s\S]*?font-size:\s*8px/,
            'en el mosaico Master las horas de fichaje bajan un punto'
        );
        assert.match(
            home,
            /\[data-instance='master-asistencia'\][\s\S]*month-cal-weeks > \[data-week-footer\][\s\S]*?font-size:\s*7px/,
            'en el mosaico Master los conceptos del pie bajan un punto'
        );
        assert.match(
            home,
            /\[data-instance='master-asistencia'\] > \[data-element='body'\] \{[\s\S]*?background:\s*var\(--color-superficie\)/,
            'la semana Master es papel blanco, no cristal'
        );
        assert.match(
            home,
            /\[data-instance='dashboard-caja-cambio-1'\][\s\S]*grid-area:\s*cambio1/
        );
        assert.match(
            home,
            /\[data-instance='staff-semana'\][\s\S]*month-cal-grid-wrap[\s\S]*border:\s*0/,
            'la semana Staff llena el hueco: un solo canto, sin tarjeta interior'
        );
        assert.match(
            home,
            /\[data-instance='staff-semana'\] \[data-week-summary\] \.month-cal-grid-wrap > \.grid\.shrink-0[\s\S]*?height:\s*13px/,
            'en el mosaico Staff la franja L–D es más baja'
        );
        assert.match(
            home,
            /\[data-instance='staff-semana'\] \[data-week-summary\] \.month-cal-day-clocks span[\s\S]*?font-size:\s*8px/,
            'en el mosaico Staff las horas de fichaje bajan un punto'
        );
        assert.match(
            home,
            /\[data-instance='staff-semana'\] \[data-week-summary\] \.month-cal-weeks > \[data-week-footer\][\s\S]*?font-size:\s*7px/,
            'en el mosaico Staff los conceptos del pie bajan un punto'
        );
        assert.doesNotMatch(home, /--week-scale/);
        assert.doesNotMatch(
            home,
            /número del día va en flujo/,
            'el número no se saca al flujo: cubría los relojes'
        );
        assert.match(
            home,
            /\[data-instance='staff-semana'\] > \[data-element='body'\] \{[\s\S]*?background:\s*var\(--color-superficie\)/,
            'la semana Staff es papel blanco, no cristal'
        );
        assert.match(
            home,
            /\[data-week-summary\][\s\S]*month-cal-day-totals > div \{[\s\S]*?height:\s*10px[\s\S]*?font-size:\s*7px/,
            'H y Ex del resumen de persona son los del mosaico Staff'
        );
        assert.match(
            home,
            /\[data-week-summary\][\s\S]*\[data-week-footer\]:not\(\[data-overrides='true'\]\) \{[\s\S]*?height:\s*20px/,
            'el pie del resumen de persona es el del mosaico Staff'
        );
        assert.match(
            home,
            /\[data-week-summary\][\s\S]*grid.shrink-0 > div \{[\s\S]*?linear-gradient\(to bottom, #ef4444, #dc2626\)/,
            'L–D del resumen de persona es la franja roja del mosaico'
        );
        assert.match(
            home,
            /\[data-week-summary\][\s\S]*month-cal-cell > span:first-of-type[\s\S]*font-size:\s*7px[\s\S]*font-weight:\s*400/,
            'el número del día del resumen es el del mosaico'
        );
        assert.match(
            home,
            /\[data-stacked='true'\] \[data-week-divider\] \{[\s\S]*?linear-gradient\(\s*to right,[\s\S]*?#dc2626[\s\S]*?var\(--color-borde\)/,
            'la raya entre semanas se difumina a gris en los extremos'
        );
        assert.match(
            home,
            /\[data-stacked='true'\][\s\S]*overflow:\s*hidden/,
            'varias semanas recortan el radio en la última'
        );
        assert.match(
            home,
            /\[data-layout='staff'\][\s\S]*grid-template-rows:[\s\S]*repeat\(6, var\(--home-row-track\)\)/
        );
        assert.match(
            home,
            /grid-template-areas:[\s\S]*semana   semana   semana   semana[\s\S]*horarios horarios horarios fichaje[\s\S]*horarios horarios horarios albaranes[\s\S]*recetas  pedidos cambio  propinas[\s\S]*compra   carta     reservas cierre[\s\S]*prov     invent    info     web/
        );
        assert.match(
            home,
            /--home-widget-fill:\s*rgb\(255 255 255 \/ 0\.62\)/,
            'el widget es material de sistema, no papel #fff ni leche 76 %'
        );
        assert.match(
            home,
            /--home-widget-radius:\s*var\(--radio-superficie\)/,
            'el radio del widget deriva de radio.superficie; PageScreen no cambia'
        );
        assert.match(
            home,
            /--home-widget-fallback:\s*color-mix\(in srgb, white 72%, var\(--home-wallpaper\)\)/,
            'sin blur, el fallback toma el wallpaper, no la marca'
        );
        assert.match(
            home,
            /--home-wallpaper:\s*var\(--color-envolvente\)/,
            'el cristal se tiñe del envolvente'
        );
        assert.match(css, /--color-envolvente:\s*#15345c/);
        assert.match(css, /--color-envolvente-alto:\s*#2a5a96/);
        assert.match(css, /--color-envolvente-bajo:\s*#0b1c36/);
        assert.match(
            home,
            /\[data-widget-scheme='dark'\][\s\S]*?--home-widget-fill:\s*var\(--chrome-glass-fill\)/,
            'el cristal oscuro reutiliza el material del chrome'
        );
        assert.match(
            home,
            /\[data-element='slot'\]:not\(\[data-slot='icon'\]\)::before[\s\S]*?background:\s*var\(--color-envolvente-bajo\)/,
            'detrás del cristal va el mismo marino que había detrás de Caja cambio 2'
        );
        assert.match(
            home,
            /:is\(\.bg-white[\s\S]*?background-color:\s*transparent/,
            'las celdas de papel no tapan el cristal'
        );
        assert.match(
            home,
            /\[data-widget-scheme='dark'\][\s\S]*?--home-widget-ink-secondary:\s*var\(--color-texto-invertido\)/,
            'en oscuro el contenido del widget es blanco, no gris al 62 %'
        );
        assert.match(
            home,
            /\[data-widget-scheme='dark'\] > \[data-element='slot'\]:not\(\[data-instance='staff-semana'\], \[data-instance='master-asistencia'\]\) > \[data-element='body'\] \* \{[\s\S]*?color:\s*var\(--color-texto-invertido\)/,
            'zinc, marca y azules no sobreviven: el cuerpo y sus descendientes son blanco'
        );
        assert.match(
            home,
            /:is\(\.shadow-lg, \.shadow-2xl\)\.bg-white \* \{[\s\S]*?color:\s*unset/,
            'los popovers de papel recuperan su tinta'
        );
        assert.match(
            home,
            /\[data-element='slot'\]:not\(\[data-slot='icon'\]\)::before[\s\S]*?box-shadow:\s*none/,
            'la placa de detrás no dibuja un segundo canto'
        );
        assert.match(
            home,
            /> \[data-element='body'\] \{[\s\S]*?border:\s*0/,
            'el cuerpo no lleva borde: el canto es la hairline del cristal'
        );
        assert.match(
            home,
            /--home-widget-ink-secondary/,
            'el contenido secundario usa la tinta del cristal, no zinc opaco'
        );
        assert.match(
            home,
            /-webkit-backdrop-filter:\s*saturate\(var\(--home-widget-saturate\)\) blur\(var\(--home-widget-blur\)\)/
        );
        assert.match(
            home,
            /backdrop-filter:\s*saturate\(var\(--home-widget-saturate\)\) blur\(var\(--home-widget-blur\)\)/
        );
        assert.match(
            home,
            /> \[data-element='body'\] > \[data-component='Surface'\][\s\S]*background:\s*transparent/,
            'Surface dentro del widget no tapa el material'
        );
        assert.doesNotMatch(
            home,
            /--home-rim-shine/,
            'el widget no usa la placa de 2 px del icono'
        );
        assert.doesNotMatch(
            home,
            /:has\(> \[data-component='Surface'\]\)[\s\S]*padding:\s*2px/,
            'el widget no lleva el canto dibujado como placa'
        );
        assert.doesNotMatch(
            home,
            /> \[data-element='body'\] > \[data-element='rim'\]/,
            'el hilo inset no se pinta en el cuerpo del widget'
        );
        assert.doesNotMatch(home, /grid-cols-7|grid-cols-8/);
    });

    it('Staff, Admin y Master montan la misma HomeScreen', () => {
        const staff = readFileSync(
            join(SRC_ROOT, 'components/dashboards/StaffDashboardView.tsx'),
            'utf8'
        );
        const admin = readFileSync(
            join(SRC_ROOT, 'components/dashboards/AdminDashboardView.tsx'),
            'utf8'
        );
        const master = readFileSync(
            join(SRC_ROOT, 'components/dashboards/MasterDashboardView.tsx'),
            'utf8'
        );
        const grid = readFileSync(
            join(SRC_ROOT, 'components/dashboards/MasterShortcutGrid.tsx'),
            'utf8'
        );
        for (const [name, source] of [
            ['staff', staff],
            ['admin', admin],
            ['master', master],
        ] as const) {
            assert.match(
                source,
                name === 'admin' ? /<OpsHomeScreen/ : /<HomeScreen/,
                `${name} monta la rejilla de inicio`
            );
            assert.doesNotMatch(source, /md:grid-cols-7|lg:grid-cols-8/, `${name} no cambia de columnas`);
            assert.doesNotMatch(source, /max-w-6xl/, `${name} no ensancha el lienzo`);
        }
        const slot = readFileSync(
            join(SRC_ROOT, 'components/dashboards/HomeScreen.tsx'),
            'utf8'
        );
        const shortcut = readFileSync(
            join(SRC_ROOT, 'components/dashboards/DashboardShortcut.tsx'),
            'utf8'
        );
        assert.match(slot, /data-named=\{label \? 'true' : undefined\}/);
        assert.match(
            slot,
            /data-widget-scheme/,
            'el mosaico elige cristal claro u oscuro según el wallpaper'
        );
        assert.match(slot, /resolveHomeWidgetScheme/);
        assert.doesNotMatch(
            slot,
            /data-element="rim"/,
            'el slot de widget no pinta el hilo del icono'
        );
        assert.match(
            shortcut,
            /data-element="rim"/,
            'el icono conserva el hilo'
        );
        const ops = readFileSync(
            join(SRC_ROOT, 'components/dashboards/OpsHomeScreen.tsx'),
            'utf8'
        );
        const weekWidget = readFileSync(
            join(SRC_ROOT, 'components/dashboards/staff/StaffAttendanceSummaryWidget.tsx'),
            'utf8'
        );
        assert.match(staff, /layout="staff"/);
        assert.match(staff, /size="wide" instance="staff-semana"/);
        assert.match(staff, /<StaffAttendanceSummaryWidget/);
        assert.doesNotMatch(staff, /instance="staff-semana"[^>]*label=/);
        assert.match(staff, /size="icon" instance="staff-fichaje"/);
        assert.match(staff, /label="Entrada"/);
        assert.match(staff, /size="panel" instance="staff-horarios"/);
        assert.match(staff, /<StaffWeekScheduleBlock/);
        assert.doesNotMatch(staff, /instance="staff-horarios"[^>]*label=/);
        assert.match(weekWidget, /data-fit="week"/);
        assert.match(weekWidget, /<WeekSummary/);
        assert.match(staff, /instance="staff-albaranes"/);
        assert.match(staff, /instance="staff-cambio"/);
        assert.match(admin, /<OpsHomeScreen/);
        assert.match(master, /<HomeScreen/);
        assert.doesNotMatch(master, /<OpsHomeScreen/);
        assert.doesNotMatch(master, /CajaInicialWidget|CajaCambioWidget/);
        assert.match(master, /layout="master"/);
        assert.match(master, /size="wide" instance="dashboard-ventas"/);
        assert.match(master, /size="wide" instance="master-asistencia"/);
        assert.match(master, /<MasterPlantillaAttendanceWidget/);
        assert.match(master, /size="panel" instance="master-horarios"/);
        assert.match(master, /<StaffWeekScheduleBlock/);
        assert.match(grid, /size=\{size\} instance=\{key\} label=\{label\}/);
        assert.match(grid, /size: 'tile'[\s\S]*label: 'H\. extras'/);
        assert.match(grid, /label: 'Cajas Cambio'/);
        assert.match(grid, /<MasterCajasCambioWidget/);
        assert.match(grid, /<MasterOvertimeIconWidget/);
        assert.match(grid, /label="Otros"/);
        assert.doesNotMatch(grid, /label="Proveedores"/);
        assert.doesNotMatch(grid, /label="Asistencia"/);
        assert.doesNotMatch(grid, /label="Recetas"/);
        assert.doesNotMatch(grid, /label="Web"/);
        assert.doesNotMatch(grid, /label="Carta"/);
        assert.match(
            grid,
            /<MasterOvertimeIconWidget[\s\S]*monthLabel=\{overtimeMonthLabel\}/,
            'H. extras monta el widget del mes'
        );
        assert.match(
            grid,
            /getISOWeek\(new Date\(week\.weekId\)\)[\s\S]*<X /,
            'H. extras muestra semana, importe y estado de pago'
        );
        assert.doesNotMatch(grid, /md:grid-cols-7|lg:grid-cols-8/);
        assert.match(ops, /layout="ops-admin"/);
        assert.match(ops, /size="wide" instance="dashboard-ventas"/);
        assert.match(ops, /size="wide" instance="dashboard-caja-inicial"/);
        assert.match(ops, /size="panel" instance="dashboard-horas-extras"/);
        assert.doesNotMatch(ops, /label="H\. extras"/);
        assert.doesNotMatch(ops, /instance="dashboard-horas-extras"[^>]*label=/);
        assert.match(ops, /size="icon" instance="admin-recetas"/);
        assert.match(ops, /size="icon" instance="admin-albaranes"/);
        assert.match(ops, /size="tile" instance="dashboard-caja-cambio-1" label="Cambio 1"/);
        assert.match(ops, /size="tile" instance="dashboard-caja-cambio-2" label="Cambio 2"/);
        assert.match(ops, /size="icon" instance="admin-mas-funciones"/);
        assert.match(ops, /size="icon" instance="admin-ingredientes"/);
        assert.match(
            ops,
            /dashboard-horas-extras[\s\S]*admin-plantilla[\s\S]*admin-albaranes[\s\S]*dashboard-caja-cambio-1[\s\S]*admin-recetas[\s\S]*admin-mas-funciones/,
            'H. extras en 3–4; Plantilla y Albaranes a la derecha; Cambio 1/2 con Recetas; Otros en última fila'
        );
    });

    it('el cristal es claro sobre cielo y oscuro sobre el petróleo actual', () => {
        assert.equal(resolveHomeWidgetScheme('#5B8FB9'), 'light');
        assert.equal(resolveHomeWidgetScheme('#7eb0d4'), 'light');
        assert.equal(resolveHomeWidgetScheme('#15345C'), 'dark');
        assert.equal(resolveHomeWidgetScheme('#0E1A2C'), 'dark');
        assert.equal(resolveHomeWidgetScheme('#1B2A44'), 'dark');
        assert.equal(resolveHomeWidgetScheme('#241E36'), 'dark');
        assert.equal(resolveHomeWidgetScheme('#2E1260'), 'dark');
        assert.equal(resolveHomeWidgetScheme('#2C3A58'), 'dark');
        assert.equal(resolveHomeWidgetScheme('#2A4A56'), 'dark');
        assert.equal(resolveHomeWidgetScheme('#12141a'), 'dark');
        assert.equal(resolveHomeWidgetScheme('rgb(18, 20, 26)'), 'dark');
        assert.equal(resolveHomeWidgetScheme('#5B8FB9', { prefersDark: true }), 'dark');
    });
});
