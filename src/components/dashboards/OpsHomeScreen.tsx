'use client';

import type { ReactNode } from 'react';
import { HomeScreen, HomeScreenSlot } from '@/components/dashboards/HomeScreen';

export type OpsHomeScreenProps = {
    ventas: ReactNode;
    ultimoCierre: ReactNode;
    horario: ReactNode;
    iconCajaInicial: ReactNode;
    iconCajasCambio: ReactNode;
    iconAsistencia: ReactNode;
    iconMasFunciones: ReactNode;
    iconMObra: ReactNode;
    iconPlantilla: ReactNode;
    iconStock: ReactNode;
    iconRecetas: ReactNode;
    iconAlbaranes: ReactNode;
    iconIngredientes: ReactNode;
};

/**
 * Mosaico Admin. Horario 3×2 en filas 3–4; C inicial y Plantilla a la derecha.
 * Fila 5: M obra, stock, recetas, albaranes.
 * Última fila: otros, asistencia, cajas cambio, ingredientes.
 */
export function OpsHomeScreen({
    ventas,
    ultimoCierre,
    horario,
    iconCajaInicial,
    iconCajasCambio,
    iconAsistencia,
    iconMasFunciones,
    iconMObra,
    iconPlantilla,
    iconStock,
    iconRecetas,
    iconAlbaranes,
    iconIngredientes,
}: OpsHomeScreenProps) {
    return (
        <HomeScreen layout="ops-admin">
            <HomeScreenSlot size="wide" instance="dashboard-ventas">
                {ventas}
            </HomeScreenSlot>
            <HomeScreenSlot size="wide" instance="master-ultimo-cierre">
                {ultimoCierre}
            </HomeScreenSlot>
            <HomeScreenSlot size="panel" instance="master-horarios">
                {horario}
            </HomeScreenSlot>
            <HomeScreenSlot size="icon" instance="caja-inicial" label="C Inicial" column={4}>
                {iconCajaInicial}
            </HomeScreenSlot>
            <HomeScreenSlot size="icon" instance="admin-plantilla" column={4}>
                {iconPlantilla}
            </HomeScreenSlot>
            <HomeScreenSlot size="icon" instance="admin-m-obra" column={1}>
                {iconMObra}
            </HomeScreenSlot>
            <HomeScreenSlot size="icon" instance="admin-stock" column={2}>
                {iconStock}
            </HomeScreenSlot>
            <HomeScreenSlot size="icon" instance="admin-recetas" column={3}>
                {iconRecetas}
            </HomeScreenSlot>
            <HomeScreenSlot size="icon" instance="admin-albaranes" column={4}>
                {iconAlbaranes}
            </HomeScreenSlot>
            <HomeScreenSlot size="icon" instance="admin-mas-funciones" column={1}>
                {iconMasFunciones}
            </HomeScreenSlot>
            <HomeScreenSlot size="icon" instance="admin-asistencia" column={2}>
                {iconAsistencia}
            </HomeScreenSlot>
            <HomeScreenSlot size="icon" instance="cajas-cambio" label="Cajas Cambio" column={3}>
                {iconCajasCambio}
            </HomeScreenSlot>
            <HomeScreenSlot size="icon" instance="admin-ingredientes" column={4}>
                {iconIngredientes}
            </HomeScreenSlot>
        </HomeScreen>
    );
}
