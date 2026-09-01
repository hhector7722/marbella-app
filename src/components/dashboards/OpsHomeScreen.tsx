'use client';

import type { ReactNode } from 'react';
import { HomeScreen, HomeScreenSlot } from '@/components/dashboards/HomeScreen';

export type OpsHomeScreenProps = {
    ventas: ReactNode;
    cajaInicial: ReactNode;
    horasExtras: ReactNode;
    cajaCambio1: ReactNode;
    cajaCambio2: ReactNode;
    iconAsistencia: ReactNode;
    iconMObra: ReactNode;
    iconPlantilla: ReactNode;
    iconStock: ReactNode;
    iconRecetas: ReactNode;
    iconAlbaranes: ReactNode;
    iconCambio: ReactNode;
    iconIngredientes: ReactNode;
};

/**
 * Mosaico Admin. H. extras 3×2 en filas 3–4; Plantilla y Albaranes a la derecha.
 * Fila 5: Cambio 1, Cambio 2, Recetas, Asistencia.
 * Última fila: M obra, Stock, Ingredientes, Cambio.
 */
export function OpsHomeScreen({
    ventas,
    cajaInicial,
    horasExtras,
    cajaCambio1,
    cajaCambio2,
    iconAsistencia,
    iconMObra,
    iconPlantilla,
    iconStock,
    iconRecetas,
    iconAlbaranes,
    iconCambio,
    iconIngredientes,
}: OpsHomeScreenProps) {
    return (
        <HomeScreen layout="ops-admin">
            <HomeScreenSlot size="wide" instance="dashboard-ventas">
                {ventas}
            </HomeScreenSlot>
            <HomeScreenSlot size="wide" instance="dashboard-caja-inicial">
                {cajaInicial}
            </HomeScreenSlot>
            <HomeScreenSlot size="panel" instance="dashboard-horas-extras">
                {horasExtras}
            </HomeScreenSlot>
            <HomeScreenSlot size="icon" instance="admin-plantilla" column={4}>
                {iconPlantilla}
            </HomeScreenSlot>
            <HomeScreenSlot size="icon" instance="admin-albaranes" column={4}>
                {iconAlbaranes}
            </HomeScreenSlot>
            <HomeScreenSlot size="tile" instance="dashboard-caja-cambio-1" label="Cambio 1" column={1}>
                {cajaCambio1}
            </HomeScreenSlot>
            <HomeScreenSlot size="tile" instance="dashboard-caja-cambio-2" label="Cambio 2" column={2}>
                {cajaCambio2}
            </HomeScreenSlot>
            <HomeScreenSlot size="icon" instance="admin-recetas" column={3}>
                {iconRecetas}
            </HomeScreenSlot>
            <HomeScreenSlot size="icon" instance="admin-asistencia" column={4}>
                {iconAsistencia}
            </HomeScreenSlot>
            <HomeScreenSlot size="icon" instance="admin-m-obra" column={1}>
                {iconMObra}
            </HomeScreenSlot>
            <HomeScreenSlot size="icon" instance="admin-stock" column={2}>
                {iconStock}
            </HomeScreenSlot>
            <HomeScreenSlot size="icon" instance="admin-ingredientes" column={3}>
                {iconIngredientes}
            </HomeScreenSlot>
            <HomeScreenSlot size="icon" instance="admin-cambio" column={4}>
                {iconCambio}
            </HomeScreenSlot>
        </HomeScreen>
    );
}
