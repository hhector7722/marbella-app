'use client';

import React, { useState, useMemo } from 'react';
import { Search, X, ChevronLeft, ChevronRight, FileText, FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/modal';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Employee {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url?: string | null;
}

export type MonthSelection = { year: number; month: number };

interface MultiEmployeeExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    employees: Employee[];
    onExport: (selectedIds: string[], months: MonthSelection[], format: 'pdf' | 'xlsx') => void;
    isExporting: boolean;
    initialYear: number;
    initialMonth: number;
}

const MONTH_NAMES = Array.from({ length: 12 }).map((_, i) =>
    format(new Date(2000, i, 1), 'MMM', { locale: es }),
);

function monthKey(year: number, month: number) { return `${year}-${month}`; }

export function MultiEmployeeExportModal({
    isOpen,
    onClose,
    employees,
    onExport,
    isExporting,
    initialYear,
    initialMonth,
}: MultiEmployeeExportModalProps) {
    const [search, setSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(employees.map((e) => e.id)));
    const [pickerYear, setPickerYear] = useState(initialYear);
    const [selectedMonths, setSelectedMonths] = useState<Set<string>>(() => new Set([monthKey(initialYear, initialMonth)]));

    const filtered = useMemo(() => {
        if (!search.trim()) return employees;
        const q = search.toLowerCase().trim();
        return employees.filter((e) => {
            const name = `${e.first_name} ${e.last_name}`.toLowerCase();
            return name.includes(q);
        });
    }, [employees, search]);

    const allFilteredSelected = filtered.length > 0 && filtered.every((e) => selectedIds.has(e.id));

    const toggleAll = () => {
        if (allFilteredSelected) {
            const newSet = new Set(selectedIds);
            filtered.forEach((e) => newSet.delete(e.id));
            setSelectedIds(newSet);
        } else {
            const newSet = new Set(selectedIds);
            filtered.forEach((e) => newSet.add(e.id));
            setSelectedIds(newSet);
        }
    };

    const toggle = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const toggleMonth = (m: number) => {
        const key = monthKey(pickerYear, m);
        const newSet = new Set(selectedMonths);
        if (newSet.has(key)) newSet.delete(key);
        else newSet.add(key);
        setSelectedMonths(newSet);
    };

    const monthsArray = Array.from(selectedMonths)
        .map((k) => { const [y, m] = k.split('-').map(Number); return { year: y, month: m }; })
        .sort((a, b) => a.year - b.year || a.month - b.month);

    const handleExport = (format: 'pdf' | 'xlsx') => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0 || monthsArray.length === 0) return;
        onExport(ids, monthsArray, format);
    };

    const selectedCount = selectedIds.size;

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title="Exportar empleados"
            subtitle={`${employees.length} empleados activos`}
            headerVariant="petroleum"
            wrapperClassName="max-w-md"
            zIndexClass="z-[160]"
        >
            <div className="flex flex-col max-h-[75dvh]">
                {/* ── SELECCIÓN DE MESES ── */}
                <div className="shrink-0 px-4 pt-3 pb-2 border-b border-zinc-100">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">Meses</span>
                        <span className="text-[10px] font-bold text-zinc-500">{monthsArray.length} seleccionado{monthsArray.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                        <button
                            type="button"
                            onClick={() => setPickerYear((p) => p - 1)}
                            className="p-1 hover:bg-zinc-100 rounded-lg transition-colors text-zinc-400"
                        >
                            <ChevronLeft size={14} />
                        </button>
                        <span className="text-xs font-black text-zinc-700">{pickerYear}</span>
                        <button
                            type="button"
                            onClick={() => setPickerYear((p) => p + 1)}
                            className="p-1 hover:bg-zinc-100 rounded-lg transition-colors text-zinc-400"
                        >
                            <ChevronRight size={14} />
                        </button>
                    </div>
                    <div className="grid grid-cols-6 gap-1">
                        {MONTH_NAMES.map((name, i) => {
                            const key = monthKey(pickerYear, i);
                            const active = selectedMonths.has(key);
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => toggleMonth(i)}
                                    className={cn(
                                        'py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border min-h-[32px]',
                                        active
                                            ? 'bg-[#36606F] border-[#36606F] text-white shadow-sm'
                                            : 'bg-zinc-50 border-zinc-200 text-zinc-500 hover:border-[#36606F]/30 hover:text-zinc-700',
                                    )}
                                >
                                    {name}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ── SELECCIÓN DE EMPLEADOS ── */}
                <div className="shrink-0 px-4 pt-3 pb-2 space-y-2">
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar empleado..."
                            className="w-full h-9 pl-8 pr-3 rounded-xl bg-zinc-100 text-xs font-medium text-zinc-700 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#36606F]/30"
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <button
                            type="button"
                            onClick={toggleAll}
                            className="text-[10px] font-bold text-[#36606F] uppercase tracking-wider hover:underline"
                        >
                            {allFilteredSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
                        </button>
                        <span className="text-[10px] font-bold text-zinc-500">
                            {selectedCount} seleccionados
                        </span>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-3 space-y-1">
                    {filtered.length === 0 ? (
                        <div className="py-8 text-center text-zinc-400 text-xs font-bold">
                            No hay empleados que coincidan
                        </div>
                    ) : (
                        filtered.map((emp) => {
                            const checked = selectedIds.has(emp.id);
                            return (
                                <label
                                    key={emp.id}
                                    className={cn(
                                        'flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors',
                                        checked ? 'bg-[#36606F]/5' : 'hover:bg-zinc-50'
                                    )}
                                >
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggle(emp.id)}
                                        className="w-4 h-4 rounded border-zinc-300 text-[#36606F] focus:ring-[#36606F]/30 accent-[#36606F]"
                                    />
                                    <Avatar src={emp.avatar_url} alt={emp.first_name} size="sm" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-black text-zinc-800 uppercase truncate">
                                            {emp.first_name} {emp.last_name}
                                        </p>
                                    </div>
                                </label>
                            );
                        })
                    )}
                </div>

                <div className="shrink-0 border-t border-zinc-100 px-4 py-3 flex gap-2">
                    <button
                        type="button"
                        onClick={() => handleExport('pdf')}
                        disabled={selectedCount === 0 || monthsArray.length === 0 || isExporting}
                        className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-[#36606F] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#36606F]/90 disabled:opacity-40 transition-all active:scale-[0.98]"
                    >
                        <FileText size={14} />
                        PDF
                    </button>
                    <button
                        type="button"
                        onClick={() => handleExport('xlsx')}
                        disabled={selectedCount === 0 || monthsArray.length === 0 || isExporting}
                        className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-40 transition-all active:scale-[0.98]"
                    >
                        <FileSpreadsheet size={14} />
                        EXCEL
                    </button>
                </div>
            </div>
        </Modal>
    );
}
