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
        assert.match(css, /\[data-component='PageScreen'\] \[data-element='header'\]/);
        assert.match(
            css,
            /\[data-component='PageScreen'\] \{[\s\S]*?width:\s*100%;[\s\S]*?padding-inline:\s*var\(--espacio-1\);/,
            'PageScreen móvil: ancho del dispositivo y el mismo margen a ambos lados'
        );
        assert.match(
            css,
            /\[data-component='PageScreen'\] \{[\s\S]*?overflow-x:\s*clip;/,
            'el contenido no empuja la tarjeta fuera del margen derecho'
        );
        assert.match(css, /\[data-component='Field'\]/);
        assert.match(css, /\[data-component='EmptyState'\]/);
        assert.match(css, /\[data-component='Notice'\]\[data-variant='negative'\]/);
        assert.match(css, /\[data-component='KpiStat'\]/);
        assert.match(css, /\[data-component='Table'\] thead/);
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
            assert.match(
                source,
                /from-red-500 to-red-600/,
                `${rel} debe usar la misma cabecera de días`
            );
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
        }
    });

    it('albaranes usa Field, EmptyState y Notice', () => {
        const source = readFileSync(
            join(SRC_ROOT, 'app/dashboard/albaranes/AlbaranesHistoricoClient.tsx'),
            'utf8'
        );
        assert.match(source, /<Field/);
        assert.match(source, /<EmptyState/);
        assert.match(source, /<Notice/);
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
        assert.match(admin, /<Surface /);
        assert.match(admin, /dashboard-horas-extras/);
        assert.match(admin, /bg-purple-600/);
        assert.match(ventas, /<Surface /);
        assert.match(ventas, /data-element="header"/);
        assert.match(ventas, /dashboard-ventas-total/);
        assert.doesNotMatch(ventas, /#36606F|#407080/);
        assert.match(ventas, /<KpiStat /);
        assert.match(staff, /<Surface /);
        assert.match(staff, /data-element="header"/);
    });

    it('tarjeta semanal de una persona es WeekCard; plantilla sigue aparte', () => {
        const staff = readFileSync(
            join(SRC_ROOT, 'components/dashboards/StaffDashboardView.tsx'),
            'utf8'
        );
        const overtimeModal = readFileSync(
            join(SRC_ROOT, 'components/WorkerWeeklyHistoryModal.tsx'),
            'utf8'
        );
        const history = readFileSync(join(SRC_ROOT, 'app/staff/history/page.tsx'), 'utf8');
        const plantilla = readFileSync(
            join(SRC_ROOT, 'app/staff/history/PlantillaWeekCard.tsx'),
            'utf8'
        );

        assert.match(staff, /from '@\/app\/staff\/history\/WeekCard'/);
        assert.match(staff, /<WeekCard/);
        assert.doesNotMatch(
            staff,
            /from-red-500 to-red-600/,
            'el mosaico Staff no clona la cabecera de días de la semana'
        );

        assert.match(overtimeModal, /from '@\/app\/staff\/history\/WeekCard'/);
        assert.match(overtimeModal, /<WeekCard/);

        assert.match(history, /<WeekCard/);
        assert.match(history, /<PlantillaWeekCard/);

        assert.doesNotMatch(plantilla, /from ['"].*\/WeekCard['"]/);
        assert.match(plantilla, /getInitials/);
        assert.doesNotMatch(plantilla, /Pendiente|Importe/);
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
        const nav = readFileSync(join(SRC_ROOT, 'components/time/PeriodNav.tsx'), 'utf8');
        assert.match(nav, /PeriodFilterButton/, 'el filtro de cabecera es siempre el mismo icono');
        assert.doesNotMatch(nav, /hasActiveFilter/, 'PeriodNav no tiene cruz de dismiss');
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

    it('sala LIVE usa Surface y no reintroduce radio ilegítimo ni cabecera clonada', () => {
        const sala = readFileSync(join(SRC_ROOT, 'app/dashboard/sala/page.tsx'), 'utf8');
        const radar = readFileSync(
            join(SRC_ROOT, 'components/dashboards/RadarSala.tsx'),
            'utf8'
        );
        assert.match(sala, /<Surface/);
        assert.match(sala, /instance="sala-live"/);
        assert.doesNotMatch(sala, /rounded-\[2\.5rem\]/);
        assert.doesNotMatch(sala, /italic/);
        assert.doesNotMatch(sala, /bg-\[#36606F\]/);
        assert.match(radar, /<Surface/);
        assert.match(radar, /<EmptyState/);
        assert.doesNotMatch(radar, /bg-\[#36606F\]/);
        assert.doesNotMatch(radar, /rounded-\[2\.5rem\]/);
    });

    it('tablas operativas usan thead de sistema (T8)', () => {
        const tables = [
            'app/dashboard/ventas/page.tsx',
            'app/dashboard/movements/page.tsx',
            'app/dashboard/history/page.tsx',
            'app/staff/actividades/gestion/page.tsx',
            'components/ledger/ManagerLedgerView.tsx',
            'components/tips/TipsDashboardView.tsx',
            'components/dashboards/DashboardVentasSection.tsx',
        ];
        for (const rel of tables) {
            const source = readFileSync(join(SRC_ROOT, rel), 'utf8');
            assert.match(source, /TABLE_COMPONENT_ID/, `${rel} debe usar Table`);
            assert.doesNotMatch(
                source,
                /<thead className="[^"]*bg-\[#36606F\]/,
                `${rel} no debe clonar thead petróleo`
            );
        }
    });

    it('recetas, ingredientes y proveedores montan la misma celda de catálogo a 4 columnas', () => {
        const pages = ['app/recipes/page.tsx', 'app/ingredients/page.tsx', 'app/suppliers/page.tsx'];
        for (const rel of pages) {
            const source = readFileSync(join(SRC_ROOT, rel), 'utf8');
            assert.match(source, /DashboardDetailLayout|PageScreen/, `${rel} debe usar PageScreen`);
            assert.match(source, /CatalogGrid/, `${rel} debe usar CatalogGrid`);
            assert.match(source, /CatalogTile/, `${rel} debe usar CatalogTile`);
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
        const tile = readFileSync(join(SRC_ROOT, 'components/catalog/CatalogTile.tsx'), 'utf8');
        assert.match(tile, /aspect-square/, 'la celda imagen+pie es un cuadrado');
        assert.match(tile, /grid-cols-4/, 'la rejilla es de 4 columnas');
        assert.match(tile, /gap-5/, 'hay aire entre celdas');
        assert.match(tile, /object-contain/, 'la imagen se reduce para caber');
        assert.match(tile, /h-5/, 'el pie reserva una sola fila en las tres páginas');
        assert.match(tile, /truncate/, 'el pie cabe en una fila');
        assert.doesNotMatch(tile, /break-words/, 'el pie no pasa a segunda fila');
        assert.doesNotMatch(tile, /bg-white/, 'la celda no tiene card blanca');
        assert.doesNotMatch(tile, /shadow-md/, 'la celda no tiene sombra de card');
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
});
