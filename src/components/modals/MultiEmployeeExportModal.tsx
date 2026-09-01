'use client';

import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/ui/SearchField';
import { monthCellDarkClassName } from '@/components/time/MonthPickerGrid';
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
            variant="standard"
            layer="base"
            instance="staff-history-export-employees"
            usageId="staff-history-export-employees"
            usageLabel="Exportar empleados"
            title="Exportar empleados"
            subtitle={`${employees.length} empleados activos`}
            scheme="dark"
            footer={
                <>
                    <Button
                        type="button"
                        variant="primary"
                        instance="staff-history-export-employees-pdf"
                        onClick={() => handleExport('pdf')}
                        disabled={selectedCount === 0 || monthsArray.length === 0 || isExporting}
                    >
                        PDF
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        instance="staff-history-export-employees-excel"
                        onClick={() => handleExport('xlsx')}
                        disabled={selectedCount === 0 || monthsArray.length === 0 || isExporting}
                    >
                        Excel
                    </Button>
                </>
            }
        >
            <div className="flex flex-col max-h-[75dvh]">
                {/* ── SELECCIÓN DE MESES ── */}
                <div className="shrink-0 px-4 pt-3 pb-2 border-b border-white/10">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black text-white/55 uppercase tracking-wider">Meses</span>
                        <span className="text-[10px] font-bold text-white/55">{monthsArray.length} seleccionado{monthsArray.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                        <button
                            type="button"
                            onClick={() => setPickerYear((p) => p - 1)}
                            className="p-1 hover:bg-white/10 rounded-lg transition-colors text-white/40"
                        >
                            <ChevronLeft size={14} />
                        </button>
                        <span className="text-xs font-black text-white/85">{pickerYear}</span>
                        <button
                            type="button"
                            onClick={() => setPickerYear((p) => p + 1)}
                            className="p-1 hover:bg-white/10 rounded-lg transition-colors text-white/40"
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
                                    className={monthCellDarkClassName(active)}
                                >
                                    {name}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ── SELECCIÓN DE EMPLEADOS ── */}
                <div className="shrink-0 px-4 pt-3 pb-2 space-y-2">
                    <SearchField
                        instance="multi-employee-search"
                        value={search}
                        onChange={setSearch}
                        placeholder="Buscar empleado..."
                    />
                    <div className="flex items-center justify-between">
                        <button
                            type="button"
                            onClick={toggleAll}
                            className="text-[10px] font-bold text-white/70 uppercase tracking-wider hover:underline"
                        >
                            {allFilteredSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
                        </button>
                        <span className="text-[10px] font-bold text-white/55">
                            {selectedCount} seleccionados
                        </span>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-3 space-y-1">
                    {filtered.length === 0 ? (
                        <div className="py-8 text-center text-white/40 text-xs font-bold">
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
                                        checked ? 'bg-white/10' : 'hover:bg-white/5'
                                    )}
                                >
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggle(emp.id)}
                                        className="w-4 h-4 rounded border-white/30 text-ds-marca focus:ring-ds-marca/30 accent-ds-marca"
                                    />
                                    <Avatar src={emp.avatar_url} alt={emp.first_name} size="sm" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-black text-white/90 uppercase truncate">
                                            {emp.first_name} {emp.last_name}
                                        </p>
                                    </div>
                                </label>
                            );
                        })
                    )}
                </div>

            </div>
        </Modal>
    );
}
