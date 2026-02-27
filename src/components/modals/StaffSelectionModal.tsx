'use client';

import React, { useState } from 'react';
import { X, Search } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

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
    title = "Seleccionar Empleado",
    children
}) => {
    const [searchTerm, setSearchTerm] = useState('');

    if (!isOpen) return null;

    const filteredEmployees = employees.filter(emp =>
        `${emp.first_name} ${emp.last_name}`.toLowerCase().includes(searchTerm.toLowerCase())
    );

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
                        <p className="text-white/50 text-[10px] font-black uppercase tracking-[0.2em] mt-1.5 italic">
                            {employees.length} TRABAJADORES EN PLANTILLA
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-12 h-12 flex items-center justify-center bg-white/10 rounded-2xl hover:bg-white/20 transition-all text-white active:scale-90"
                    >
                        <X size={24} strokeWidth={3} />
                    </button>
                </div>

                {/* Buscador */}
                <div className="px-6 py-4 border-b border-zinc-100 bg-zinc-50/50 shrink-0">
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                        <input
                            type="text"
                            placeholder="Buscar por nombre..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full h-12 pl-12 pr-4 bg-white border-2 border-zinc-200 rounded-2xl text-sm font-bold text-zinc-700 focus:ring-4 focus:ring-blue-50 focus:border-[#5B8FB9] outline-none transition-all placeholder:text-zinc-300"
                            autoFocus
                        />
                    </div>
                </div>

                {/* Grid de Empleados (Bento Style) */}
                <div className="p-6 overflow-y-auto no-scrollbar flex-1 bg-white">
                    {children}
                    {filteredEmployees.length === 0 ? (
                        <div className="py-12 text-center">
                            <p className="text-zinc-400 font-bold italic">No se encontraron resultados</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 gap-4">
                            {filteredEmployees.map((emp) => (
                                <button
                                    key={emp.id}
                                    onClick={() => {
                                        onSelect(emp);
                                        onClose();
                                    }}
                                    className="group flex flex-col items-center gap-3 p-4 rounded-[1.5rem] transition-all hover:bg-blue-50 active:scale-95 border-2 border-transparent hover:border-blue-100"
                                >
                                    {/* Contenedor Icono */}
                                    <div className="w-16 h-16 rounded-2xl bg-zinc-50 flex items-center justify-center overflow-hidden border border-zinc-100 group-hover:shadow-lg transition-all group-hover:-translate-y-1">
                                        <Image
                                            src="/icons/user.png"
                                            alt={emp.first_name}
                                            width={48}
                                            height={48}
                                            className="w-10 h-10 object-contain opacity-80 group-hover:opacity-100 transition-opacity"
                                        />
                                    </div>

                                    {/* Nombre */}
                                    <div className="text-center">
                                        <p className="text-xs font-black text-zinc-700 leading-tight truncate w-full max-w-[80px]">
                                            {emp.first_name}
                                        </p>
                                        <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-tighter truncate w-full max-w-[80px]">
                                            {emp.last_name || ' '}
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
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
