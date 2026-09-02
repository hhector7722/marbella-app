'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/modal';
import { isHiddenPlantillaName } from '@/lib/staff/plantilla-employees';
import { trackUsageModalApply } from '@/lib/usage/client';
import { staffSelectionApplySummary } from '@/lib/usage/modal-apply';

export interface PlantillaEmployee {
    id: string;
    first_name: string;
    last_name: string;
    role?: string;
    email?: string | null;
    avatar_url?: string | null;
    end_date?: string | null;
    visible_in_plantilla?: boolean;
}

export interface StaffListEndAction {
    label: string;
    onClick: () => void | Promise<void>;
}

interface StaffSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (employee: PlantillaEmployee) => void;
    employees: PlantillaEmployee[];
    title?: string;
    /** Identificador de uso para tracking (por pantalla). */
    usageId?: string;
    /** Etiqueta legible del modal en tracking de uso. */
    usageLabel?: string;
    /** 'grid' = cuadrícula compacta (registros, historial). 'profile-list' = lista tipo ficha perfil (Plantilla → /profile) */
    variant?: 'grid' | 'profile-list';
    children?: React.ReactNode;
    /** Opcional: botón en cabecera para abrir la vista de Propinas desde /dashboard (Plantilla) */
    onOpenTips?: () => void;
    /** Si true, añade «Ver todos / Ver activos» como último usuario (id '') */
    allowPlantilla?: boolean;
    /** Si la vista plantilla (todos) está activa; el último usuario pasa a «Ver activos» */
    plantillaSelected?: boolean;
    /** Modo gestión: lista con toggles de visibilidad en plantilla */
    manageVisibility?: boolean;
    /** Callback al cambiar visible_in_plantilla (solo en manageVisibility) */
    onToggleVisibility?: (employeeId: string, visible: boolean) => void | Promise<void>;
    /**
     * Último ítem del listado, como un usuario más.
     * Si no se pasa y `allowPlantilla` es true, se usa «Ver todos» / «Ver activos».
     */
    listEndAction?: StaffListEndAction;
    /** Si true, oculta la cruz (X) de cierre en cabecera */
    hideHeaderClose?: boolean;
    /**
     * Flecha atrás en cabecera (sin marco/relleno).
     * Solo pasar cuando el modal se abre desde `/profile` (navega a inicio).
     * Desde dashboard u otras pantallas no debe pasarse.
     */
    onBack?: () => void;
}

const PLANTILLA_SENTINEL: PlantillaEmployee = { id: '', first_name: 'Plantilla', last_name: '' };

export function filterPlantillaEmployees(employees: PlantillaEmployee[]): PlantillaEmployee[] {
    return employees.filter((emp) => !isHiddenPlantillaName(emp.first_name));
}

function VisibilityToggle({
    visible,
    onToggle,
    label,
}: {
    visible: boolean;
    onToggle: () => void;
    label: string;
}) {
    return (
        <button
            type="button"
            role="switch"
            data-visibility-toggle="true"
            aria-checked={visible}
            aria-label={visible ? `Ocultar ${label} de plantilla` : `Mostrar ${label} en plantilla`}
            onClick={(e) => {
                e.stopPropagation();
                onToggle();
            }}
            className={cn(
                'absolute top-0 right-0 z-10 flex h-5 w-8 items-center rounded-full p-0.5',
                visible ? 'bg-emerald-600 justify-end' : 'bg-zinc-300/90 justify-start',
            )}
            title={visible ? 'Visible en plantilla' : 'Oculto en plantilla'}
        >
            <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-white shadow-sm pointer-events-none" />
        </button>
    );
}

function ListEndUserTile({
    variant,
    label,
    onClick,
}: {
    variant: 'profile-list' | 'grid';
    label: string;
    onClick: () => void;
}) {
    if (variant === 'profile-list') {
        return (
            <button
                type="button"
                data-list-end="true"
                onClick={onClick}
                aria-label={label}
                className="group flex flex-col items-center gap-1 py-2 min-h-[48px] transition-all hover:opacity-80 active:scale-[0.98]"
            >
                <Avatar src={null} alt={label} size="md" />
                <p className="text-[10px] font-medium text-zinc-800 leading-tight w-full text-center tracking-tight">
                    {label}
                </p>
            </button>
        );
    }

    return (
        <button
            type="button"
            data-list-end="true"
            onClick={onClick}
            aria-label={label}
            className="group flex flex-col items-center gap-1 p-2 rounded-[1.5rem] transition-all hover:bg-blue-50 active:scale-95 min-h-[48px]"
        >
            <div className="transition-all group-hover:-translate-y-1 shrink-0">
                <Avatar src={null} alt={label} size="md" />
            </div>
            <div className="text-center">
                <p className="text-[10px] font-medium text-zinc-700 leading-tight w-full max-w-[70px]">
                    {label}
                </p>
                <p className="text-[8px] font-medium text-zinc-400 tracking-tighter w-full max-w-[70px]">
                    {' '}
                </p>
            </div>
        </button>
    );
}

export const StaffSelectionModal: React.FC<StaffSelectionModalProps> = ({
    isOpen,
    onClose,
    onSelect,
    employees,
    title = "Plantilla",
    usageId = 'staff-selection',
    usageLabel = 'Selección de plantilla',
    variant = 'grid',
    children,
    onOpenTips,
    allowPlantilla = false,
    plantillaSelected = false,
    manageVisibility = false,
    onToggleVisibility,
    listEndAction,
    hideHeaderClose = false,
    onBack,
}) => {
    const pathname = usePathname();

    const handleSelect = (employee: PlantillaEmployee) => {
        const summary = staffSelectionApplySummary(employee);
        trackUsageModalApply(
            usageId,
            usageLabel,
            pathname,
            summary,
            employee.id ? { selectedUserId: employee.id } : { selectedUserId: null }
        );
        onSelect(employee);
        onClose();
    };

    const filteredEmployees = filterPlantillaEmployees(employees);

    const endAction: StaffListEndAction | undefined = listEndAction ?? (
        allowPlantilla
            ? {
                label: plantillaSelected ? 'Ver activos' : 'Ver todos',
                onClick: () => {
                    if (plantillaSelected) return;
                    handleSelect(PLANTILLA_SENTINEL);
                },
            }
            : undefined
    );

    const handleEndAction = () => {
        void endAction?.onClick();
    };

    const endTileVariant = variant === 'profile-list' ? 'profile-list' : 'grid';

    const endTile = endAction ? (
        <ListEndUserTile
            variant={endTileVariant}
            label={endAction.label}
            onClick={handleEndAction}
        />
    ) : null;

    const headerTrailing = onOpenTips ? (
        <button
            type="button"
            onClick={onOpenTips}
            className="inline-flex items-center justify-center min-h-[48px] h-10 px-2 rounded-2xl bg-transparent border-0 text-[9px] font-black uppercase tracking-widest text-white/90 hover:text-white active:scale-95 transition-all shrink-0"
        >
            Propinas
        </button>
    ) : undefined;

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title={title}
            headerVariant="petroleum"
            scheme="dark"
            usageId={usageId}
            usageLabel={usageLabel}
            variant={variant === 'profile-list' ? 'amplify' : 'standard'}
            scrollContent={false}
            headerTrailing={headerTrailing}
            hideCloseButton={hideHeaderClose}
            onBack={onBack}
            onBackPlain={Boolean(onBack)}
        >
            <div className={cn(
                "bg-white",
                manageVisibility || variant !== 'profile-list'
                    ? 'overflow-y-auto no-scrollbar flex-1'
                    : 'overflow-visible'
            )}>
                {children}

                {variant === 'profile-list' ? (
                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                        {filteredEmployees.map((emp) => {
                            const visible = emp.visible_in_plantilla !== false;
                            return (
                                <div key={emp.id} className="relative">
                                    <button
                                        type="button"
                                        onClick={() => handleSelect(emp)}
                                        className="group flex w-full flex-col items-center gap-1 py-2 min-h-[48px] transition-all hover:opacity-80 active:scale-[0.98]"
                                    >
                                        <Avatar src={emp.avatar_url} alt={emp.first_name} size="md" />
                                        <p className="text-[10px] font-medium text-zinc-800 leading-tight truncate w-full text-center tracking-tight">
                                            {emp.first_name || 'Sin nombre'}
                                        </p>
                                    </button>
                                    {manageVisibility ? (
                                        <VisibilityToggle
                                            visible={visible}
                                            label={emp.first_name || 'Sin nombre'}
                                            onToggle={() => onToggleVisibility?.(emp.id, !visible)}
                                        />
                                    ) : null}
                                </div>
                            );
                        })}
                        {endTile}
                    </div>
                ) : (
                    <div className="grid grid-cols-4 gap-2">
                        {filteredEmployees.map((emp) => {
                            const visible = emp.visible_in_plantilla !== false;
                            return (
                                <div key={emp.id} className="relative">
                                    <button
                                        type="button"
                                        onClick={() => handleSelect(emp)}
                                        className="group flex w-full flex-col items-center gap-1 p-2 rounded-[1.5rem] transition-all hover:bg-blue-50 active:scale-95 min-h-[48px]"
                                    >
                                        <div className="transition-all group-hover:-translate-y-1 shrink-0">
                                            <Avatar src={emp.avatar_url} alt={emp.first_name} size="md" />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-[10px] font-medium text-zinc-700 leading-tight truncate w-full max-w-[70px]">
                                                {emp.first_name}
                                            </p>
                                            <p className="text-[8px] font-medium text-zinc-400 tracking-tighter truncate w-full max-w-[70px]">
                                                {emp.last_name || ' '}
                                            </p>
                                        </div>
                                    </button>
                                    {manageVisibility ? (
                                        <VisibilityToggle
                                            visible={visible}
                                            label={emp.first_name || 'Sin nombre'}
                                            onToggle={() => onToggleVisibility?.(emp.id, !visible)}
                                        />
                                    ) : null}
                                </div>
                            );
                        })}
                        {endTile}
                    </div>
                )}
            </div>
        </Modal>
    );
};
