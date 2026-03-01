import React from 'react';
import { X } from 'lucide-react';
import Image from 'next/image';

interface Employee {
    id: string;
    first_name: string;
    last_name: string;
    role?: string;
}

interface StaffSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (employee: Employee) => void;
    employees: Employee[];
    title?: string;
    children?: React.ReactNode;
}

export const StaffSelectionModal: React.FC<StaffSelectionModalProps> = ({
    isOpen,
    onClose,
    onSelect,
    employees,
    title = "Plantilla",
    children
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
                className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]"
                onClick={e => e.stopPropagation()}
            >
                {/* Header Estilo Marbella */}
                <div className="bg-[#36606F] px-8 py-6 flex justify-between items-center text-white shrink-0">
                    <div>
                        <h3 className="text-xl font-black uppercase tracking-wider leading-none">{title}</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-12 h-12 flex items-center justify-center bg-white/10 rounded-2xl hover:bg-white/20 transition-all text-white active:scale-90"
                    >
                        <X size={24} strokeWidth={3} />
                    </button>
                </div>

                {/* Grid de Empleados (Bento Style Simplificado) */}
                <div className="p-4 overflow-y-auto no-scrollbar flex-1 bg-white">
                    {children}
                    <div className="grid grid-cols-4 gap-2">
                        {filteredEmployees.map((emp) => (
                            <button
                                key={emp.id}
                                onClick={() => {
                                    onSelect(emp);
                                    onClose();
                                }}
                                className="group flex flex-col items-center gap-1 p-2 rounded-[1.5rem] transition-all hover:bg-blue-50 active:scale-95"
                            >
                                {/* Contenedor Icono Flotante */}
                                <div className="w-14 h-14 flex items-center justify-center transition-all group-hover:-translate-y-1">
                                    <Image
                                        src="/icons/user.png"
                                        alt={emp.first_name}
                                        width={48}
                                        height={48}
                                        className="w-12 h-12 object-contain opacity-80 group-hover:opacity-100 transition-opacity"
                                    />
                                </div>

                                {/* Nombre */}
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
                </div>

                {/* Footer Sutil */}
                <div className="p-4 bg-zinc-50 border-t border-zinc-100 shrink-0">
                    <button
                        onClick={onClose}
                        className="w-full h-12 bg-zinc-200 text-zinc-600 font-black uppercase tracking-widest text-[10px] rounded-xl hover:bg-zinc-300 transition-all active:scale-95"
                    >
                        Cerrar Ventana
                    </button>
                </div>
            </div>
        </div>
    );
};
