import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';
import {
    PAGE_SCREEN_COMPONENT_ID,
    PAGE_SCREEN_FORBIDDEN_RADIUS,
} from './page-screen.ts';
import { SURFACE_COMPONENT_ID } from './surface.ts';
import { FIELD_COMPONENT_ID } from './field.ts';
import { SEARCH_FIELD_COMPONENT_ID } from './search-field.ts';
import { EMPTY_STATE_COMPONENT_ID } from './empty-state.ts';
import { NOTICE_COMPONENT_ID } from './notice.ts';
import { KPI_STAT_COMPONENT_ID } from './kpi-stat.ts';
import { TABLE_COMPONENT_ID } from './table.ts';

const REPO_ROOT = process.cwd();
const SRC_ROOT = join(REPO_ROOT, 'src');

function toPosix(p: string): string {
    return p.replace(/\\/g, '/');
}

function listSourceFiles(dir: string, acc: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        if (['node_modules', '.next', '.git'].includes(name)) continue;
        const full = join(dir, name);
        const st = statSync(full);
        if (st.isDirectory()) listSourceFiles(full, acc);
        else if (/\.tsx?$/.test(name) && !name.endsWith('.test.ts') && !name.endsWith('.test.tsx')) {
            acc.push(full);
        }
    }
    return acc;
}

describe('Jerarquía visual canónica (ADR-0010)', () => {
    it('exporta identidades estables', () => {
        assert.equal(PAGE_SCREEN_COMPONENT_ID, 'PageScreen');
        assert.equal(SURFACE_COMPONENT_ID, 'Surface');
        assert.equal(FIELD_COMPONENT_ID, 'Field');
        assert.equal(SEARCH_FIELD_COMPONENT_ID, 'SearchField');
        assert.equal(EMPTY_STATE_COMPONENT_ID, 'EmptyState');
        assert.equal(NOTICE_COMPONENT_ID, 'Notice');
        assert.equal(KPI_STAT_COMPONENT_ID, 'KpiStat');
        assert.equal(TABLE_COMPONENT_ID, 'Table');
        assert.equal(PAGE_SCREEN_FORBIDDEN_RADIUS, 'rounded-[2.5rem]');
    });

    it('CSS fija Surface, PageScreen, Field, EmptyState, Notice y KpiStat', () => {
        const css = readFileSync(join(SRC_ROOT, 'app/globals.css'), 'utf8');
        assert.match(css, /\[data-component='Surface'\]\[data-variant='page'\]/);
        assert.match(css, /--elevacion-pagina/);
        assert.match(
            css,
            /--marbella-shell-image:/,
            'el degradado del envolvente es un solo token reutilizable'
        );
        assert.match(
            css,
            /\.bg-marbella-shell::before \{[\s\S]*?position:\s*fixed;/,
            'el wallpaper del shell va en capa fija al viewport, no estirada con el scroll'
        );
        assert.doesNotMatch(
            css,
            /\.bg-marbella-shell \{[\s\S]*?background-attachment:\s*fixed/,
            'no se usa background-attachment: fixed en el shell (falla en iOS)'
        );
        assert.match(css, /\[data-component='PageScreen'\] \[data-element='header'\]/);
        assert.match(
            css,
            /\[data-component='PageScreen'\] \{[\s\S]*?width:\s*100%;[\s\S]*?padding-inline:\s*var\(--espacio-2\);/,
            'PageScreen móvil: ancho del dispositivo y el mismo margen a ambos lados'
        );
        assert.match(
            css,
            /\[data-component='PageScreen'\] \{[\s\S]*?overflow-x:\s*clip;/,
            'el contenido no empuja la tarjeta fuera del margen derecho'
        );
        assert.match(
            css,
            /\[data-component='PageScreen'\] \{[\s\S]*?padding-bottom:\s*var\(--espacio-2\)/,
            'PageScreen abraza el contenido: el aire inferior es el de los lados, no un hueco de pie'
        );
        assert.match(
            css,
            /\[data-component='PageScreen'\]\[data-fill-viewport='true'\] \{[\s\S]*?padding-bottom:\s*calc\(var\(--shell-bottom-inset\) \+ var\(--espacio-2\)/,
            'solo los editores a viewport reservan el pie de navegación'
        );
        assert.match(
            css,
            /\[data-component='PageScreen'\] \[data-element='body'\] \{[\s\S]*?padding-top:\s*var\(--espacio-2\)/,
            'el papel deja un aire ligero encima del trabajo'
        );
        assert.match(
            css,
            /\[data-component='PageScreen'\] \[data-element='header'\] \{[\s\S]*?background-color:\s*transparent/,
            'la cabecera de página flota, no es franja de marca'
        );
        assert.match(
            css,
            /\[data-component='PageScreen'\] \[data-element='title'\] \{[\s\S]*?color:\s*var\(--color-texto-invertido\)/,
            'el título de página es tinta invertida sobre el envolvente'
        );
        assert.match(
            css,
            /\[data-component='PageScreen'\] \[data-element='chrome'\]/,
            'el cromo de PageScreen vive fuera del papel'
        );
        assert.match(
            css,
            /\[data-component='PageScreen'\] \[data-element='toolbar'\]\[data-pin='true'\]/,
            'el buscador de PageScreen se clava arriba al scrollear hacia arriba'
        );
        assert.match(
            css,
            /\.marbella-fixed-topbar\[data-hidden='true'\]/,
            'la cabecera fija se oculta al scrollear'
        );
        assert.match(
            css,
            /\[data-component='PageScreen'\]\[data-work='calendar'\] \[data-component='Surface'\]\[data-variant='page'\]/,
            'el calendario de PageScreen no lleva ficha alrededor: Surface transparente'
        );
        assert.match(
            css,
            /\[data-component='PageScreen'\] \[data-component='Table'\] thead th \{[\s\S]*?--color-texto-invertido\)/,
            'la tabla de PageScreen usa cabecera cromo como recipe-panel'
        );
        assert.match(
            css,
            /\[data-component='PageScreen'\]\[data-work='calendar'\] \.month-cal-grid-wrap,[\s\S]*?0 0 0 1px rgb\(255 255 255 \/ 0\.18\)/,
            'calendario y tabla usan el canto de widget'
        );
        assert.doesNotMatch(
            css,
            /\[data-paper='false'\]/,
            'PageScreen no apaga el papel: el catálogo es trabajo'
        );
        {
            const titleRule = css.match(
                /\[data-component='PageScreen'\] \[data-element='title'\] \{([^}]+)\}/
            );
            assert.ok(titleRule, 'falta la regla del título de PageScreen');
            assert.doesNotMatch(
                titleRule[1],
                /text-overflow:\s*ellipsis/,
                'el título de cabecera no se abrevia con puntos'
            );
            assert.match(titleRule[1], /text-transform:\s*uppercase/, 'el título de pantalla lleva mayúsculas');
        }
        assert.match(
            css,
            /\[data-component='PageScreen'\] \[data-element='title-block'\] \[data-element='title'\] \{[\s\S]*?font-size:\s*clamp\(/,
            'el título de cabecera se reduce para caber'
        );
        {
            const greetingRule = css.match(
                /\.marbella-fixed-topbar \[data-element='greeting'\] \{([^}]+)\}/
            );
            assert.ok(greetingRule, 'falta la regla del saludo de la barra de la app');
            assert.match(greetingRule[1], /text-transform:\s*none/, 'el saludo no va en mayúsculas');
            assert.doesNotMatch(
                greetingRule[1],
                /text-overflow:\s*ellipsis/,
                'el saludo no se abrevia con puntos'
            );
        }
        assert.match(
            css,
            /\.marbella-fixed-topbar \[data-element='greeting-block'\] \[data-element='greeting'\] \{[\s\S]*?font-size:\s*clamp\(/,
            'el saludo de la barra se reduce para caber'
        );
        assert.match(
            css,
            /--app-navbar-height:\s*40px/,
            'la barra visible es más compacta que el táctil mínimo'
        );
        assert.match(
            css,
            /\.h-header-safe \{[\s\S]*?var\(--app-navbar-height\)/,
            'el alto visible de la barra usa app-navbar-height'
        );
        assert.match(
            css,
            /\.pt-header-safe \{[\s\S]*?var\(--estructura-cabecera\)/,
            'el contenido reserva el hueco de cabecera'
        );
        assert.match(css, /--estructura-cabecera:\s*48px/);
        assert.match(css, /--estructura-barra-inferior:\s*49px/);
        assert.match(css, /--shell-sidebar-width:\s*0px/, 'sidebar desktop arranca a 0 en smartphone');
        assert.match(
            css,
            /@media \(min-width: 1024px\) \{[\s\S]*?--shell-sidebar-width:\s*5\.5rem/,
            'en desktop el TabBar pasa a sidebar'
        );
        assert.match(
            css,
            /@media \(min-width: 1024px\) \{[\s\S]*?\[data-component='TabBar'\]\.marbella-fixed-bottombar[\s\S]*?flex-direction:\s*column/,
            'TabBar desktop es columna lateral'
        );
        assert.match(
            css,
            /\[data-component='TabBar'\]\.marbella-fixed-bottombar \{[\s\S]*?border-radius:\s*999px/,
            'el tab bar es una cápsula flotante, no una losa a sangre'
        );
        assert.match(
            css,
            /\[data-component='TabBar'\]\.marbella-fixed-bottombar \{[\s\S]*?bottom:\s*calc\(env\(safe-area-inset-bottom/,
            'flota sobre el home indicator, no se pega al borde'
        );
        assert.match(
            css,
            /\[data-component='TabBar'\]\.marbella-fixed-bottombar \{[\s\S]*?height:\s*var\(--estructura-barra-inferior\)/,
            'la cápsula mide 49 pt; el área segura queda fuera'
        );
        assert.match(
            css,
            /\[data-component='TabBar'\]\.marbella-fixed-bottombar \{[\s\S]*?background-color:\s*color-mix\(in srgb, var\(--color-envolvente-bajo\) 55%, transparent\)/,
            'la cápsula es cristal del envolvente, no una losa opaca'
        );
        assert.match(
            css,
            /\[data-component='TabBar'\] \[data-element='icon'\] \{[\s\S]*?width:\s*25px/,
            'el icono del tab bar es 25 pt'
        );
        assert.match(
            css,
            /\[data-component='TabBar'\] \[data-element='label'\] \{[\s\S]*?font-size:\s*10px/,
            'la etiqueta del tab bar es 10 pt, no mayúsculas black'
        );
        {
            const tabbar = readFileSync(join(SRC_ROOT, 'components/StaffBottomNav.tsx'), 'utf8');
            assert.match(tabbar, /data-component="TabBar"/);
            assert.match(tabbar, /data-mode=\{tabMode\}/, 'el tab bar tiene paso compacto de solo iconos');
            assert.match(tabbar, /data-hidden=\{hidden/, 'el tab bar se oculta al hacer scroll hacia abajo');
            assert.doesNotMatch(tabbar, /uppercase/);
            assert.doesNotMatch(tabbar, /scale-110/);
            assert.doesNotMatch(tabbar, /drop-shadow-md/);
        }
        assert.match(
            css,
            /\[data-component='TabBar'\]\[data-hidden='true'\] \{[\s\S]*?translateY\(/,
            'al ocultarse el tab bar baja del viewport'
        );
        assert.match(
            css,
            /\[data-component='TabBar'\]\[data-mode='compact'\] \[data-element='label'\]/,
            'el paso compacto oculta el nombre y deja el icono'
        );
        {
            const navbar = readFileSync(join(SRC_ROOT, 'components/Navbar.tsx'), 'utf8');
            assert.match(navbar, /data-hidden=\{topHidden/, 'la cabecera superior se oculta al scrollear');
            assert.match(navbar, /data-element="greeting"/, 'el saludo de la barra tiene identidad');
            assert.match(navbar, /data-element="logo"/, 'el logo de la barra tiene identidad');
            assert.match(navbar, /<ReservationsBell \/>/, 'reservas van en la barra');
            assert.match(navbar, /<NotificationsBell \/>/, 'notificaciones van en la barra');
            assert.match(
                navbar,
                /ml-auto[\s\S]*<ReservationsBell \/>[\s\S]*<NotificationsBell \/>/,
                'reservas y notificaciones van a la derecha'
            );
            assert.doesNotMatch(navbar, /id="ia-button"|data-chrome="ia"|toggleChat/, 'la barra no lleva IA');
            assert.doesNotMatch(navbar, /aria-label="Herramientas internas"|pgMenuOpen|>\s*PG\s*</, 'la barra no lleva PG');
            assert.doesNotMatch(
                navbar,
                /Hola,[\s\S]{0,80}uppercase/,
                'el saludo de la barra no se pinta en mayúsculas'
            );
        }
        assert.match(
            css,
            /\[data-component='Field'\] \[data-element='label'\] \{[\s\S]*?text-transform:\s*none/,
            'las etiquetas de dato no van en mayúsculas'
        );
        assert.match(
            css,
            /\[data-component='KpiStat'\] \[data-element='label'\] \{[\s\S]*?text-transform:\s*none/,
            'la etiqueta de KPI no va en mayúsculas'
        );
        assert.match(css, /\[data-component='SearchField'\]/);
        assert.match(css, /\[data-component='EmptyState'\]/);
        assert.match(
            css,
            /\[data-component='EmptyState'\] \[data-element='title'\] \{[\s\S]*?font-size:\s*12px;[\s\S]*?text-transform:\s*none;[\s\S]*?color:\s*var\(--color-texto-tenue\)/,
            'el vacío es gris, pequeño y sin mayúsculas'
        );
        assert.match(css, /\[data-component='Notice'\]\[data-variant='negative'\]/);
        assert.match(css, /\[data-component='KpiStat'\]/);
        assert.match(
            css,
            /\[data-component='KpiStat'\] \[data-element='value'\] \{[\s\S]*?min-height:\s*1\.125rem/,
            'sin cifra, el hueco de KpiStat no colapsa'
        );
        assert.match(
            css,
            /\[data-instance='dashboard-ventas'\] \[data-component='KpiStat'\] \[data-element='value'\] \{[\s\S]*?font-size:\s*11px;[\s\S]*?font-weight:\s*400/,
            'en el mosaico de Ventas la cifra es 11 px regular'
        );
        assert.match(
            css,
            /\[data-instance='dashboard-ventas'\] \[data-component='KpiStat'\] \[data-element='label'\] \{[\s\S]*?font-size:\s*8px;[\s\S]*?font-weight:\s*400/,
            'en el mosaico de Ventas el concepto es 8 px regular'
        );
        assert.match(css, /\[data-component='Table'\] thead/);
        assert.match(
            css,
            /\[data-component='Table'\] \{[\s\S]*?table-layout:\s*fixed/,
            'tablas operativas caben en el ancho sin scroll'
        );
        assert.match(
            css,
            /\[data-component='Table'\] thead th \{[\s\S]*?font-size:\s*8px/,
            'cabecera de tabla compacta'
        );
        assert.match(css, /\[data-element='block-header'\]/);
        assert.match(css, /min-height:\s*var\(--tactil-minimo\)/);
        assert.match(css, /--espacio-8/);
        assert.match(
            css,
            /\[data-component='PageScreen'\] \[data-element='header'\] \[data-component='Button'\]\[data-variant='tertiary'\]/
        );
        assert.match(
            css,
            /\[data-component='Surface'\]\[data-variant='page'\] > \[data-element='header'\]/
        );
        assert.doesNotMatch(css, /\[data-compact='true'\]/);
    });

    it('DashboardShortcut separa icono y nombre con la misma forma', () => {
        const css = readFileSync(join(SRC_ROOT, 'app/globals.css'), 'utf8');
        const shortcut = readFileSync(
            join(SRC_ROOT, 'components/dashboards/DashboardShortcut.tsx'),
            'utf8'
        );
        const staff = readFileSync(
            join(SRC_ROOT, 'components/dashboards/StaffDashboardView.tsx'),
            'utf8'
        );
        const admin = readFileSync(
            join(SRC_ROOT, 'components/dashboards/AdminDashboardView.tsx'),
            'utf8'
        );
        const master = readFileSync(
            join(SRC_ROOT, 'components/dashboards/MasterShortcutGrid.tsx'),
            'utf8'
        );
        const masterView = readFileSync(
            join(SRC_ROOT, 'components/dashboards/MasterDashboardView.tsx'),
            'utf8'
        );
        assert.match(shortcut, /variant = 'icon-card-text-outside'/);
        assert.match(
            css,
            /\[data-component='DashboardShortcut'\]\[data-variant='icon-card-text-outside'\] \[data-element='iconBox'\] \{[\s\S]*?border-radius:\s*var\(--radio-superficie\)/,
            'todos los iconos comparten radio.superficie'
        );
        assert.match(css, /\[data-plate='fill'\] \[data-element='iconBox'\]/);
        assert.match(css, /\[data-plate='bleed'\] \[data-element='iconBox'\]/);
        const shortcutCss =
            css.match(
                /\/\*\n \* DashboardShortcut[\s\S]*?(?=\n\/\*\n \* DocumentListRow)/
            )?.[0] ?? '';
        assert.ok(shortcutCss.length > 0, 'el CSS del atajo está acotado');
        assert.doesNotMatch(shortcutCss, /clip-path:/);
        assert.doesNotMatch(shortcutCss, /mix-blend-mode:/);
        assert.match(
            css,
            /\[data-plate='fill'\] \[data-element='iconBox'\] \{[\s\S]*?background-color:\s*var\(--shortcut-fill/,
            'el relleno pinta el fondo del recuadro'
        );
        assert.match(
            css,
            /\[data-element='iconBox'\] \{[\s\S]*?mask-image:\s*var\(--shortcut-silhouette\)/,
            'todos los atajos se recortan a la misma silueta'
        );
        assert.match(
            css,
            /\[data-element='asset'\] img \{[\s\S]*?object-fit:\s*contain/,
            'la imagen del atajo se ve entera'
        );
        assert.match(
            css,
            /\[data-plate='bleed'\] \[data-element='asset'\] img \{[\s\S]*?object-fit:\s*cover/,
            'sin relleno, el gráfico llena el recorte del sistema'
        );
        assert.match(
            css,
            /\[data-plate='bleed'\] \[data-element='asset'\] img \{[\s\S]*?width:\s*100%/,
            'Recetas, Consumo y Asistencia llenan el recorte sin zoom'
        );
        assert.doesNotMatch(css, /\[data-fit='frame'\]/, 'no hay zoom genérico');
        assert.match(
            css,
            /\[data-instance='staff-info'\] \[data-element='asset'\] img \{[\s\S]*?width:\s*112%/,
            'Info: mínimo para tocar el recorte'
        );
        assert.match(
            css,
            /\[data-instance='carta'\][\s\S]*?width:\s*112%/,
            'Carta: el gráfico llega al canto, como Info'
        );
        assert.match(
            css,
            /\[data-instance='staff-carta'\][\s\S]*?width:\s*112%/,
            'Carta staff: mismo recorte que Master'
        );
        assert.match(
            css,
            /\[data-instance='staff-pedidos'\][\s\S]*?width:\s*130%/,
            'Pedidos staff: el gráfico toca el recorte sin hueco'
        );
        assert.match(
            css,
            /\[data-instance='staff-albaranes'\][\s\S]*?width:\s*132%/,
            'Albaranes staff: el gráfico toca el recorte sin hueco'
        );
        assert.match(
            css,
            /\[data-instance='albaranes'\][\s\S]*?width:\s*132%/,
            'Albaranes: mínimo para tocar el recorte'
        );
        assert.match(
            css,
            /\[data-instance='ingredientes'\] \[data-element='asset'\] img \{[\s\S]*?width:\s*127%/,
            'Ingredientes: mínimo para tocar el recorte'
        );
        assert.match(
            css,
            /\[data-instance='horarios'\] \[data-element='asset'\] img \{[\s\S]*?width:\s*146%/,
            'Horarios: mínimo para tocar el recorte'
        );
        assert.match(
            css,
            /\[data-instance='recetas'\][\s\S]*?background-color:\s*rgb\(231 16 31\)/,
            'Recetas conserva el recuadro que ya estaba bien'
        );
        assert.match(
            css,
            /\[data-instance='admin-asistencia'\][\s\S]*?background-color:\s*#fff/,
            'Asistencia conserva el recuadro que ya estaba bien'
        );
        assert.match(
            css,
            /\[data-plate='bleed'\] \[data-element='rim'\] \{[\s\S]*?linear-gradient/,
            'sin relleno, el canto se sienta sobre el gráfico recortado'
        );
        assert.doesNotMatch(
            css,
            /\[data-plate='bleed'\] \[data-element='asset'\] img \{[\s\S]*?transform:\s*scale/,
            'el acercamiento es tamaño del recorte, no un zoom aparte'
        );
        assert.match(staff, /<HomeScreen/);
        assert.match(admin, /<OpsHomeScreen/);
        assert.match(masterView, /<HomeScreen/);
        assert.doesNotMatch(masterView, /<OpsHomeScreen/);
        assert.match(master, /size: 'tile'[\s\S]*label: 'H\. extras'/);
        assert.doesNotMatch(master, /instance="hextras"[\s\S]*?plate/);
        assert.match(master, /instance="uso-app"[\s\S]*?img="\/icons\/uso\.png"/);
        assert.doesNotMatch(master, /instance="uso-app"[^>]*plate/);
        assert.match(
            css,
            /\[data-plate='fill'\] \[data-element='rim'\] \{[\s\S]*?linear-gradient/,
            'con relleno, el canto es el mismo brillo que sin relleno'
        );
        assert.match(shortcut, /data-element="rim"/);
        assert.match(
            css,
            /\[data-element='text'\] \{[\s\S]*?color:\s*var\(--color-texto-invertido\)/,
            'el nombre va fuera del icono, en invertido sobre el petróleo'
        );
        assert.doesNotMatch(staff, /instance="staff-caja"/);
        assert.match(staff, /instance="staff-pedidos"/);
        assert.match(staff, /instance="staff-compra"/);
        assert.match(staff, /instance="staff-propinas"/);
        assert.match(staff, /instance="staff-carta"/);
        assert.match(staff, /instance="staff-reservas"/);
        assert.match(staff, /instance="staff-cierre"/);
        assert.match(staff, /instance="staff-proveedores"/);
        assert.match(staff, /instance="staff-inventario"/);
        assert.doesNotMatch(staff, /instance="staff-stock"/);
        assert.match(staff, /instance="staff-recetas"/);
        assert.doesNotMatch(staff, /instance="staff-recetas"[^>]*plate/);
        assert.doesNotMatch(staff, /instance="staff-info"[^>]*plate/);
        assert.doesNotMatch(shortcut, /\bframe\?:/);
        assert.doesNotMatch(master, /\bframe\b/);
        assert.doesNotMatch(staff, /instance="staff-recetas"[^>]*frame/);
        assert.doesNotMatch(master, /instance="horarios"[\s\S]{0,80}plate/);
        assert.doesNotMatch(admin, /instance: 'admin-stock'[\s\S]{0,40}plate/);
        assert.doesNotMatch(admin, /plate: true/);
        assert.doesNotMatch(admin, /instance: 'admin-plantilla', plate/);
        assert.doesNotMatch(admin, /instance: 'admin-m-obra', plate/);
        assert.doesNotMatch(master, /img="\/icons\/change\.png"\s+plate/);
        assert.doesNotMatch(master, /img="\/icons\/tip\.png"\s+plate/);
        assert.doesNotMatch(master, /img="\/icons\/menu\.png"\s+plate/);
        assert.doesNotMatch(master, /img="\/icons\/scan\.png"\s+plate/);
        assert.doesNotMatch(master, /img="\/icons\/admin\.png"\s+plate/);
        assert.doesNotMatch(master, /img="\/icons\/lock\.png"\s+plate/);
        assert.doesNotMatch(master, /img="\/icons\/reservas\.png"\s+plate/);
        assert.doesNotMatch(master, /img="\/icons\/rent\.png"\s+plate/);
        assert.doesNotMatch(master, /img="\/icons\/suplier\.png"\s+plate/);
        assert.doesNotMatch(staff, /variant="icon-text"/);
        assert.doesNotMatch(admin, /variant="icon-text"/);
        assert.doesNotMatch(master, /variant="icon-text"/);
    });

    it('PageScreen es el host de DashboardDetailLayout', () => {
        const source = readFileSync(
            join(SRC_ROOT, 'components/dashboard/DashboardDetailLayout.tsx'),
            'utf8'
        );
        assert.match(source, /data-component=\{PAGE_SCREEN_COMPONENT_ID\}/);
        assert.match(source, /export const DashboardDetailLayout = PageScreen/);
        assert.match(source, /<Surface/);
        assert.doesNotMatch(source, /bg-\[#36606F\]/);
        assert.doesNotMatch(source, /shadow-2xl/);
        assert.doesNotMatch(source, /rounded-2xl/);
        assert.doesNotMatch(
            source,
            /data-element="body"[\s\S]*?flex-1 flex flex-col min-h-0/,
            'el cuerpo de PageScreen no se estira: la tarjeta acaba con el contenido'
        );
        assert.match(source, /data-work=\{work\}/, 'calendario y tabla declaran work, no un boolean paper');
        assert.match(source, /toolbarSlot/, 'buscador y filtros van fuera del papel');
        assert.match(source, /periodStartSlot/, 'Cierres pone Calendario/Tabla a la izquierda; el mes sigue centrado');
        assert.match(source, /data-element="period-start"/, 'el control de vista de Cierres vive a la izquierda de la fila');
        assert.match(source, /leadSlot/, 'KPI y acciones rápidas van fuera del papel');
        assert.match(source, /data-element="lead"/, 'el lead vive en el cromo');
        assert.match(source, /data-pin=\{pinToolbar/, 'el buscador se clava arriba al scrollear hacia arriba');
        assert.doesNotMatch(source, /paper\?: boolean/, 'el papel de trabajo no es opt-in');
        assert.match(source, /titleLeading/, 'la cabecera admite identidad junto al título');
        assert.match(source, /onBack/, 'la flecha atrás puede ejecutar una acción');
        assert.match(source, /data-fill-viewport=\{fillViewport \? 'true' : undefined\}/);
    });

    it('perfil pone el avatar en la cabecera y el menú en una card conjunta', () => {
        const source = readFileSync(join(SRC_ROOT, 'app/profile/page.tsx'), 'utf8');
        assert.match(source, /titleAlign="center"/, 'el nombre va centrado en la fila del avatar');
        assert.match(source, /className="page-profile"/, 'el perfil fija tipografía de nombre propia');
        assert.match(source, /titleLeading/, 'el avatar vive a la izquierda del nombre');
        assert.match(source, /instance="profile-menu"/, 'las opciones comparten una sola card');
        assert.match(source, /data-element="profile-actions"/, 'la rejilla de opciones es un bloque propio');
        assert.doesNotMatch(source, /toUpperCase\(\)/, 'el nombre no va en mayúsculas');
        assert.doesNotMatch(source, /leadSlot/, 'el avatar no va en el lead');
        assert.doesNotMatch(source, /DashboardShortcut/, 'el menú no usa mosaicos sueltos');
        const css = readFileSync(join(SRC_ROOT, 'app/globals.css'), 'utf8');
        assert.match(
            css,
            /\[data-component='PageScreen'\]\.page-profile[\s\S]*?text-transform:\s*none/,
            'el nombre del perfil no va en mayúsculas'
        );
        assert.match(
            css,
            /\[data-element='profile-actions'\][\s\S]*?color:\s*var\(--color-texto-fuerte\)/,
            'las etiquetas del perfil van en negro'
        );
        assert.match(
            css,
            /\[data-element='title-leading'\]/,
            'el avatar de cabecera escala con el título'
        );
    });

    it('listas de varios trabajadores usan WorkerPersonRow', () => {
        const hosts = [
            'app/dashboard/labor/page.tsx',
            'app/dashboard/consumo-personal/page.tsx',
            'app/dashboard/overtime/page.tsx',
            'components/modals/DaySummaryModal.tsx',
            'components/dashboards/AdminDashboardView.tsx',
            'components/tips/TipConfirmDistributionModal.tsx',
            'components/tips/TipDistributionHistorySection.tsx',
        ];
        for (const rel of hosts) {
            const source = readFileSync(join(SRC_ROOT, rel), 'utf8');
            assert.match(source, /WorkerPersonRow/, `${rel} pinta la fila de persona`);
        }
        const row = readFileSync(join(SRC_ROOT, 'components/staff/WorkerPersonRow.tsx'), 'utf8');
        assert.match(row, /rounded-full/, 'la fila lleva inicial circular');
        assert.match(row, /text-\[15px\]/, 'nombre e importe a 15px');
        assert.match(row, /text-\[12px\]/, 'el subtítulo es 12px gris');
        assert.doesNotMatch(row, /text-4xl|text-3xl/, 'sin cifra gigante en la cabecera');
    });

    it('pilotos de página usan PageScreen / DashboardDetailLayout', () => {
        const pilots = [
            'app/dashboard/labor/page.tsx',
            'app/dashboard/albaranes/AlbaranesHistoricoClient.tsx',
            'app/staff/reservas/ReservasClient.tsx',
            'components/tips/TipsDashboardView.tsx',
            'app/dashboard/carta/page.tsx',
            'app/dashboard/overtime/page.tsx',
            'app/horario/page.tsx',
            'app/staff/actividades/page.tsx',
            'app/dashboard/consumo-personal/page.tsx',
            'app/dashboard/history/page.tsx',
            'app/recipes/page.tsx',
            'app/ingredients/page.tsx',
            'app/recipes/[id]/page.tsx',
            'app/dashboard/ventas/page.tsx',
            'app/dashboard/sala/page.tsx',
            'app/dashboard/movements/page.tsx',
            'app/staff/history/page.tsx',
            'app/profile/page.tsx',
            'app/dashboard/insights/InsightsClient.tsx',
            'app/dashboard/albaranes-precios/AlbaranesPreciosClient.tsx',
            'app/staff/actividades/gestion/page.tsx',
            'app/dashboard/import/page.tsx',
            'app/suppliers/page.tsx',
            'app/orders/new/page.tsx',
            'components/ledger/ManagerLedgerView.tsx',
            'app/dashboard/uso/page.tsx',
            'app/dashboard/web/page.tsx',
            'app/admin/import/page.tsx',
            'app/staff/actividades/revision/page.tsx',
            'app/schedule/page.tsx',
            'app/recipes/import/page.tsx',
            'app/profile/contrato/page.tsx',
            'app/reporte/page.tsx',
            'components/tips/StaffPropinasView.tsx',
            'components/reservas/EncargoProductEditor.tsx',
            'app/staff/reservas/encargo/[eventId]/page.tsx',
        ];
        for (const rel of pilots) {
            const source = readFileSync(join(SRC_ROOT, rel), 'utf8');
            assert.match(
                source,
                /DashboardDetailLayout|PageScreen/,
                `${rel} debe usar PageScreen`
            );
            assert.doesNotMatch(
                source,
                /rounded-\[2\.5rem\]/,
                `${rel} no debe usar radio ilegítimo 2.5rem`
            );
            assert.doesNotMatch(
                source,
                /text-\[11px\] font-black text-white uppercase tracking-widest/,
                `${rel} no pinta acciones de cabecera en blanco`
            );
            assert.doesNotMatch(
                source,
                /shrink-0 text-white/,
                `${rel} no arrastra text-white en el cromo de cabecera`
            );
        }
    });

    it('calendarios mensuales de gestión usan el mismo cromo P3 dentro de PageScreen', () => {
        const calendars = [
            'app/dashboard/labor/page.tsx',
            'app/staff/reservas/ReservasClient.tsx',
            'app/horario/page.tsx',
            'app/staff/actividades/page.tsx',
            'app/dashboard/consumo-personal/page.tsx',
            'app/dashboard/history/page.tsx',
        ];
        for (const rel of calendars) {
            const source = readFileSync(join(SRC_ROOT, rel), 'utf8');
            assert.match(source, /DashboardDetailLayout|PageScreen/, `${rel} debe usar PageScreen`);
            assert.match(source, /month-cal-shell/, `${rel} debe usar month-cal-shell`);
            assert.match(source, /month-cal-card/, `${rel} debe usar month-cal-card`);
            assert.doesNotMatch(
                source,
                /month-cal-days--gap/,
                `${rel} no debe usar tarjetas de día sueltas`
            );
            assert.doesNotMatch(
                source,
                /bg-white rounded-2xl shadow-2xl/,
                `${rel} no debe clonar la tarjeta de pantalla`
            );
            assert.match(source, /month-cal-weeks/, `${rel} apila semanas como Cierres`);
            assert.match(source, /MonthCalendarFrame/, `${rel} usa el cromo de Cierres`);
            assert.doesNotMatch(
                source,
                /min-h-\[52px\]|h-24 sm:h-28 md:h-32/,
                `${rel} no usa un alto de celda distinto al de Cierres`
            );
            assert.doesNotMatch(
                source,
                /px-\[1%\]|w-full min-w-0 overflow-hidden rounded-xl border border-zinc-200/,
                `${rel} no pinta un cromo propio alrededor de la rejilla`
            );
        }
        const css = readFileSync(join(SRC_ROOT, 'app/globals.css'), 'utf8');
        assert.match(
            css,
            /--month-cal-cell-min-h:\s*68px/,
            'la semana vacía mide lo mismo que Cierres'
        );
        const frame = readFileSync(join(SRC_ROOT, 'components/time/MonthCalendarFrame.tsx'), 'utf8');
        assert.match(frame, /from-red-500 to-red-600/, 'la cabecera de días es la de Cierres');
        assert.match(frame, /month-cal-chrome/, 'el marco pinta el cromo unificado');
        assert.match(frame, /flush/, 'el mosaico Staff puede ir a ancho completo');
    });

    it('albaranes usa Field, EmptyState y Notice', () => {
        const source = readFileSync(
            join(SRC_ROOT, 'app/dashboard/albaranes/AlbaranesHistoricoClient.tsx'),
            'utf8'
        );
        assert.match(source, /<Field/);
        assert.match(source, /<EmptyState/);
        assert.match(source, /<Notice/);
        assert.match(source, /PeriodFilterButton/, 'el filtro vive en la cabecera');
        assert.match(source, /renderTrigger/, 'ESCANEAR va a la derecha del buscador');
        assert.match(source, /albaranes-load-more/, 'la lista tiene Ver más');
        assert.match(source, /variant="compact"/, 'el modal de filtro es compacto');
        assert.doesNotMatch(
            source,
            /footerSlot=\{<ScannerClient/,
            'el escáner no vive en el pie'
        );
    });

    it('dashboard caja/ventas y staff usan Surface', () => {
        const admin = readFileSync(
            join(SRC_ROOT, 'components/dashboards/AdminDashboardView.tsx'),
            'utf8'
        );
        const ventas = readFileSync(
            join(SRC_ROOT, 'components/dashboards/DashboardVentasSection.tsx'),
            'utf8'
        );
        const staff = readFileSync(
            join(SRC_ROOT, 'components/dashboards/StaffDashboardView.tsx'),
            'utf8'
        );
        const opsHome = readFileSync(
            join(SRC_ROOT, 'components/dashboards/OpsHomeScreen.tsx'),
            'utf8'
        );
        const opsWidgets = readFileSync(
            join(SRC_ROOT, 'components/dashboards/ops-widgets.tsx'),
            'utf8'
        );
        assert.match(admin, /<OpsHomeScreen/);
        assert.match(opsHome, /layout="ops-admin"/);
        assert.doesNotMatch(
            opsHome,
            /label="H\. extras"/,
            'H. extras no lleva nombre bajo el hueco'
        );
        assert.doesNotMatch(
            opsHome,
            /instance="dashboard-horas-extras"[^>]*label=/
        );
        assert.doesNotMatch(
            opsWidgets,
            /data-element="header"/,
            'H. extras ya no lleva cabecera de otro color ni nombre bajo el hueco'
        );
        assert.doesNotMatch(
            opsWidgets,
            /bg-white\/10 text-white border-0/,
            'H. extras no usa pastilla sobre petróleo'
        );
        assert.doesNotMatch(admin, /bg-purple-600/);
        assert.match(ventas, /<Surface /);
        assert.match(ventas, /data-element="header"/);
        assert.match(ventas, /data-tone="plain"/, 'Ventas no pinta la cabecera de petróleo');
        assert.match(ventas, /dashboard-ventas-total/);
        assert.match(ventas, /items-start/, 'Venta Neta y Ticket medio arrancan a la altura de Ventas');
        assert.doesNotMatch(ventas, /#36606F|#407080/);
        assert.match(ventas, /<KpiStat /);
        assert.match(ventas, /mt-auto/, 'con ventas, cifras y conceptos van abajo del widget');
        assert.match(ventas, /my-auto/, 'sin ventas, cifras y conceptos van al centro');
        assert.match(ventas, /displaySummary\.total > 0 \? 'mt-auto' : 'my-auto'/, 'sin ventas se centran; con ventas se quedan abajo');
        assert.match(ventas, /hasData/, 'sin ventas no se pinta la gráfica');
        assert.match(ventas, /strokeWidth="1"/, 'la línea de la gráfica es fina');
        assert.match(ventas, /BUSINESS_HOURS\.start\} h/, 'la gráfica marca las 7 h a la izquierda');
        assert.match(ventas, /BUSINESS_HOURS\.end\} h/, 'la gráfica marca las 23 h a la derecha');
        assert.doesNotMatch(ventas, /dashboard-ventas-tickets/, 'el mosaico no enseña la tabla de tickets');
        assert.doesNotMatch(ventas, /-mt-1/, 'el gráfico de ventas no pisa la cabecera');
        assert.doesNotMatch(
            ventas,
            /salesLoading \|\| !isSalesExpanded/,
            'el gráfico de ventas se ve encima de las cifras, sin expandir'
        );
        assert.match(opsWidgets, /CAJA_INICIAL_ACTION/, 'Caja inicial tiene cromo de acción');
        assert.match(opsWidgets, /aria-label=\{title\}/, 'Caja cambio es un widget con el importe');
        assert.match(opsWidgets, /onAudit\(box\)/, 'pulsar Caja cambio abre el arqueo');
        assert.doesNotMatch(opsWidgets, /DashboardShortcut/, 'Caja cambio no es un icono de placa blanca');
        assert.doesNotMatch(opsWidgets, /bg-zinc-50\/50/, 'los botones de caja flotan sobre el widget');
        assert.match(opsWidgets, /gap-y-3/, 'aire entre el icono y el nombre de los botones de caja');
        assert.match(opsWidgets, /h-9 w-9 items-center justify-center self-end rounded-full/, 'entrada vuelve al disco de color');
        assert.match(opsWidgets, /strokeWidth=\{1\.75\}/, 'el icono de caja va en trazo, no relleno');
        assert.match(opsWidgets, /grid-rows-subgrid/, 'la card y la diferencia se alinean con botones y conceptos');
        assert.match(opsWidgets, /flex h-full min-h-0 w-full items-center/, 'el contenido de Caja inicial va al centro vertical del widget');
        assert.match(opsWidgets, /flex h-9 w-fit[\s\S]*?rounded-lg bg-emerald-600/, 'la card de Caja inicial tiene la misma altura que los botones');
        assert.match(opsWidgets, /col-start-1[\s\S]*Compra[\s\S]*col-start-2[\s\S]*Arqueo[\s\S]*col-start-3[\s\S]*Caja Inicial[\s\S]*col-start-4[\s\S]*Salida[\s\S]*col-start-5[\s\S]*Entrada/, 'Caja inicial: Compra, Arqueo, card, Salida, Entrada');
        assert.match(opsWidgets, /WEEKDAY_INITIALS/, 'H. extras lleva las iniciales de la semana');
        assert.match(opsWidgets, /!inMonth && !isToday && 'opacity-25'/, 'los días de otro mes se apagan');
        assert.match(staff, /<WeekSummary/);
        assert.match(staff, /instance="staff-semana"/);
        assert.doesNotMatch(
            staff,
            /data-element="header"/,
            'el resumen semanal del mosaico Staff no lleva cabecera de bloque'
        );
        assert.doesNotMatch(
            staff,
            /<Surface /,
            'el mosaico Staff ya no envuelve semana ni fichaje en Surface'
        );
        assert.match(staff, /instance="staff-horarios"/);
        assert.match(staff, /<StaffWeekScheduleWidget/);
        assert.doesNotMatch(staff, /label="Horarios"/);
        assert.doesNotMatch(staff, /bg-purple-600/);
        assert.match(staff, /instance="staff-fichaje"/);
        assert.match(staff, /StaffFichajeIcon/);
        assert.doesNotMatch(staff, /No has fichado/);
        assert.match(staff, /compact/, 'el cronómetro en turno cabe en el icono');
        assert.match(staff, /border-white/, 'Entrada y Salida se recortan del petróleo');
        assert.match(staff, /0_0_0_1px_rgba\(24,24,27,0\.14\)/, 'un negro suave por fuera del blanco');
        assert.match(staff, /from-emerald-500/, 'Entrada tiene volumen en el verde');
        assert.match(staff, /from-rose-500/, 'Salida tiene volumen en el rosa');
        assert.match(staff, /formatStaffElapsedHms/, 'el turno cerrado enseña el tiempo real');
        assert.match(staff, /instance="staff-albaranes"/);
        assert.match(staff, /instance="staff-cambio"/);
        const timer = readFileSync(join(SRC_ROOT, 'components/ui/WorkTimer.tsx'), 'utf8');
        assert.doesNotMatch(timer, /No has fichado/);
    });

    it('login entra a la app con recarga, no con router.push', () => {
        const login = readFileSync(join(SRC_ROOT, 'app/login/page.tsx'), 'utf8');
        assert.match(login, /window\.location\.replace\('\/'\)/);
        assert.doesNotMatch(login, /router\.push\('\/'\)/);
        assert.doesNotMatch(login, /useRouter/);
    });

    it('el resumen semanal es WeekSummary en historial, mosaico y horas extras', () => {
        const staff = readFileSync(
            join(SRC_ROOT, 'components/dashboards/StaffDashboardView.tsx'),
            'utf8'
        );
        const overtimeModal = readFileSync(
            join(SRC_ROOT, 'components/WorkerWeeklyHistoryModal.tsx'),
            'utf8'
        );
        const history = readFileSync(join(SRC_ROOT, 'app/staff/history/page.tsx'), 'utf8');
        const weekSummary = readFileSync(
            join(SRC_ROOT, 'components/staff/WeekSummary.tsx'),
            'utf8'
        );
        const weekCard = readFileSync(join(SRC_ROOT, 'app/staff/history/WeekCard.tsx'), 'utf8');
        const plantilla = readFileSync(
            join(SRC_ROOT, 'app/staff/history/PlantillaWeekCard.tsx'),
            'utf8'
        );
        const historyRead = readFileSync(join(SRC_ROOT, 'app/actions/history-read.ts'), 'utf8');

        assert.match(weekSummary, /from '@\/app\/staff\/history\/WeekCard'/);
        assert.match(weekSummary, /<MonthCalendarFrame/);
        assert.match(weekSummary, /data-week-summary="true"/);
        assert.match(weekSummary, /data-week-divider="true"/);
        assert.match(weekSummary, /data-stacked=\{stacked \? 'true' : undefined\}/);
        assert.match(weekSummary, /HistoryWeekDto|WeekCardProps\['week'\]/);
        assert.doesNotMatch(
            weekSummary,
            /from-red-500 to-red-600/,
            'WeekSummary no clona la cabecera L–D'
        );

        assert.match(staff, /from '@\/components\/staff\/WeekSummary'/);
        assert.match(staff, /<WeekSummary/);
        assert.match(staff, /getEmployeeHistoryWeek/);
        assert.doesNotMatch(staff, /from '@\/app\/staff\/history\/WeekCard'/);
        assert.doesNotMatch(staff, /<WeekCard/);
        assert.doesNotMatch(staff, /<MonthCalendarFrame/);
        assert.doesNotMatch(
            staff,
            /from-red-500 to-red-600/,
            'el mosaico Staff no clona la cabecera de días de la semana'
        );

        assert.match(overtimeModal, /from '@\/components\/staff\/WeekSummary'/);
        assert.match(overtimeModal, /<WeekSummary/);
        assert.match(overtimeModal, /getEmployeeHistoryWeek/);
        assert.doesNotMatch(overtimeModal, /from '@\/app\/staff\/history\/WeekCard'/);
        assert.doesNotMatch(overtimeModal, /<WeekCard/);
        assert.doesNotMatch(overtimeModal, /<MonthCalendarFrame/);

        assert.match(history, /from '@\/components\/staff\/WeekSummary'/);
        assert.match(history, /<WeekSummary/);
        assert.match(history, /getEmployeeHistoryMonth/);
        assert.match(history, /<PlantillaWeekCard/);
        assert.doesNotMatch(history, /from ['"].*\/WeekCard['"]/);

        assert.match(historyRead, /buildEmployeeHistoryMonthFromEngine/);
        assert.match(historyRead, /HistoryWeekDto/);

        assert.match(weekCard, /text-\[7px\] font-normal/, 'el número del día es el del mosaico');
        assert.match(weekCard, /h-\[25px\] min-h-\[25px\] max-h-\[25px\]/, 'el pie es el del mosaico');
        assert.match(weekCard, /text-\[10px\] font-semibold/, 'las cifras del pie son las del mosaico');
        assert.match(weekCard, /text-\[8px\] font-medium/, 'las etiquetas del pie son las del mosaico');
        assert.match(weekCard, /data-week-paid="true"/);
        assert.match(weekCard, /w-\[48px\][\s\S]*md:w-\[56px\]/, 'Pagado conserva su tamaño');
        assert.doesNotMatch(
            weekCard,
            /absolute right-0\.5 top-1\/2/,
            'Pagado no pisa el importe: va en el flujo del pie'
        );
        assert.match(weekCard, /month-cal-day-logs/, 'entrada y salida van en el cuerpo de la celda');
        assert.doesNotMatch(
            weekCard,
            /font-mono/,
            'entrada y salida usan la misma fuente que el resto'
        );
        assert.doesNotMatch(
            weekCard,
            /bg-orange-400 animate-pulse/,
            'entrada sin salida no pinta un punto amarillo'
        );
        assert.match(weekCard, />Horas</);
        assert.doesNotMatch(
            weekCard,
            /from-red-500 to-red-600/,
            'WeekCard no pinta una cabecera de días propia'
        );
        assert.doesNotMatch(
            weekCard,
            /rounded-xl border border-zinc-200/,
            'WeekCard no pinta un cromo de tarjeta propio'
        );
        assert.doesNotMatch(
            weekCard,
            /min-h-\[52px\]|min-h-\[36px\]/,
            'la celda no reserva alto de más'
        );
        assert.doesNotMatch(
            weekCard,
            />P<\s*\/span>/,
            'las horas personales no van en la celda; van en el detalle del día'
        );

        assert.doesNotMatch(plantilla, /from ['"].*\/WeekCard['"]/);
        assert.match(plantilla, /getInitials/);
        assert.match(plantilla, /month-cal-cell/);
        assert.doesNotMatch(plantilla, /Pendiente|Importe/);
        assert.doesNotMatch(
            plantilla,
            /from-red-500 to-red-600/,
            'la plantilla no clona la cabecera de días'
        );
    });

    it('Ver todos / Ver activos es el último usuario del selector, no un CTA de cabecera', () => {
        const modal = readFileSync(
            join(SRC_ROOT, 'components/modals/StaffSelectionModal.tsx'),
            'utf8'
        );
        const history = readFileSync(join(SRC_ROOT, 'app/staff/history/page.tsx'), 'utf8');
        const admin = readFileSync(
            join(SRC_ROOT, 'components/dashboards/AdminDashboardView.tsx'),
            'utf8'
        );
        const master = readFileSync(
            join(SRC_ROOT, 'components/dashboards/MasterDashboardView.tsx'),
            'utf8'
        );

        assert.match(modal, /data-list-end="true"/);
        assert.match(modal, /plantillaSelected \? 'Ver activos' : 'Ver todos'/);
        assert.doesNotMatch(modal, /headerTextAction/);
        assert.doesNotMatch(modal, /Vista plantilla \(todos\)/);
        assert.doesNotMatch(modal, /staff-selection-plantilla-vista/);

        assert.match(history, /allowPlantilla=\{isManager\}/);
        assert.match(history, /plantillaSelected=\{isPlantilla\}/);

        assert.match(modal, /data-visibility-toggle="true"/);
        assert.match(modal, /absolute top-0 right-0/);
        assert.doesNotMatch(modal, /divide-y divide-zinc-100/);
        assert.doesNotMatch(modal, /min-w-\[3\.75rem\]/);
    });

    it('el periodo temporal es PeriodNav en cabecera; filtro fijo, sin cruz', () => {
        const hosts = [
            'app/dashboard/labor/page.tsx',
            'app/horario/page.tsx',
            'app/staff/actividades/page.tsx',
            'app/staff/reservas/ReservasClient.tsx',
            'app/dashboard/overtime/page.tsx',
            'app/dashboard/consumo-personal/page.tsx',
            'app/staff/history/page.tsx',
            'app/dashboard/history/page.tsx',
            'app/dashboard/ventas/page.tsx',
            'app/dashboard/movements/page.tsx',
            'components/ledger/ManagerLedgerView.tsx',
            'components/tips/TipsDashboardView.tsx',
            'app/dashboard/insights/InsightsClient.tsx',
        ];
        const clone = /text-base md:text-lg font-black text-ds-marca capitalize/;
        for (const rel of hosts) {
            const source = readFileSync(join(SRC_ROOT, rel), 'utf8');
            assert.match(source, /periodSlot/, `${rel} monta el periodo en la cabecera`);
            assert.match(source, /<PeriodNav/, `${rel} debe usar PeriodNav`);
            assert.doesNotMatch(source, clone, `${rel} no debe clonar la anatomía de PeriodNav`);
            assert.doesNotMatch(
                source,
                /TimeFilterButton/,
                `${rel} no usa TimeFilterButton`
            );
            assert.doesNotMatch(
                source,
                /hasActiveFilter/,
                `${rel} no pinta cruz de quitar filtro de periodo`
            );
        }
        const filterHosts = [
            'app/staff/history/page.tsx',
            'app/dashboard/history/page.tsx',
            'app/dashboard/ventas/page.tsx',
            'app/dashboard/movements/page.tsx',
            'app/dashboard/overtime/page.tsx',
            'app/dashboard/consumo-personal/page.tsx',
            'app/dashboard/labor/page.tsx',
            'components/ledger/ManagerLedgerView.tsx',
            'components/tips/TipsDashboardView.tsx',
            'app/dashboard/insights/InsightsClient.tsx',
        ];
        for (const rel of filterHosts) {
            const source = readFileSync(join(SRC_ROOT, rel), 'utf8');
            assert.match(source, /PeriodFilterButton/, `${rel} monta el icono de filtro`);
            assert.match(source, /TimeFilterModal/, `${rel} abre TimeFilterModal`);
            assert.doesNotMatch(
                source,
                /history-month-picker|ventas-month-picker|staff-history-month-picker/,
                `${rel} no monta un selector de mes paralelo`
            );
        }
        const nav = readFileSync(join(SRC_ROOT, 'components/time/PeriodNav.tsx'), 'utf8');
        assert.match(nav, /PeriodFilterButton/, 'el filtro de cabecera es siempre el mismo icono');
        assert.doesNotMatch(nav, /hasActiveFilter/, 'PeriodNav no tiene cruz de dismiss');
        const timeFilter = readFileSync(join(SRC_ROOT, 'components/time/TimeFilterModal.tsx'), 'utf8');
        assert.doesNotMatch(timeFilter, /headerVariant=["']petroleum["']/);
        assert.doesNotMatch(timeFilter, /bg-ds-marca/);
        assert.doesNotMatch(timeFilter, /#36606F/);
        assert.match(timeFilter, /MonthPickerGrid/, 'el mes del filtro usa la rejilla unificada');
        assert.match(timeFilter, /periodFilterTabClassName/, 'las pestañas del filtro usan envolvente');
        const monthGrid = readFileSync(join(SRC_ROOT, 'components/time/MonthPickerGrid.tsx'), 'utf8');
        assert.doesNotMatch(monthGrid, /#36606F|bg-ds-marca/);
        const multiExport = readFileSync(
            join(SRC_ROOT, 'components/modals/MultiEmployeeExportModal.tsx'),
            'utf8'
        );
        assert.doesNotMatch(multiExport, /#36606F|headerTone=["']petroleum["']/);
        assert.match(multiExport, /monthCellDarkClassName/);
    });

    it('eventos, inventario y recetas usan primitivas canónicas', () => {
        const eventos = readFileSync(
            join(SRC_ROOT, 'app/dashboard/eventos/EventosAdminClient.tsx'),
            'utf8'
        );
        const eventosPage = readFileSync(join(SRC_ROOT, 'app/dashboard/eventos/page.tsx'), 'utf8');
        const inventoryShell = readFileSync(
            join(SRC_ROOT, 'app/dashboard/inventory/InventoryPageShell.tsx'),
            'utf8'
        );
        const inventoryPage = readFileSync(join(SRC_ROOT, 'app/dashboard/inventory/page.tsx'), 'utf8');
        const recetas = readFileSync(join(SRC_ROOT, 'app/dashboard/recetas-tpv/page.tsx'), 'utf8');
        const recetasImport = readFileSync(
            join(SRC_ROOT, 'app/dashboard/recetas-import/RecetasImportClient.tsx'),
            'utf8'
        );
        assert.match(eventos, /<EmptyState/);
        assert.match(eventos, /<Field/);
        assert.match(eventos, /<Surface/);
        assert.match(eventosPage, /<Notice/);
        assert.match(inventoryShell, /variant="tertiary"/);
        assert.doesNotMatch(inventoryShell, /pt-6 md:pt-8/);
        assert.doesNotMatch(inventoryPage, /pt-6 md:pt-8/);
        assert.match(recetas, /<Notice/);
        assert.match(recetasImport, /DashboardDetailLayout/);
        assert.match(recetasImport, /<Surface/);
    });

    it('sala LIVE usa PageScreen como Ventas y no reintroduce radio ilegítimo ni cabecera clonada', () => {
        const sala = readFileSync(join(SRC_ROOT, 'app/dashboard/sala/page.tsx'), 'utf8');
        const radar = readFileSync(
            join(SRC_ROOT, 'components/dashboards/RadarSala.tsx'),
            'utf8'
        );
        assert.match(sala, /DashboardDetailLayout/);
        assert.match(sala, /work="table"/);
        assert.match(sala, /toolbarSlot=/);
        assert.match(sala, /<SubNavVentas/);
        assert.match(sala, /instance="sala-live"/);
        assert.doesNotMatch(sala, /variant="page"/);
        assert.doesNotMatch(sala, /rounded-\[2\.5rem\]/);
        assert.doesNotMatch(sala, /italic/);
        assert.doesNotMatch(sala, /bg-\[#36606F\]/);
        assert.match(radar, /<Surface/);
        assert.match(radar, /<EmptyState/);
        assert.doesNotMatch(radar, /bg-\[#36606F\]/);
        assert.doesNotMatch(radar, /rounded-\[2\.5rem\]/);
    });

    it('reservas dispara + reserva con Button', () => {
        const reservas = readFileSync(join(SRC_ROOT, 'app/staff/reservas/ReservasClient.tsx'), 'utf8');
        assert.match(reservas, /instance="reservas-nueva"/);
        assert.match(reservas, /\+ reserva/);
        assert.doesNotMatch(reservas, /Hacer reserva/);
        assert.doesNotMatch(reservas, /<a\s+href="https:\/\/marbella-web/);
    });

    it('tablas operativas usan thead de sistema (T8)', () => {
        const tables = [
            'app/dashboard/ventas/page.tsx',
            'app/dashboard/movements/page.tsx',
            'app/dashboard/history/page.tsx',
            'app/staff/actividades/gestion/page.tsx',
            'components/ledger/ManagerLedgerView.tsx',
            'components/tips/TipsDashboardView.tsx',
        ];
        for (const rel of tables) {
            const source = readFileSync(join(SRC_ROOT, rel), 'utf8');
            assert.match(source, /data-component=\{TABLE_COMPONENT_ID\}/, `${rel} debe usar Table`);
            assert.doesNotMatch(
                source,
                /<thead className="[^"]*bg-\[#36606F\]/,
                `${rel} no debe clonar thead petróleo`
            );
        }
        const ventas = readFileSync(join(SRC_ROOT, 'app/dashboard/ventas/page.tsx'), 'utf8');
        assert.doesNotMatch(
            ventas,
            /p-4 md:p-6 bg-zinc-50/,
            'Ventas no deja un hueco gordo encima de la tabla'
        );
        const timeFilter = readFileSync(join(SRC_ROOT, 'components/time/TimeFilterModal.tsx'), 'utf8');
        assert.doesNotMatch(
            timeFilter,
            /rounded-2xl/,
            'el selector de periodo no pinta botones pastilla'
        );
    });

    it('recetas, ingredientes y proveedores comparten rejilla y celda unificadas', () => {
        const recipes = readFileSync(join(SRC_ROOT, 'app/recipes/page.tsx'), 'utf8');
        const ingredients = readFileSync(join(SRC_ROOT, 'app/ingredients/page.tsx'), 'utf8');
        const suppliers = readFileSync(join(SRC_ROOT, 'app/suppliers/page.tsx'), 'utf8');
        const grid = readFileSync(join(SRC_ROOT, 'components/suppliers/SupplierPickerGrid.tsx'), 'utf8');
        for (const [rel, source] of [
            ['app/recipes/page.tsx', recipes],
            ['app/ingredients/page.tsx', ingredients],
        ] as const) {
            assert.match(source, /DashboardDetailLayout|PageScreen/, `${rel} debe usar PageScreen`);
            assert.match(source, /CatalogGrid/, `${rel} debe usar CatalogGrid`);
            assert.match(source, /CatalogTileUnificado/, `${rel} debe usar la celda unificada`);
            assert.doesNotMatch(
                source,
                /rounded-\[2\.5rem\]/,
                `${rel} no debe usar radio ilegítimo 2.5rem`
            );
            assert.doesNotMatch(
                source,
                /bg-white rounded-2xl p-/,
                `${rel} no debe pintar card propia en la celda`
            );
            assert.doesNotMatch(
                source,
                /from ['"]@\/components\/ui\/RecipeCard['"]/,
                `${rel} no usa RecipeCard`
            );
        }
        assert.match(recipes, /columns=\{4\}/, 'recetas: 4 columnas');
        assert.match(recipes, /buildRecipesHref/, 'pulsar una receta abre la ficha');
        assert.doesNotMatch(recipes, /recipes-staff-preview/, 'staff no abre un modal distinto');
        const recipeDetail = readFileSync(join(SRC_ROOT, 'app/recipes/[id]/page.tsx'), 'utf8');
        assert.doesNotMatch(recipeDetail, /CatalogFilterChip/, 'la ficha no muestra la categoría');
        assert.match(recipeDetail, /ConfirmModal/, 'eliminar receta usa ConfirmModal');
        const recipeEditModal = readFileSync(join(SRC_ROOT, 'components/recipes/RecipeNamePhotoEditModal.tsx'), 'utf8');
        assert.match(recipeEditModal, /<Field instance="recipe-edit-category"/, 'la categoría se elige al editar la receta');
        assert.match(ingredients, /columns=\{4\}/, 'ingredientes: 4 columnas');
        assert.match(suppliers, /SupplierPickerGrid/, 'proveedores monta la rejilla unificada');
        assert.match(grid, /CatalogGrid/, 'proveedores usa CatalogGrid');
        assert.match(grid, /columns=\{4\}/, 'proveedores: 4 columnas');
        assert.match(grid, /CatalogTileUnificado/, 'proveedores usa la celda unificada');
        const tile = readFileSync(join(SRC_ROOT, 'components/catalog/UnifiedCatalogTile.tsx'), 'utf8');
        const catalog = readFileSync(join(SRC_ROOT, 'components/catalog/CatalogTile.tsx'), 'utf8');
        assert.match(catalog, /grid-cols-3/, 'la rejilla admite 3 columnas');
        assert.match(catalog, /grid-cols-4/, 'la rejilla admite 4 columnas');
        assert.match(catalog, /function AccessMenuGrid/, 'los menús de acceso usan la misma rejilla');
        assert.match(catalog, /columns = 3/, 'los menús de acceso van a 3 columnas por defecto');
        assert.match(catalog, /gap-5/, 'hay aire entre celdas');
        assert.match(tile, /aspect-square/, 'el recuadro de imagen es cuadrado');
        assert.match(tile, /object-contain/, 'la imagen se reduce para caber');
        assert.match(tile, /data-element="square"/, 'el recuadro blanco es explícito');
        assert.match(tile, /data-element="square-fill"/, 'el relleno blanco va en capa bajo la imagen');
        assert.match(tile, /data-element="price"/, 'el precio vive dentro del recuadro');
        assert.match(tile, /absolute inset-x-0 bottom/, 'el precio se ancla abajo del recuadro');
        assert.match(tile, /line-clamp-2/, 'el nombre usa hasta dos filas');
        assert.match(tile, /data-element="name-slot"/, 'el nombre reserva hueco fijo fuera del recuadro');
        assert.doesNotMatch(tile, /truncate/, 'el nombre no se abrevia en una sola fila');
        const css = readFileSync(join(SRC_ROOT, 'app/globals.css'), 'utf8');
        assert.match(
            css,
            /\[data-component='PageScreen'\]\[data-work='catalog'\] \[data-component='Surface'\]\[data-variant='page'\]/,
            'el catálogo flota sobre el envolvente sin papel'
        );
        assert.match(
            css,
            /\[data-component='PageScreen'\]\[data-work='catalog'\] \[data-catalog-tile\] \[data-element='name'\]/,
            'el nombre del catálogo se lee sobre el envolvente'
        );
    });

    it('los tres selectores de proveedor comparten la misma rejilla de catálogo', () => {
        const grid = readFileSync(join(SRC_ROOT, 'components/suppliers/SupplierPickerGrid.tsx'), 'utf8');
        const modal = readFileSync(join(SRC_ROOT, 'components/suppliers/SupplierSelectionModal.tsx'), 'utf8');
        const pedido = readFileSync(join(SRC_ROOT, 'components/orders/SupplierSelectionModal.tsx'), 'utf8');
        const scanner = readFileSync(join(SRC_ROOT, 'app/dashboard/scanner/ScannerClient.tsx'), 'utf8');
        const suppliers = readFileSync(join(SRC_ROOT, 'app/suppliers/page.tsx'), 'utf8');
        assert.match(grid, /CatalogTileUnificado/, 'la celda es la del catálogo unificado');
        assert.match(grid, /CatalogGrid/, 'la rejilla es la del catálogo');
        assert.match(modal, /SupplierPickerGrid/, 'el modal de pedido/albarán monta la misma rejilla');
        assert.match(pedido, /from '@\/components\/suppliers\/SupplierSelectionModal'/, 'pedido reexporta el mismo modal');
        assert.match(scanner, /SupplierSelectionModal/, 'el albarán abre el mismo modal');
        assert.match(scanner, /instance="scanner-supplier"/, 'el albarán conserva su instancia');
        assert.match(suppliers, /SupplierPickerGrid/, 'el detalle monta la misma rejilla');
        assert.match(modal, /CatalogTileUnificado|SupplierPickerGrid/, 'el modal usa la celda unificada');
    });

    it('los menús de acceso en modal van en rejilla, nunca en lista', () => {
        const hosts = [
            'components/profile/NominasMenuModal.tsx',
            'components/dashboards/StaffDashboardView.tsx',
            'components/modals/StaffProductModal.tsx',
            'components/modals/AdminProductModal.tsx',
        ];
        for (const rel of hosts) {
            const source = readFileSync(join(SRC_ROOT, rel), 'utf8');
            assert.match(source, /AccessMenuGrid/, `${rel} monta la rejilla de accesos`);
            assert.match(source, /CatalogTile/, `${rel} monta la misma celda que el catálogo`);
            assert.doesNotMatch(
                source,
                /grid grid-cols-1 gap/,
                `${rel} no lista los accesos en una columna`
            );
            assert.doesNotMatch(
                source,
                /grid-cols-2 gap-3 bg-gray-50/,
                `${rel} no usa la rejilla de dos columnas de Stock`
            );
        }
        const docs = readFileSync(join(SRC_ROOT, 'components/profile/NominasMenuModal.tsx'), 'utf8');
        assert.doesNotMatch(docs, /min-h-\[56px\] flex items-center justify-center gap-3/, 'Documentos no es una lista');
        const staff = readFileSync(join(SRC_ROOT, 'components/dashboards/StaffDashboardView.tsx'), 'utf8');
        assert.doesNotMatch(
            staff,
            /flex items-center gap-4 w-full p-4 text-gray-600/,
            'Info y Manuales no son una lista'
        );
        const patrones = readFileSync(join(REPO_ROOT, 'marbella-os/2-diseno/PATRONES.md'), 'utf8');
        assert.match(patrones, /menú de accesos/, 'P2 declara la rejilla de accesos');
    });

    it('ningún piloto prioritario reintroduce rounded-[2.5rem]', () => {
        const offenders: string[] = [];
        for (const full of listSourceFiles(join(SRC_ROOT, 'components/tips'))) {
            const source = readFileSync(full, 'utf8');
            if (source.includes(PAGE_SCREEN_FORBIDDEN_RADIUS)) {
                offenders.push(toPosix(relative(REPO_ROOT, full)));
            }
        }
        assert.deepEqual(offenders, [], `Radio ilegítimo:\n${offenders.join('\n')}`);
    });

    it('los recuentos monetarios usan la misma rejilla y el mismo pie', () => {
        const stepper = readFileSync(join(SRC_ROOT, 'components/cash/DenominationCountGrid.tsx'), 'utf8');
        assert.match(stepper, /w-\[86%\]/, 'la caja - valor + es más estrecha que la columna');
        assert.match(stepper, /text-\[9px\].*tabular-nums/, 'los dígitos no cambian de tamaño');
        assert.match(stepper, /grid-cols-3 gap-x-2\.5/, 'las columnas respiran');

        const footer = readFileSync(join(SRC_ROOT, 'components/cash/CashCountFooter.tsx'), 'utf8');
        assert.match(footer, /cancelLabel = 'Cancelar'/);
        assert.match(footer, /saveLabel = 'Guardar'/);
        assert.match(footer, /Total/);

        const form = readFileSync(join(SRC_ROOT, 'components/CashDenominationForm.tsx'), 'utf8');
        assert.match(form, /DenominationCountGrid/);
        assert.doesNotMatch(form, /CashCountFooter/, 'el form no pinta el pie; lo pinta el Modal');
        assert.doesNotMatch(form, /bg-\[#36606F\].*px-4 py-2/, 'el form no pinta cabecera petróleo propia');

        const hosts = [
            'components/tips/TipsDashboardView.tsx',
            'app/dashboard/movements/page.tsx',
            'components/dashboards/AdminDashboardView.tsx',
            'components/dashboards/StaffDashboardView.tsx',
            'components/dashboards/MasterDashboardView.tsx',
            'components/MovementDetailModal.tsx',
            'components/CashClosingModal.tsx',
            'components/CashChangeModal.tsx',
            'components/staff/StaffCajaCambioModal.tsx',
            'components/PurchaseMultiSourceForm.tsx',
            'app/dashboard/history/page.tsx',
        ];
        for (const rel of hosts) {
            const source = readFileSync(join(SRC_ROOT, rel), 'utf8');
            assert.match(
                source,
                /CashCountFooter/,
                `${rel} debe usar el pie de recuento`
            );
            assert.match(
                source,
                /DenominationCountGrid|CashDenominationForm/,
                `${rel} debe usar la rejilla de recuento`
            );
        }
    });

    it('las barras de cantidad usan QuantityStepper (P10)', () => {
        const hosts = [
            'app/dashboard/inventory/InventoryClient.tsx',
            'app/dashboard/inventory/waste/WasteClient.tsx',
            'components/carta/EventCartaOrderControls.tsx',
            'components/cash-closing/ClosingStep1Parts.tsx',
            'components/reservas/EncargoProductEditor.tsx',
            'components/orders/OrderProductCard.tsx',
            'app/staff/ConsumptionModal.tsx',
            'components/eventos/EventEncargoCartFooter.tsx',
        ];
        for (const rel of hosts) {
            const source = readFileSync(join(SRC_ROOT, rel), 'utf8');
            assert.match(source, /QuantityStepper/, `${rel} debe usar QuantityStepper`);
        }
        const inventory = readFileSync(join(SRC_ROOT, 'app/dashboard/inventory/InventoryClient.tsx'), 'utf8');
        assert.doesNotMatch(inventory, /aria-label="Menos cantidad"/);
        const waste = readFileSync(join(SRC_ROOT, 'app/dashboard/inventory/waste/WasteClient.tsx'), 'utf8');
        assert.doesNotMatch(waste, /aria-label="Menos cantidad"/);
    });

    it('horas extras Admin pinta el mismo hoy que la pantalla overtime', () => {
        const extras = readFileSync(join(SRC_ROOT, 'components/dashboards/ops-widgets.tsx'), 'utf8');
        const overtime = readFileSync(join(SRC_ROOT, 'app/dashboard/overtime/page.tsx'), 'utf8');
        assert.match(extras, /flex h-5 w-5 items-center justify-center rounded-full/);
        assert.match(extras, /periodTodayClassName\(true\)/);
        assert.match(overtime, /periodTodayClassName\(true\)/);
        assert.doesNotMatch(extras, /isToday && 'bg-blue-500 text-white'/);
        assert.match(
            extras,
            /text-\[10px\] font-normal text-zinc-500[\s\S]*?ml-auto shrink-0 whitespace-nowrap[\s\S]*?font-normal tabular-nums/,
            'Semana e importe van en regular; el valor no se recorta'
        );
        assert.doesNotMatch(
            extras,
            /Semana[\s\S]{0,80}uppercase/,
            'Semana no va en mayúsculas'
        );
        assert.match(extras, /pt-3/, 'el calendario baja de la fecha del mes');
        assert.match(
            extras,
            /grid min-h-0 flex-1 grid-cols-7/,
            'las filas del calendario se reparte el hueco restante'
        );
        assert.doesNotMatch(
            extras,
            /flex h-full w-5 items-center justify-center rounded-full/,
            'el día es un círculo, no una celda estirada'
        );
        assert.doesNotMatch(extras, /w-9 md:w-11/, 'el importe no se recorta en un hueco fijo');
        assert.doesNotMatch(
            extras,
            /format\(new Date\(week\.weekId\), 'd MMM'/,
            'el mosaico no escribe el rango de fechas; ya está el mini-calendario'
        );
    });

    it('el calendario de elegir un día usa MiniMonthCalendar', () => {
        const hosts = [
            'components/time/TimeFilterModal.tsx',
            'components/schedule/ScheduleDayEditor.tsx',
            'components/dashboards/DashboardVentasSection.tsx',
        ];
        for (const rel of hosts) {
            const source = readFileSync(join(SRC_ROOT, rel), 'utf8');
            assert.match(source, /MiniMonthCalendar/, `${rel} debe usar MiniMonthCalendar`);
        }
        const mini = readFileSync(join(SRC_ROOT, 'components/time/MiniMonthCalendar.tsx'), 'utf8');
        assert.doesNotMatch(mini, /bg-ds-marca/, 'el día seleccionado no pinta marca petróleo');
        const history = readFileSync(join(SRC_ROOT, 'app/dashboard/history/page.tsx'), 'utf8');
        assert.doesNotMatch(history, /bg-zinc-900 text-white shadow-xl scale-110/);
        const ventas = readFileSync(join(SRC_ROOT, 'app/dashboard/ventas/page.tsx'), 'utf8');
        assert.doesNotMatch(ventas, /bg-zinc-900 text-white shadow-xl scale-110/);
    });

    it('receta, mapeo, encargo, import, ledger, pedido y propinas usan thead de sistema', () => {
        const tables = [
            'app/recipes/[id]/page.tsx',
            'components/reservas/EncargoOrderViewModal.tsx',
            'app/dashboard/import/page.tsx',
            'app/admin/import/page.tsx',
            'app/dashboard/recetas-tpv/MappingClient.tsx',
            'app/dashboard/inventory/ledger/LedgerClient.tsx',
            'components/orders/OrderSummaryModal.tsx',
            'components/eventos/EventOrdersProductMatrix.tsx',
        ];
        for (const rel of tables) {
            const source = readFileSync(join(SRC_ROOT, rel), 'utf8');
            assert.match(source, /TABLE_COMPONENT_ID/, `${rel} debe usar Table`);
        }
        const recipe = readFileSync(join(SRC_ROOT, 'app/recipes/[id]/page.tsx'), 'utf8');
        assert.match(recipe, /data-element="recipe-panel"/, 'las tarjetas de ficha usan recipe-panel');
        assert.match(recipe, /data-element="photo-nav"/, 'las flechas de receta flotan');
        assert.match(recipe, /CatalogSquare/, 'la foto usa el recuadro del catálogo');
        assert.match(recipe, /titleAlign="center"/, 'el nombre de receta va centrado en la cabecera');
        const pageScreen = readFileSync(join(SRC_ROOT, 'components/dashboard/DashboardDetailLayout.tsx'), 'utf8');
        const pageScreenCss = readFileSync(join(SRC_ROOT, 'app/globals.css'), 'utf8');
        assert.match(
            pageScreenCss,
            /\[data-title-align='center'\] \[data-element='title-block'\] \{[\s\S]*?position:\s*absolute/,
            'cabecera centrada: el título flota al centro sin contar los iconos'
        );
        assert.match(pageScreen, /titleAlign === 'center'/, 'PageScreen admite título centrado');
        assert.match(recipe, /leadSlot=\{/, 'la foto con flechas va en leadSlot, debajo del nombre');
        assert.match(recipe, /work="catalog"/, 'la ficha flota sobre el envolvente');
        assert.doesNotMatch(recipe, /bg-\[#fafafa\]/, 'la ficha no lleva losa gris de fondo');
        assert.doesNotMatch(recipe, /instance="recipe-eliminar"/, 'eliminar receta no está en la ficha');
        assert.doesNotMatch(recipe, /Ingredientes <span/, 'la cabecera de ingredientes no lleva el recuento');
        assert.doesNotMatch(
            recipe,
            /<h2 data-element="title">Ingredientes/,
            'la tabla de ingredientes no duplica la palabra Ingredientes'
        );
        assert.match(recipe, /<th scope="col">Ingredientes<\/th>/, 'la columna se llama Ingredientes');
        assert.match(recipe, /instance="recipe-simulador"/, 'Simulador es el botón de sistema');
        assert.doesNotMatch(recipe, /bg-purple-600 px-3/, 'Simulador no es una pastilla propia');
        assert.doesNotMatch(recipe, /instance="recipe-nuevo-ingrediente"/, 'añadir no es un botón de 48px sobre la cabecera');
        assert.match(recipe, /openAddIngredientModal/, 'se añade ingrediente desde la tabla');
        const recipeCss = readFileSync(join(SRC_ROOT, 'app/globals.css'), 'utf8');
        assert.match(
            recipeCss,
            /\[data-element='square-fill'\][\s\S]*?background-color:\s*var\(--color-superficie\)/,
            'el recuadro de foto tiene relleno blanco bajo la imagen'
        );
        assert.match(
            recipeCss,
            /\[data-element='photo-nav'\] \[data-component='Button'\]::before/,
            'las flechas de foto no pintan tarjeta'
        );
        assert.match(
            recipeCss,
            /\[data-element='photo-nav'\] \[data-component='Button'\][\s\S]*?color:\s*var\(--color-texto-invertido\)/,
            'las flechas de foto son blancas'
        );
        assert.match(
            recipeCss,
            /--recipe-panel-chrome-fill:\s*color-mix\(in srgb, white 16%, var\(--color-envolvente-bajo\)\)/,
            'las cabeceras de ficha comparten un único tono de widget'
        );
        assert.match(
            recipeCss,
            /\[data-element='recipe-panel'\][\s\S]*?background-color:\s*var\(--recipe-panel-chrome-fill(?:,\s*var\(--table-chrome-fill\))?\)/,
            'todas las cabeceras de ficha usan el mismo relleno'
        );
        assert.match(
            recipeCss,
            /\[data-element='recipe-panel'\][\s\S]*?text-transform:\s*uppercase[\s\S]*?font-weight:\s*500/,
            'las cabeceras de tarjeta comparten versales y peso 500'
        );
        assert.doesNotMatch(recipe, /uppercase/, 'el cuerpo de la ficha no fuerza mayúsculas');
        assert.match(recipe, /data-element="field-label"/, 'las etiquetas internas usan field-label');
    });

    it('inventario y merma usan EmptyState y SearchField', () => {
        const inventory = readFileSync(join(SRC_ROOT, 'app/dashboard/inventory/InventoryClient.tsx'), 'utf8');
        const waste = readFileSync(join(SRC_ROOT, 'app/dashboard/inventory/waste/WasteClient.tsx'), 'utf8');
        assert.match(inventory, /<EmptyState/);
        assert.match(inventory, /SearchField/);
        assert.match(waste, /<EmptyState/);
        assert.match(waste, /SearchField/);
    });

    it('los catálogos usan SearchField y CAT flota sin tarjeta', () => {
        const hosts = [
            'app/recipes/page.tsx',
            'app/ingredients/page.tsx',
            'app/suppliers/page.tsx',
        ];
        for (const rel of hosts) {
            const source = readFileSync(join(SRC_ROOT, rel), 'utf8');
            assert.match(source, /SearchField/, `${rel} debe usar SearchField`);
            assert.match(source, /CatalogFilterChip/, `${rel} debe usar el filtro flotante`);
            assert.match(source, /toolbarSlot/, `${rel} pone el buscador fuera del papel`);
            assert.doesNotMatch(source, /Cat\./, `${rel} dice CAT, no Cat.`);
            assert.doesNotMatch(source, /Prov\./, `${rel} dice PROV, no Prov.`);
        }
        const css = readFileSync(join(SRC_ROOT, 'app/globals.css'), 'utf8');
        assert.match(
            css,
            /\[data-element='catalog-filter'\] \{[\s\S]*?background:\s*transparent/,
            'CAT flota sin mini-card'
        );
        assert.match(
            css,
            /\[data-component='SearchField'\] input \{[\s\S]*?height:\s*var\(--espacio-8\);[\s\S]*?min-height:\s*var\(--espacio-8\);[\s\S]*?max-height:\s*var\(--espacio-8\);[\s\S]*?font-size:\s*12px;/,
            'todos los buscadores son compactos'
        );
        const albaranes = readFileSync(
            join(SRC_ROOT, 'app/dashboard/albaranes/AlbaranesHistoricoClient.tsx'),
            'utf8'
        );
        const consumption = readFileSync(join(SRC_ROOT, 'app/staff/ConsumptionModal.tsx'), 'utf8');
        assert.match(albaranes, /SearchField/, 'albaranes usa SearchField');
        assert.match(albaranes, /titleAlign="center"/, 'albaranes centra el título en la cabecera');
        assert.match(albaranes, /titleFace="display"/, 'albaranes usa la misma fuente de título que recetas');
        assert.match(albaranes, /data-element="albaranes-toolbar"/, 'albaranes alinea buscador y escanear');
        assert.match(consumption, /SearchField/, 'consumo usa SearchField');
        const movements = readFileSync(join(SRC_ROOT, 'app/dashboard/movements/page.tsx'), 'utf8');
        assert.match(movements, /<KpiStat /, 'tesorería resume con KpiStat');
        assert.match(movements, /SearchField/, 'tesorería busca con SearchField');
        assert.match(movements, /leadSlot/, 'tesorería pone los KPI fuera del papel');
        assert.match(movements, /label="Diferencia"/);
        assert.doesNotMatch(movements, /DIFER\. ACTUAL/);
    });

    it('PageScreen deja en el papel solo el protagonista', () => {
        const history = readFileSync(join(SRC_ROOT, 'app/dashboard/history/page.tsx'), 'utf8');
        const ventas = readFileSync(join(SRC_ROOT, 'app/dashboard/ventas/page.tsx'), 'utf8');
        const sala = readFileSync(join(SRC_ROOT, 'app/dashboard/sala/page.tsx'), 'utf8');
        const movements = readFileSync(join(SRC_ROOT, 'app/dashboard/movements/page.tsx'), 'utf8');
        const labor = readFileSync(join(SRC_ROOT, 'app/dashboard/labor/page.tsx'), 'utf8');
        const consumo = readFileSync(join(SRC_ROOT, 'app/dashboard/consumo-personal/page.tsx'), 'utf8');
        const horario = readFileSync(join(SRC_ROOT, 'app/horario/page.tsx'), 'utf8');
        const ledger = readFileSync(join(SRC_ROOT, 'components/ledger/ManagerLedgerView.tsx'), 'utf8');
        const asistencia = readFileSync(join(SRC_ROOT, 'app/staff/history/page.tsx'), 'utf8');
        const albaranes = readFileSync(
            join(SRC_ROOT, 'app/dashboard/albaranes/AlbaranesHistoricoClient.tsx'),
            'utf8'
        );
        const recipes = readFileSync(join(SRC_ROOT, 'app/recipes/page.tsx'), 'utf8');
        const inventory = readFileSync(join(SRC_ROOT, 'app/dashboard/inventory/InventoryClient.tsx'), 'utf8');
        const orders = readFileSync(join(SRC_ROOT, 'app/orders/new/page.tsx'), 'utf8');
        const insights = readFileSync(join(SRC_ROOT, 'app/dashboard/insights/InsightsClient.tsx'), 'utf8');
        const stock = readFileSync(join(SRC_ROOT, 'app/dashboard/inventory/ledger/LedgerClient.tsx'), 'utf8');
        const chrome = readFileSync(join(SRC_ROOT, 'components/chrome/ChromeScrollProvider.tsx'), 'utf8');
        const patrones = readFileSync(join(REPO_ROOT, 'marbella-os/2-diseno/PATRONES.md'), 'utf8');
        assert.match(history, /work=\{viewMode === 'calendar' \? 'calendar' : 'table'\}/, 'cierres: calendario y tabla flotan');
        assert.match(history, /leadSlot=\{/, 'cierres: KPI fuera del papel');
        assert.match(history, /periodSlot=\{/, 'cierres: el mes sigue en el centro');
        assert.match(history, /periodStartSlot=\{/, 'cierres: Calendario/Tabla a la izquierda de la fila');
        assert.match(history, /instance="history-vista"/, 'cierres: Calendario/Tabla a la izquierda de la fila');
        assert.doesNotMatch(history, /toolbarSlot=\{/, 'cierres: la vista no ocupa una fila propia');
        assert.match(history, /MonthCalendarFrame/, 'cierres: el calendario es el trabajo');
        assert.match(sala, /work="table"/, 'sala LIVE: las mesas flotan');
        assert.match(sala, /toolbarSlot=/, 'sala LIVE: SubNav fuera del papel');
        assert.match(ventas, /work="table"/, 'ventas: la tabla flota sobre el envolvente');
        assert.match(ventas, /data-table-piece/, 'ventas: pieza blanca flotante sin losa de fondo');
        assert.match(ventas, /toolbarSlot=\{/, 'ventas: SubNav fuera del papel');
        assert.match(ventas, /leadSlot=\{/, 'ventas: KPI y gráfico fuera del papel');
        assert.match(movements, /leadSlot=\{/, 'tesorería: KPI y acciones fuera del papel');
        assert.match(labor, /work="calendar"/, 'labor: el calendario flota');
        assert.match(labor, /leadSlot=\{/, 'labor: KPI fuera del papel');
        assert.match(consumo, /leadSlot=\{/, 'consumo: KPI fuera del papel');
        assert.match(horario, /toolbarSlot=\{/, 'horario: segmented fuera del papel');
        assert.match(ledger, /leadSlot=\{/, 'libro mayor: KPI fuera del papel');
        assert.match(asistencia, /work="calendar"/, 'asistencia: el calendario flota');
        assert.match(albaranes, /work="table"/, 'albaranes: la lista flota');
        assert.match(albaranes, /toolbarSlot=\{/, 'albaranes: buscador fuera del papel');
        assert.match(recipes, /toolbarSlot=\{/, 'recetas: buscador fuera del papel');
        assert.match(inventory, /toolbarSlot=\{/, 'inventario: buscador fuera del papel');
        assert.match(orders, /toolbarSlot=\{/, 'pedido: buscador fuera del papel');
        assert.match(insights, /leadSlot=\{/, 'insights: KPI fuera del papel');
        assert.match(stock, /toolbarSlot=\{/, 'stock: buscador fuera del papel');
        const waste = readFileSync(join(SRC_ROOT, 'app/dashboard/inventory/waste/WasteClient.tsx'), 'utf8');
        assert.match(waste, /toolbarSlot=\{/, 'mermas: buscador fuera del papel');
        assert.match(chrome, /toolbarPinned/, 'un solo oído de scroll clava el buscador');
        assert.match(chrome, /compact/, 'el tab bar tiene el paso de solo iconos');
        assert.match(patrones, /pieza blanca/);
        assert.match(patrones, /quedan los iconos/);
    });

    it('wizard, carta, proveedores e ingredientes recogen datos con Field', () => {
        const hosts = [
            'components/ingredients/IngredientWizard.tsx',
            'components/ingredients/IngredientEditModal.tsx',
            'components/carta/MenuItemEditModal.tsx',
            'components/carta/MenuCategoryEditModal.tsx',
            'components/recipes/RecipeNamePhotoEditModal.tsx',
            'app/suppliers/page.tsx',
        ];
        for (const rel of hosts) {
            const source = readFileSync(join(SRC_ROOT, rel), 'utf8');
            assert.match(source, /<Field/, `${rel} debe usar Field`);
        }
        const edit = readFileSync(join(SRC_ROOT, 'components/ingredients/IngredientEditModal.tsx'), 'utf8');
        assert.match(edit, /ConfirmModal/, 'eliminar ingrediente usa ConfirmModal');
        assert.doesNotMatch(edit, /confirm\(/, 'eliminar ingrediente no usa el diálogo nativo');
        assert.doesNotMatch(
            edit,
            /rounded-2xl border p-3 font-bold/,
            'el nombre no pinta una caja propia'
        );
    });
});
