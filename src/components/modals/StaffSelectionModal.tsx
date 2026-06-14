'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/modal';

interface Employee {
    id: string;
    first_name: string;
    last_name: string;
    role?: string;
    avatar_url?: string | null;
    end_date?: string | null;
}

interface StaffSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (employee: Employee) => void;
    employees: Employee[];
    title?: string;
    /** 'grid' = cuadrícula compacta (registros, historial). 'profile-list' = lista tipo ficha perfil (Plantilla → /profile) */
    variant?: 'grid' | 'profile-list';
    children?: React.ReactNode;
    /** Opcional: botón en cabecera para abrir la vista de Propinas desde /dashboard (Plantilla) */
    onOpenTips?: () => void;
    /** Si true, muestra opción "Plantilla" primero (id ''); para vista asistencia manager */
    allowPlantilla?: boolean;
    /** Si true, incluye empleados con end_date (inactivos) */
    includeInactive?: boolean;
    /** Acción de texto en cabecera (sin marco ni relleno) */
    headerTextAction?: { label: string; onClick: () => void };
    /** Si true, oculta la cruz (X) de cierre en cabecera */
    hideHeaderClose?: boolean;
}

const PLANTILLA_SENTINEL: Employee = { id: '', first_name: 'Plantilla', last_name: '' };

export const StaffSelectionModal: React.FC<StaffSelectionModalProps> = ({
    isOpen,
    onClose,
    onSelect,
    employees,
    title = "Plantilla",
    variant = 'grid',
    children,
    onOpenTips,
    allowPlantilla = false,
    includeInactive = false,
    headerTextAction,
    hideHeaderClose = false
}) => {
    const filteredEmployees = employees.filter(emp => {
        const name = (emp.first_name || '').trim().toLowerCase();
        if (name === 'ramon' || name === 'ramón' || name === 'empleado') return false;
        if (!includeInactive && emp.end_date) return false;
        return true;
    });

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
            usageId="staff-selection"
            usageLabel="Selección de plantilla"
            wrapperClassName={variant === 'profile-list' ? 'max-w-xl' : 'max-w-md'}
            className="rounded-[2rem]"
            scrollContent={false}
            zIndexClass="z-[150]"
            headerTrailing={headerTrailing}
            hideCloseButton={hideHeaderClose}
        >
            <div className={cn(
                "p-4 bg-white",
                variant === 'profile-list' ? 'overflow-visible' : 'overflow-y-auto no-scrollbar flex-1'
            )}>
                {children}

                {allowPlantilla && (
                    <button
                        type="button"
                        onClick={() => {
                            onSelect(PLANTILLA_SENTINEL);
                            onClose();
                        }}
                        className="w-full mb-3 py-2.5 px-3 rounded-xl bg-[#36606F]/10 border border-[#36606F]/20 text-[#36606F] text-[10px] font-black uppercase tracking-widest hover:bg-[#36606F]/20 active:scale-[0.98] transition-all"
                    >
                        Vista plantilla (todos)
                    </button>
                )}

                {variant === 'profile-list' ? (
                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                        {filteredEmployees.map((emp) => (
                            <button
                                key={emp.id}
                                type="button"
                                onClick={() => {
                                    onSelect(emp);
                                    onClose();
                                }}
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
                                onClick={() => {
                                    onSelect(emp);
                                    onClose();
                                }}
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
