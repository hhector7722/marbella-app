'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/ui/SearchField';
import { MIN_PLANTILLA_DAILY_STAFF } from '@/lib/staff/plantilla-schedule-coordinator';

export interface SimulationPlantillaEmployee {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url?: string | null;
    joining_date?: string | null;
    end_date?: string | null;
}

interface SimulationPlantillaExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    employees: SimulationPlantillaEmployee[];
    onExport: (selectedIds: string[]) => void;
    isExporting: boolean;
    year: number;
}

function formatContractHint(joiningDate?: string | null, endDate?: string | null): string | null {
    const join = joiningDate?.slice(0, 10);
    const end = endDate?.slice(0, 10);
    if (join && end) return `${join} → ${end}`;
    if (join) return `Desde ${join}`;
    if (end) return `Hasta ${end}`;
    return null;
}

export function SimulationPlantillaExportModal({
    isOpen,
    onClose,
    employees,
    onExport,
    isExporting,
    year,
}: SimulationPlantillaExportModalProps) {
    const [search, setSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(employees.map((e) => e.id)));

    useEffect(() => {
        if (!isOpen) return;
        setSelectedIds(new Set(employees.map((e) => e.id)));
        setSearch('');
    }, [isOpen, employees]);

    const filtered = useMemo(() => {
        if (!search.trim()) return employees;
        const q = search.toLowerCase().trim();
        return employees.filter((e) => {
            const name = `${e.first_name} ${e.last_name}`.toLowerCase();
            return name.includes(q);
        });
    }, [employees, search]);

    const allFilteredSelected = filtered.length > 0 && filtered.every((e) => selectedIds.has(e.id));
    const selectedCount = selectedIds.size;
    const belowMinStaffing = selectedCount > 0 && selectedCount < MIN_PLANTILLA_DAILY_STAFF;

    const toggleAll = () => {
        if (allFilteredSelected) {
            const next = new Set(selectedIds);
            filtered.forEach((e) => next.delete(e.id));
            setSelectedIds(next);
        } else {
            const next = new Set(selectedIds);
            filtered.forEach((e) => next.add(e.id));
            setSelectedIds(next);
        }
    };

    const toggle = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const handleExport = () => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;
        onExport(ids);
    };

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            variant="standard"
            layer="base"
            instance="staff-history-simulation-export"
            usageId="staff-history-simulation-export"
            usageLabel="Exportar simulación"
            title="Simulación de jornada"
            subtitle={`Ene – hoy ${year} · elige quién entra en la plantilla simulada`}
            headerTone="petroleum"
            scheme="dark"
            footer={
                <Button
                    type="button"
                    variant="primary"
                    instance="staff-history-simulation-export-pdf"
                    onClick={handleExport}
                    disabled={selectedCount === 0 || isExporting}
                >
                    Generar PDF
                </Button>
            }
        >
            <div className="flex min-h-0 flex-1 flex-col">
                <div className="shrink-0 px-4 pt-3 pb-2 border-b border-white/10">
                    <p className="text-[11px] leading-relaxed text-white/70">
                        Se generará un PDF por empleado seleccionado. La simulación reparte turnos entre ellos,
                        respeta alta/baja y evita festivos de cierre.
                    </p>
                    {belowMinStaffing ? (
                        <p className="mt-2 text-[11px] font-semibold text-amber-400">
                            Selecciona al menos {MIN_PLANTILLA_DAILY_STAFF} personas para cumplir el mínimo diario de plantilla.
                        </p>
                    ) : null}
                </div>

                <div className="shrink-0 px-4 pt-3 pb-2 space-y-2">
                    <SearchField
                        instance="simulation-plantilla-search"
                        value={search}
                        onChange={setSearch}
                        placeholder="Buscar empleado..."
                    />
                    <div className="flex items-center justify-between">
                        <button
                            type="button"
                            onClick={toggleAll}
                            className="text-[10px] font-bold text-white/70 uppercase tracking-wider hover:underline min-h-12 px-1"
                        >
                            {allFilteredSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
                        </button>
                        <span className="text-[10px] font-bold text-white/55">
                            {selectedCount} seleccionados
                        </span>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-3 divide-y divide-white/10">
                    {filtered.length === 0 ? (
                        <div className="py-8 text-center text-white/40 text-xs font-bold">
                            No hay empleados que coincidan
                        </div>
                    ) : (
                        filtered.map((emp) => {
                            const checked = selectedIds.has(emp.id);
                            const contractHint = formatContractHint(emp.joining_date, emp.end_date);
                            return (
                                <label
                                    key={emp.id}
                                    className={cn(
                                        'flex items-center gap-3 py-3 min-h-12 cursor-pointer transition-colors',
                                        checked ? 'bg-white/10 -mx-1 px-1 rounded-xl' : 'hover:opacity-80',
                                    )}
                                >
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggle(emp.id)}
                                        className="w-4 h-4 shrink-0 rounded border-white/30 text-ds-marca focus:ring-ds-marca/30 accent-ds-marca"
                                    />
                                    <Avatar src={emp.avatar_url} alt={emp.first_name} size="sm" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-black text-white/90 uppercase truncate">
                                            {emp.first_name} {emp.last_name}
                                        </p>
                                        {contractHint ? (
                                            <p className="text-[10px] font-medium text-white/55 truncate">{contractHint}</p>
                                        ) : null}
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
