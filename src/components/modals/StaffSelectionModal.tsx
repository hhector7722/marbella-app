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
        if (role === 'manager') return 'Manager';
        if (role === 'supervisor') return 'Supervisor';
        return null; // No mostrar "Staff"
    };

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

                <div className={cn(
                    "p-4 bg-white",
                    variant === 'profile-list' ? 'overflow-visible' : 'overflow-y-auto no-scrollbar flex-1'
                )}>
                    {children}

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
                                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center overflow-hidden shrink-0">
                                        {emp.avatar_url ? (
                                            <Image src={emp.avatar_url} alt={emp.first_name} width={56} height={56} className="w-full h-full object-cover" />
                                        ) : (
                                            <img src="/icons/profile.png" alt="" className="w-8 h-8 sm:w-10 sm:h-10 object-contain opacity-70" />
                                        )}
                                    </div>
                                    <p className="text-[10px] font-black text-zinc-800 leading-tight truncate w-full text-center uppercase tracking-tight">
                                        {emp.first_name || 'Sin nombre'}
                                    </p>
                                    {roleLabel(emp.role) && (
                                        <span className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest">
                                            {roleLabel(emp.role)}
                                        </span>
                                    )}
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
            </div>
        </div>
    );
};
