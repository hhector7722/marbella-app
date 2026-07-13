'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/modal';
import { trackUsageModalApply } from '@/lib/usage/client';
import { staffSelectionApplySummary } from '@/lib/usage/modal-apply';

export interface PlantillaEmployee {
    id: string;
    first_name: string;
    last_name: string;
    role?: string;
    avatar_url?: string | null;
    end_date?: string | null;
    visible_in_plantilla?: boolean;
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
    /** Si true, muestra opción "Plantilla" primero (id ''); para vista asistencia manager */
    allowPlantilla?: boolean;
    /** Modo gestión: lista con toggles de visibilidad en plantilla */
    manageVisibility?: boolean;
    /** Callback al cambiar visible_in_plantilla (solo en manageVisibility) */
    onToggleVisibility?: (employeeId: string, visible: boolean) => void | Promise<void>;
    /** Acción de texto en cabecera (sin marco ni relleno) */
    headerTextAction?: { label: string; onClick: () => void };
    /** Si true, oculta la cruz (X) de cierre en cabecera */
    hideHeaderClose?: boolean;
}

const PLANTILLA_SENTINEL: PlantillaEmployee = { id: '', first_name: 'Plantilla', last_name: '' };

const HIDDEN_NAMES = new Set(['ramon', 'ramón', 'empleado']);

export function filterPlantillaEmployees(employees: PlantillaEmployee[]): PlantillaEmployee[] {
    return employees.filter((emp) => {
        const name = (emp.first_name || '').trim().toLowerCase();
        if (HIDDEN_NAMES.has(name)) return false;
        return true;
    });
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
            aria-checked={visible}
            aria-label={visible ? `Ocultar ${label} de plantilla` : `Mostrar ${label} en plantilla`}
            onClick={(e) => {
                e.stopPropagation();
                onToggle();
            }}
            className={cn(
                'flex min-h-12 min-w-[3.75rem] shrink-0 items-center rounded-full p-1 transition-colors',
                visible ? 'bg-emerald-600 justify-end' : 'bg-zinc-300/90 justify-start',
            )}
            title={visible ? 'Visible en plantilla' : 'Oculto en plantilla'}
        >
            <span className="h-8 w-8 max-h-full aspect-square rounded-full bg-white shadow-md shrink-0 pointer-events-none" />
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
    manageVisibility = false,
    onToggleVisibility,
    headerTextAction,
    hideHeaderClose = false
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

    const headerTrailing = (
        <>
            {onOpenTips && (
                <button
                    type="button"
                    onClick={onOpenTips}
                    className="inline-flex items-center justify-center min-h-[48px] h-10 px-2 rounded-2xl bg-transparent border-0 text-[9px] font-black uppercase tracking-widest text-white/90 hover:text-white active:scale-95 transition-all shrink-0"
                >
                    Propinas
                </button>
            )}
            {headerTextAction && (
                <button
                    type="button"
                    onClick={headerTextAction.onClick}
                    className="inline-flex items-center justify-center min-h-[48px] h-10 px-2 rounded-2xl bg-transparent border-0 text-[9px] font-black uppercase tracking-widest text-white/90 hover:text-white active:scale-95 transition-all shrink-0"
                >
                    {headerTextAction.label}
                </button>
            )}
        </>
    );

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title={title}
            headerVariant="petroleum"
            usageId={usageId}
            usageLabel={usageLabel}
            wrapperClassName={variant === 'profile-list' ? 'max-w-xl' : 'max-w-md'}
            className="rounded-[2rem]"
            scrollContent={false}
            zIndexClass="z-[150]"
            headerTrailing={headerTrailing}
            hideCloseButton={hideHeaderClose}
        >
            <div className={cn(
                "p-4 bg-white",
                manageVisibility || variant !== 'profile-list'
                    ? 'overflow-y-auto no-scrollbar flex-1'
                    : 'overflow-visible'
            )}>
                {children}

                {allowPlantilla && !manageVisibility && (
                    <button
                        type="button"
                        onClick={() => handleSelect(PLANTILLA_SENTINEL)}
                        className="w-full mb-3 py-2.5 px-3 rounded-xl bg-[#36606F]/10 border border-[#36606F]/20 text-[#36606F] text-[10px] font-black uppercase tracking-widest hover:bg-[#36606F]/20 active:scale-[0.98] transition-all"
                    >
                        Vista plantilla (todos)
                    </button>
                )}

                {manageVisibility ? (
                    <div className="divide-y divide-zinc-100">
                        {filteredEmployees.map((emp) => {
                            const visible = emp.visible_in_plantilla !== false;
                            const displayName = emp.first_name || 'Sin nombre';
                            return (
                                <div
                                    key={emp.id}
                                    className="flex min-h-12 items-center gap-3 py-3"
                                >
                                    <button
                                        type="button"
                                        onClick={() => handleSelect(emp)}
                                        className="flex min-h-12 flex-1 min-w-0 items-center gap-3 text-left active:opacity-70"
                                    >
                                        <Avatar src={emp.avatar_url} alt={displayName} size="md" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-black text-zinc-900 truncate uppercase tracking-tight">
                                                {displayName}
                                            </p>
                                            <p className="text-[10px] font-bold text-zinc-400 truncate uppercase tracking-wider">
                                                {emp.last_name || ' '}
                                                {emp.end_date ? ' · Baja' : ''}
                                            </p>
                                        </div>
                                    </button>
                                    <VisibilityToggle
                                        visible={visible}
                                        label={displayName}
                                        onToggle={() => onToggleVisibility?.(emp.id, !visible)}
                                    />
                                </div>
                            );
                        })}
                    </div>
                ) : variant === 'profile-list' ? (
                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                        {filteredEmployees.map((emp) => (
                            <button
                                key={emp.id}
                                type="button"
                                onClick={() => handleSelect(emp)}
                                className="group flex flex-col items-center gap-1 py-2 min-h-[48px] transition-all hover:opacity-80 active:scale-[0.98]"
                            >
                                <Avatar src={emp.avatar_url} alt={emp.first_name} size="md" />
                                <p className="text-[10px] font-black text-zinc-800 leading-tight truncate w-full text-center uppercase tracking-tight">
                                    {emp.first_name || 'Sin nombre'}
                                </p>
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-4 gap-2">
                        {filteredEmployees.map((emp) => (
                            <button
                                key={emp.id}
                                type="button"
                                onClick={() => handleSelect(emp)}
                                className="group flex flex-col items-center gap-1 p-2 rounded-[1.5rem] transition-all hover:bg-blue-50 active:scale-95 min-h-[48px]"
                            >
                                <div className="transition-all group-hover:-translate-y-1 shrink-0">
                                    <Avatar src={emp.avatar_url} alt={emp.first_name} size="md" />
                                </div>
                                <div className="text-center">
                                    <p className="text-[10px] font-black text-zinc-700 leading-tight truncate w-full max-w-[70px] uppercase">
                                        {emp.first_name}
                                    </p>
                                    <p className="text-[8px] font-bold text-zinc-400 uppercase tracking-tighter truncate w-full max-w-[70px]">
                                        {emp.last_name || ' '}
                                    </p>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </Modal>
    );
};
