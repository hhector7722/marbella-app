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
        assert.equal(PAGE_SCREEN_FORBIDDEN_RADIUS, 'rounded-[2.5rem]');
    });

    it('CSS fija Surface, PageScreen, Field, EmptyState, Notice y KpiStat', () => {
        const css = readFileSync(join(SRC_ROOT, 'app/globals.css'), 'utf8');
        assert.match(css, /\[data-component='Surface'\]\[data-variant='page'\]/);
        assert.match(css, /--elevacion-pagina/);
        assert.match(css, /\[data-component='PageScreen'\] \[data-element='header'\]/);
        assert.match(css, /\[data-component='Field'\]/);
        assert.match(css, /\[data-component='EmptyState'\]/);
        assert.match(css, /\[data-component='Notice'\]\[data-variant='negative'\]/);
        assert.match(css, /\[data-component='KpiStat'\]/);
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
