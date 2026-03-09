import React from 'react';
import { X } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

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
}

export const StaffSelectionModal: React.FC<StaffSelectionModalProps> = ({
    isOpen,
    onClose,
    onSelect,
    employees,
    title = "Plantilla",
    variant = 'grid',
    children
}) => {
    if (!isOpen) return null;

    const filteredEmployees = employees.filter(emp => {
        const name = (emp.first_name || '').trim().toLowerCase();
        return name !== 'ramon' && name !== 'ramón' && name !== 'empleado';
    });

    const roleLabel = (role?: string) => {
        if (!role) return 'Staff';
        if (role === 'manager') return 'Manager';
        if (role === 'supervisor') return 'Supervisor';
        return 'Staff';
    };

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[150] p-4 animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className={cn(
                    "bg-white rounded-[2rem] shadow-2xl w-full overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]",
                    variant === 'profile-list' ? 'max-w-xl' : 'max-w-md'
                )}
                onClick={e => e.stopPropagation()}
            >
                {/* Header Estilo Marbella */}
                <div className="bg-[#36606F] px-8 py-6 flex justify-between items-center text-white shrink-0">
                    <div>
                        <h3 className="text-xl font-black uppercase tracking-wider leading-none">{title}</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-12 h-12 min-h-[48px] flex items-center justify-center bg-white/10 rounded-2xl hover:bg-white/20 transition-all text-white active:scale-90"
                    >
                        <X size={24} strokeWidth={3} />
                    </button>
                </div>

                <div className="p-4 overflow-y-auto no-scrollbar flex-1 bg-white">
                    {children}

                    {variant === 'profile-list' ? (
                        /* Iconos flotantes en 3–4 columnas: avatar circular, nombre debajo. Targets táctiles 48px+ */
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                            {filteredEmployees.map((emp) => {
                                const fullName = `${emp.first_name} ${emp.last_name || ''}`.trim();
                                return (
                                    <button
                                        key={emp.id}
                                        type="button"
                                        onClick={() => {
                                            onSelect(emp);
                                            onClose();
                                        }}
                                        className="group flex flex-col items-center gap-2 p-3 rounded-2xl bg-white border border-zinc-100 shadow-sm hover:shadow-md hover:border-[#36606F]/20 hover:bg-[#36606F]/5 transition-all active:scale-[0.98] min-h-[48px]"
                                    >
                                        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-zinc-100 flex items-center justify-center overflow-hidden shrink-0 border-2 border-zinc-100 group-hover:border-[#36606F]/30 transition-colors shadow-inner">
                                            {emp.avatar_url ? (
                                                <Image src={emp.avatar_url} alt={fullName} width={64} height={64} className="w-full h-full object-cover" />
                                            ) : (
                                                <img src="/icons/profile.png" alt="" className="w-10 h-10 sm:w-12 sm:h-12 object-contain opacity-70" />
                                            )}
                                        </div>
                                        <p className="text-[11px] sm:text-xs font-black text-zinc-800 leading-tight truncate w-full text-center uppercase tracking-tight">
                                            {fullName || 'Sin nombre'}
                                        </p>
                                        <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
                                            {roleLabel(emp.role)}
                                        </span>
                                    </button>
                                );
                            })}
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
                                    <div className="w-14 h-14 flex items-center justify-center transition-all group-hover:-translate-y-1">
                                        <Image
                                            src="/icons/user.png"
                                            alt={emp.first_name}
                                            width={48}
                                            height={48}
                                            className="w-12 h-12 object-contain opacity-80 group-hover:opacity-100 transition-opacity"
                                        />
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

                <div className="p-4 bg-zinc-50 border-t border-zinc-100 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-full min-h-[48px] h-12 bg-zinc-200 text-zinc-600 font-black uppercase tracking-widest text-[10px] rounded-xl hover:bg-zinc-300 transition-all active:scale-95"
                    >
                        Cerrar Ventana
                    </button>
                </div>
            </div>
        </div>
    );
};
