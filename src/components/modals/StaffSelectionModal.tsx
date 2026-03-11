import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';

interface Employee {
    id: string;
    first_name: string;
    last_name: string;
    role?: string;
    avatar_url?: string | null;
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
    allowPlantilla = false
}) => {
    if (!isOpen) return null;

    const filteredEmployees = employees.filter(emp => {
        const name = (emp.first_name || '').trim().toLowerCase();
        return name !== 'ramon' && name !== 'ramón' && name !== 'empleado';
    });

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[150] p-4 animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className={cn(
                    "bg-white rounded-[2rem] shadow-2xl w-full overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col",
                    variant === 'profile-list' ? 'max-w-xl' : 'max-w-md'
                )}
                onClick={e => e.stopPropagation()}
            >
                {/* Header Estilo Marbella */}
                <div className={cn(
                    "bg-[#36606F] flex justify-between items-center text-white shrink-0",
                    variant === 'profile-list' ? 'px-6 py-4' : 'px-8 py-6'
                )}>
                    <div className="flex items-center gap-3 min-w-0">
                        <h3 className="text-xl font-black uppercase tracking-wider leading-none truncate">{title}</h3>
                        {onOpenTips && (
                            <button
                                type="button"
                                onClick={onOpenTips}
                                className="hidden sm:inline-flex items-center justify-center h-9 px-3 rounded-2xl bg-white/10 hover:bg-white/20 text-[9px] font-black uppercase tracking-widest border border-white/20 active:scale-95 transition-all shrink-0"
                            >
                                Propinas
                            </button>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="w-12 h-12 min-h-[48px] flex items-center justify-center bg-white/10 rounded-2xl hover:bg-white/20 transition-all text-white active:scale-90"
                    >
                        <X size={24} strokeWidth={3} />
                    </button>
                </div>

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
                        /* Iconos flotantes sobre contenedor: sin tarjetas, sin marco avatar, solo primer nombre */
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
            </div>
        </div>
    );
};
