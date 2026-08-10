'use client';

import React, { useState, useMemo } from 'react';
import { useStudioStore } from '../store';
import { MarbellaVariant, VariantSortOption } from '../types';

export default function VariantManagerModal() {
    const { 
        isVariantManagerOpen, 
        closeVariantManager, 
        variants, 
        activeVariantId, 
        setActiveVariant,
        renameVariant,
        duplicateVariant,
        archiveVariant,
        setBaseVariant,
        exportVariant,
        deleteVariant,
        variantSortBy,
        setVariantSortBy,
        openNewSurfaceModal
    } = useStudioStore();

    const [searchQuery, setSearchQuery] = useState('');
    const [tabFilter, setTabFilter] = useState<'active' | 'archived'>('active');
    const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [deletingVariantId, setDeletingVariantId] = useState<string | null>(null);
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

    // Filter & Sort Variants
    const filteredVariants = useMemo(() => {
        let result = variants.filter(v => !v.isSystemVariant);

        if (tabFilter === 'active') {
            result = result.filter(v => !v.isArchived);
        } else {
            result = result.filter(v => v.isArchived);
        }

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim();
            result = result.filter(v => 
                v.name.toLowerCase().includes(query) || 
                (v.description && v.description.toLowerCase().includes(query))
            );
        }

        return result.sort((a, b) => {
            if (variantSortBy === 'modified') {
                return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
            }
            if (variantSortBy === 'created') {
                return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
            }
            return a.name.localeCompare(b.name);
        });
    }, [variants, tabFilter, searchQuery, variantSortBy]);

    if (!isVariantManagerOpen) return null;

    const handleStartRename = (v: MarbellaVariant) => {
        setEditingVariantId(v.id);
        setEditingName(v.name);
        setMenuOpenId(null);
    };

    const handleSaveRename = (id: string) => {
        if (editingName.trim()) {
            renameVariant(id, editingName.trim());
        }
        setEditingVariantId(null);
    };

    const handleConfirmDelete = (id: string) => {
        const success = deleteVariant(id);
        if (!success) {
            alert('No se puede eliminar la única variante activa del lienzo.');
        }
        setDeletingVariantId(null);
        setMenuOpenId(null);
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
            <div className="bg-[#0c0c10] border border-white/15 rounded-3xl w-full max-w-3xl shadow-2xl text-white flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                
                {/* Header */}
                <div className="p-6 border-b border-white/10 flex items-center justify-between bg-black/40">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#36606F] to-[#1F5FAF] flex items-center justify-center font-bold text-base shadow-md">
                            🗂️
                        </div>
                        <div>
                            <h2 className="text-lg font-bold tracking-tight text-white">Gestor de Variantes Marbella</h2>
                            <p className="text-xs text-zinc-400">Ciclo de vida completo de documentos de trabajo</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => { closeVariantManager(); openNewSurfaceModal(); }}
                            className="px-3.5 py-1.5 bg-[#36606F] hover:bg-[#407080] text-white text-xs font-bold rounded-xl shadow transition-all flex items-center gap-1"
                        >
                            + Nueva Variante
                        </button>
                        <button
                            onClick={closeVariantManager}
                            className="text-zinc-500 hover:text-white p-1.5 rounded-lg transition-colors text-sm"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Toolbar (Search & Sort & Tab Filter) */}
                <div className="p-4 bg-white/[0.02] border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
                    {/* Active vs Archived Tabs */}
                    <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
                        <button
                            onClick={() => setTabFilter('active')}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                                tabFilter === 'active'
                                    ? 'bg-[#36606F] text-white shadow-sm'
                                    : 'text-zinc-400 hover:text-white'
                            }`}
                        >
                            Activas ({variants.filter(v => !v.isArchived && !v.isSystemVariant).length})
                        </button>
                        <button
                            onClick={() => setTabFilter('archived')}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                                tabFilter === 'archived'
                                    ? 'bg-amber-600/40 text-amber-200 border border-amber-500/40 shadow-sm'
                                    : 'text-zinc-400 hover:text-white'
                            }`}
                        >
                            Archivadas ({variants.filter(v => v.isArchived && !v.isSystemVariant).length})
                        </button>
                    </div>

                    {/* Search Input */}
                    <div className="flex-1 min-w-[200px] relative">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Buscar variante por nombre..."
                            className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#5B8FB9]"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 top-2 text-xs text-zinc-500 hover:text-white"
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    {/* Sort Dropdown */}
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs text-zinc-400">Orden:</span>
                        <select
                            value={variantSortBy}
                            onChange={(e) => setVariantSortBy(e.target.value as VariantSortOption)}
                            className="bg-white/5 border border-white/15 rounded-xl px-2.5 py-1.5 text-xs font-medium text-white focus:outline-none focus:border-[#5B8FB9]"
                        >
                            <option value="modified" className="bg-[#121214]">Modificadas recientemente</option>
                            <option value="created" className="bg-[#121214]">Creadas recientemente</option>
                            <option value="name" className="bg-[#121214]">Nombre (A-Z)</option>
                        </select>
                    </div>
                </div>

                {/* Variant List Grid */}
                <div className="flex-1 overflow-y-auto p-6 space-y-3">
                    {filteredVariants.length === 0 ? (
                        <div className="p-12 text-center text-zinc-500 border border-dashed border-white/10 rounded-2xl">
                            <p className="text-sm font-medium">No se encontraron variantes en esta categoría.</p>
                        </div>
                    ) : (
                        filteredVariants.map((v) => {
                            const isActive = activeVariantId === v.id;
                            const isEditing = editingVariantId === v.id;
                            const isDeleting = deletingVariantId === v.id;
                            const isMenuOpen = menuOpenId === v.id;

                            return (
                                <div
                                    key={v.id}
                                    className={`group relative p-4 rounded-2xl border transition-all flex items-center justify-between ${
                                        isActive
                                            ? 'bg-gradient-to-r from-[#36606F]/30 to-[#1F5FAF]/20 border-[#5B8FB9] text-white shadow-md ring-1 ring-[#5B8FB9]'
                                            : 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10 hover:border-white/20'
                                    }`}
                                >
                                    {/* Variant Info / Rename Input */}
                                    <div className="flex-1 min-w-0 pr-4">
                                        <div className="flex items-center gap-2 mb-1">
                                            {isActive && (
                                                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold rounded-full uppercase tracking-wider">
                                                    Activa en Lienzo
                                                </span>
                                            )}
                                            {v.isBaseVariant && (
                                                <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-bold rounded-full uppercase tracking-wider">
                                                    Variante Base
                                                </span>
                                            )}
                                            {v.isArchived && (
                                                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold rounded-full uppercase tracking-wider">
                                                    Archivada
                                                </span>
                                            )}
                                        </div>

                                        {isEditing ? (
                                            <div className="flex items-center gap-2 mt-1">
                                                <input
                                                    type="text"
                                                    value={editingName}
                                                    onChange={(e) => setEditingName(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleSaveRename(v.id)}
                                                    className="bg-black/50 border border-[#5B8FB9] rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none"
                                                    autoFocus
                                                />
                                                <button
                                                    onClick={() => handleSaveRename(v.id)}
                                                    className="px-2.5 py-1 bg-[#36606F] text-white text-xs rounded-lg font-bold"
                                                >
                                                    Guardar
                                                </button>
                                                <button
                                                    onClick={() => setEditingVariantId(null)}
                                                    className="text-xs text-zinc-400 hover:text-white"
                                                >
                                                    Cancelar
                                                </button>
                                            </div>
                                        ) : (
                                            <div>
                                                <h3 className="font-bold text-sm text-white truncate">{v.name}</h3>
                                                {v.description && (
                                                    <p className="text-xs text-zinc-400 truncate mt-0.5">{v.description}</p>
                                                )}
                                            </div>
                                        )}

                                        <div className="flex items-center gap-4 text-[10px] text-zinc-500 font-mono mt-2">
                                            <span>Modificada: {new Date(v.updatedAt || '2026-08-10T00:00:00.000Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            <span>•</span>
                                            <span>Creada: {new Date(v.createdAt || '2026-08-10T00:00:00.000Z').toLocaleDateString()}</span>
                                        </div>
                                    </div>

                                    {/* Confirmation dialog inline */}
                                    {isDeleting ? (
                                        <div className="bg-rose-950/80 border border-rose-500/50 p-3 rounded-xl flex items-center gap-3 animate-in fade-in">
                                            <span className="text-xs text-rose-200 font-medium">¿Eliminar definitivamente?</span>
                                            <button
                                                onClick={() => handleConfirmDelete(v.id)}
                                                className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg"
                                            >
                                                Eliminar
                                            </button>
                                            <button
                                                onClick={() => setDeletingVariantId(null)}
                                                className="text-xs text-zinc-400 hover:text-white"
                                            >
                                                Cancelar
                                            </button>
                                        </div>
                                    ) : (
                                        /* Primary Action & Context Menu Trigger */
                                        <div className="flex items-center gap-2 relative">
                                            {!isActive && (
                                                <button
                                                    onClick={() => { setActiveVariant(v.id); closeVariantManager(); }}
                                                    className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl transition-all"
                                                >
                                                    Abrir en Lienzo
                                                </button>
                                            )}

                                            <button
                                                onClick={() => setMenuOpenId(isMenuOpen ? null : v.id)}
                                                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center font-bold text-zinc-300 hover:text-white transition-colors"
                                                title="Opciones de variante"
                                            >
                                                ···
                                            </button>

                                            {/* Context Menu Dropdown */}
                                            {isMenuOpen && (
                                                <div className="absolute right-0 top-10 w-48 bg-[#121218] border border-white/15 rounded-xl shadow-2xl p-1.5 z-40 space-y-1 animate-in fade-in duration-150">
                                                    <button
                                                        onClick={() => handleStartRename(v)}
                                                        className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10 rounded-lg flex items-center gap-2 font-medium"
                                                    >
                                                        ✏️ Renombrar
                                                    </button>

                                                    <button
                                                        onClick={() => { duplicateVariant(v.id); setMenuOpenId(null); }}
                                                        className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10 rounded-lg flex items-center gap-2 font-medium"
                                                    >
                                                        ⧉ Duplicar
                                                    </button>

                                                    <button
                                                        onClick={() => { setBaseVariant(v.id); setMenuOpenId(null); }}
                                                        className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10 rounded-lg flex items-center gap-2 font-medium"
                                                    >
                                                        ⭐ Establecer como Base
                                                    </button>

                                                    <button
                                                        onClick={() => { exportVariant(v.id); setMenuOpenId(null); }}
                                                        className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10 rounded-lg flex items-center gap-2 font-medium"
                                                    >
                                                        📥 Exportar (JSON)
                                                    </button>

                                                    <button
                                                        onClick={() => { archiveVariant(v.id, !v.isArchived); setMenuOpenId(null); }}
                                                        className="w-full text-left px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-500/20 rounded-lg flex items-center gap-2 font-medium"
                                                    >
                                                        📦 {v.isArchived ? 'Desarchivar' : 'Archivar'}
                                                    </button>

                                                    <div className="h-px bg-white/10 my-1" />

                                                    <button
                                                        onClick={() => { setDeletingVariantId(v.id); setMenuOpenId(null); }}
                                                        className="w-full text-left px-3 py-1.5 text-xs text-rose-400 hover:bg-rose-500/20 rounded-lg flex items-center gap-2 font-medium"
                                                    >
                                                        🗑 Eliminar
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-black/40 border-t border-white/10 flex items-center justify-between text-xs text-zinc-400">
                    <span>Total de variantes en el proyecto: <strong className="text-white">{variants.filter(v => !v.isSystemVariant).length}</strong></span>
                    <button
                        onClick={closeVariantManager}
                        className="px-4 py-2 font-semibold text-zinc-400 hover:text-white transition-colors"
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
