'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout';
import { getGestionActivitiesAction, updateActivityAction, mergeActivitiesAction } from './actions';

interface GestionActivity {
  id: string;
  name: string;
  color: string | null;
  active: boolean;
  is_pista?: boolean;
}

const COLOR_FAMILIES: { label: string; base: string; shades: string[] }[] = [
  { label: 'Rojo',      base: '#ef4444', shades: ['#fca5a5','#f87171','#ef4444','#dc2626','#b91c1c','#7f1d1d'] },
  { label: 'Naranja',   base: '#f97316', shades: ['#fdba74','#fb923c','#f97316','#ea580c','#c2410c','#7c2d12'] },
  { label: 'Ámbar',     base: '#f59e0b', shades: ['#fcd34d','#fbbf24','#f59e0b','#d97706','#b45309','#78350f'] },
  { label: 'Lima',      base: '#84cc16', shades: ['#bef264','#a3e635','#84cc16','#65a30d','#4d7c0f','#3f6212'] },
  { label: 'Verde',     base: '#22c55e', shades: ['#86efac','#4ade80','#22c55e','#16a34a','#15803d','#14532d'] },
  { label: 'Esmeralda', base: '#10b981', shades: ['#6ee7b7','#34d399','#10b981','#059669','#047857','#064e3b'] },
  { label: 'Teal',      base: '#14b8a6', shades: ['#5eead4','#2dd4bf','#14b8a6','#0d9488','#0f766e','#134e4a'] },
  { label: 'Cian',      base: '#06b6d4', shades: ['#67e8f9','#22d3ee','#06b6d4','#0891b2','#0e7490','#164e63'] },
  { label: 'Azul',      base: '#3b82f6', shades: ['#93c5fd','#60a5fa','#3b82f6','#2563eb','#1d4ed8','#1e3a8a'] },
  { label: 'Índigo',    base: '#6366f1', shades: ['#a5b4fc','#818cf8','#6366f1','#4f46e5','#4338ca','#312e81'] },
  { label: 'Violeta',   base: '#8b5cf6', shades: ['#c4b5fd','#a78bfa','#8b5cf6','#7c3aed','#6d28d9','#4c1d95'] },
  { label: 'Fucsia',    base: '#d946ef', shades: ['#f0abfc','#e879f9','#d946ef','#c026d3','#a21caf','#701a75'] },
  { label: 'Rosa',      base: '#ec4899', shades: ['#f9a8d4','#f472b6','#ec4899','#db2777','#be185d','#831843'] },
  { label: 'Coral',     base: '#f43f5e', shades: ['#fda4af','#fb7185','#f43f5e','#e11d48','#be123c','#881337'] },
  { label: 'Petróleo',  base: '#36606F', shades: ['#a0c8d4','#7fb9c9','#549db0','#36606F','#2A4B57','#1e3640'] },
  { label: 'Pizarra',   base: '#64748b', shades: ['#cbd5e1','#94a3b8','#64748b','#475569','#334155','#1e293b'] },
  { label: 'Piedra',    base: '#78716c', shades: ['#d6d3d1','#a8a29e','#78716c','#57534e','#44403c','#1c1917'] },
];

export default function GestionActividadesPage() {
  const [activities, setActivities] = useState<GestionActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pistas' | 'all'>('pistas');

  // Selection (for merge)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [merging, setMerging] = useState(false);
  const [survivorId, setSurvivorId] = useState<string>('');
  const [mergeError, setMergeError] = useState('');

  // Edit Modal State
  const [editAct, setEditAct] = useState<GestionActivity | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState<string | null>(null);
  const [editError, setEditError] = useState('');
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null);

  useEffect(() => {
    loadActivities();
  }, []);

  async function loadActivities() {
    setLoading(true);
    const res = await getGestionActivitiesAction();
    if (res.success && res.data) {
      setActivities(res.data);
    } else {
      setError(res.error || 'Error al cargar');
    }
    setLoading(false);
  }

  async function handleToggleActive(act: GestionActivity) {
    setSavingId(act.id);
    const res = await updateActivityAction(act.id, { active: !act.active });
    if (res.success) {
      setActivities(prev => prev.map(a => a.id === act.id ? { ...a, active: !a.active } : a));
    } else {
      alert('Error: ' + res.error);
    }
    setSavingId(null);
  }

  function openEditModal(act: GestionActivity) {
    setEditAct(act);
    setEditName(act.name);
    setEditColor(act.color);
    setEditError('');
    // Pre-select the family if the activity already has a color
    if (act.color) {
      const family = COLOR_FAMILIES.find(f =>
        f.shades.some(s => s.toLowerCase() === act.color!.toLowerCase())
      );
      setSelectedFamily(family?.label ?? null);
    } else {
      setSelectedFamily(null);
    }
  }

  async function handleSaveEdit() {
    if (!editAct) return;
    if (!editName.trim()) {
      setEditError('El nombre no puede estar vacío.');
      return;
    }
    if (editColor) {
      const collision = activities.find(a => a.id !== editAct.id && a.color === editColor);
      if (collision) {
        setEditError(`El color ya está en uso por "${collision.name}". Elige otro.`);
        return;
      }
    }
    setEditError('');
    setSavingId(editAct.id);
    const originalAct = { ...editAct };
    const id = editAct.id;
    const newName = editName.trim();
    const newColor = editColor;
    setActivities(prev => prev.map(a => a.id === id ? { ...a, name: newName, color: newColor } : a));
    setEditAct(null);
    const res = await updateActivityAction(id, { name: newName, color: newColor ?? undefined });
    if (!res.success) {
      alert('Error al guardar: ' + res.error);
      setActivities(prev => prev.map(a => a.id === id ? originalAct : a));
    }
    setSavingId(null);
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openMergeModal() {
    if (selected.size < 2) return;
    setSurvivorId([...selected][0]);
    setMergeError('');
    setMerging(true);
  }

  async function handleMerge() {
    if (!survivorId) { setMergeError('Elige el nombre que quieres conservar.'); return; }
    const fromIds = [...selected].filter(id => id !== survivorId);
    const res = await mergeActivitiesAction(survivorId, fromIds);
    if (!res.success) {
      setMergeError(res.error || 'Error desconocido');
      return;
    }
    // Remove merged duplicates locally
    setActivities(prev => prev.filter(a => !fromIds.includes(a.id)));
    setSelected(new Set());
    setMerging(false);
  }

  const visibleActivities = activities.filter(act => filter === 'all' || act.is_pista);

  return (
    <>
    <DashboardDetailLayout
      title="Catálogo"
      backHref="/staff/actividades"
      template="list"
      maxWidthClass="max-w-4xl"
    >
      {loading ? (
        <p className="text-slate-700">Cargando catálogo...</p>
      ) : error ? (
        <p className="text-red-500">{error}</p>
      ) : (
      <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {selected.size >= 2 && (
            <Button
              type="button"
              variant="primary"
              instance="pavilion-activity-merge-toolbar"
              onClick={openMergeModal}
            >
              ⚡ Unificar seleccionadas ({selected.size})
            </Button>
          )}
          {selected.size > 0 && (
            <Button
              type="button"
              variant="tertiary"
              instance="pavilion-activity-merge-clear"
              onClick={() => setSelected(new Set())}
            >
              Cancelar selección
            </Button>
          )}
          {selected.size === 0 && (
            <p className="text-xs text-slate-400 hidden sm:block">Marca varias actividades para unificarlas</p>
          )}
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as 'pistas' | 'all')}
          className="min-h-12 cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:ring-2 focus:ring-ds-marca/50"
        >
          <option value="pistas">Solo Pistas (P1-P4)</option>
          <option value="all">Todas las actividades</option>
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm w-full overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-700 min-w-[320px]">
          <thead className="bg-[#36606F] text-[10px] sm:text-xs uppercase font-semibold text-white/90">
            <tr>
              <th className="px-2 sm:px-3 py-2 sm:py-3 w-8"></th>
              <th className="px-2 sm:px-4 py-2 sm:py-3">Nombre</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 text-center">Estado</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visibleActivities.map(act => (
              <tr
                key={act.id}
                className={`transition-colors ${!act.active ? 'opacity-50' : ''} ${selected.has(act.id) ? 'bg-amber-50' : 'hover:bg-blue-50/30'}`}
              >
                <td className="px-2 sm:px-3 py-2 sm:py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(act.id)}
                    onChange={() => toggleSelect(act.id)}
                    className="w-4 h-4 rounded accent-[#36606F] cursor-pointer"
                  />
                </td>
                <td className="px-2 sm:px-4 py-2 sm:py-3 font-medium text-slate-800 text-xs sm:text-sm truncate max-w-[120px] sm:max-w-none">
                  <div className="flex items-center gap-2">
                    {act.color ? (
                      <span className="w-3 h-3 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: act.color }} />
                    ) : (
                      <span className="w-3 h-3 rounded-full shrink-0 shadow-sm border border-dashed border-gray-300" title="Color automático" />
                    )}
                    <span className="truncate">{act.name}</span>
                  </div>
                </td>
                <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
                  <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md text-[9px] sm:text-[10px] font-bold uppercase tracking-wider ${act.active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {act.active ? 'Activa' : 'Inactiva'}
                  </span>
                </td>
                <td className="px-2 sm:px-4 py-2 sm:py-3 text-right">
                  <div className="flex items-center justify-end gap-1 sm:gap-2">
                    <Button
                      type="button"
                      variant="tertiary"
                      instance={`gestion-actividad-editar-${act.id}`}
                      onClick={() => openEditModal(act)}
                      disabled={savingId === act.id}
                    >
                      Editar
                    </Button>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(act)}
                      disabled={savingId === act.id}
                      className={`min-h-12 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-semibold transition-colors disabled:opacity-50 ${act.active ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                    >
                      {act.active ? 'Quitar' : 'Activar'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
      )}
    </DashboardDetailLayout>

      <Modal
        open={merging}
        onClose={() => { setMerging(false); setMergeError(''); }}
        title="Unificar Actividades"
        variant="compact"
        layer="base"
        instance="pavilion-activity-merge"
        headerTone="petroleum"
        usageId="pavilion-activity-merge"
        usageLabel="Unificar actividades"
        footer={
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="tertiary"
              instance="pavilion-activity-merge-cancel"
              onClick={() => { setMerging(false); setMergeError(''); }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              instance="pavilion-activity-merge-confirm"
              onClick={() => void handleMerge()}
            >
              Unificar
            </Button>
          </div>
        }
      >
        <div className="space-y-2 p-2.5 sm:p-3">
          <p className="text-xs text-slate-500">Elige el nombre que quieres conservar. El resto quedarán eliminadas y sus registros históricos pasarán al nombre elegido.</p>
          {[...selected].map(id => {
            const act = activities.find(a => a.id === id);
            if (!act) return null;
            return (
              <label
                key={id}
                className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border-2 transition-all ${survivorId === id ? 'border-[#36606F] bg-[#36606F]/5' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <input
                  type="radio"
                  name="survivor"
                  value={id}
                  checked={survivorId === id}
                  onChange={() => setSurvivorId(id)}
                  className="accent-[#36606F]"
                />
                <div className="flex items-center gap-2">
                  {act.color
                    ? <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: act.color }} />
                    : <span className="w-3 h-3 rounded-full shrink-0 border border-dashed border-gray-300" />
                  }
                  <span className="text-sm font-semibold text-slate-700">{act.name}</span>
                </div>
                {survivorId === id && (
                  <span className="ml-auto text-[10px] font-bold text-[#36606F] uppercase">Conservar</span>
                )}
              </label>
            );
          })}
          {mergeError && (
            <div className="p-3 rounded-xl bg-red-50 text-red-600 text-xs font-semibold">{mergeError}</div>
          )}
        </div>
      </Modal>

      <Modal
        open={Boolean(editAct)}
        onClose={() => setEditAct(null)}
        title="Editar Actividad"
        variant="standard"
        layer="base"
        instance="pavilion-activity-edit"
        headerTone="petroleum"
        usageId="pavilion-activity-edit"
        usageLabel="Editar actividad"
        footer={
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="tertiary"
              instance="pavilion-activity-edit-cancel"
              onClick={() => setEditAct(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              instance="pavilion-activity-edit-save"
              onClick={() => void handleSaveEdit()}
            >
              Guardar
            </Button>
          </div>
        }
      >
        <div className="space-y-4 p-2.5 sm:p-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Nombre</label>
            <input
              type="text"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:border-[#36606F] focus:ring-1 focus:ring-[#36606F] text-sm text-slate-700"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Color</label>

            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => { setEditColor(null); setSelectedFamily(null); }}
                className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-[8px] font-bold bg-gray-100 transition-all hover:scale-110 ${editColor === null ? 'border-slate-700 scale-110 shadow' : 'border-gray-300 text-gray-400'}`}
                title="Sin color (automático)"
              >
                —
              </button>
              {COLOR_FAMILIES.map(fam => {
                const isFamilySelected = selectedFamily === fam.label;
                const isAnyShadeUsed = fam.shades.some(s => activities.some(a => a.id !== editAct?.id && a.color?.toLowerCase() === s.toLowerCase()));
                return (
                  <button
                    type="button"
                    key={fam.label}
                    onClick={() => setSelectedFamily(isFamilySelected ? null : fam.label)}
                    className={`w-7 h-7 rounded-full border-2 transition-all hover:scale-110 ${isFamilySelected ? 'border-slate-800 scale-110 shadow-md ring-2 ring-offset-1 ring-slate-400' : 'border-transparent'}`}
                    style={{ backgroundColor: fam.base }}
                    title={fam.label}
                  >
                    {isAnyShadeUsed && (
                      <span className="block w-2 h-2 rounded-full bg-white/70 mx-auto" />
                    )}
                  </button>
                );
              })}
            </div>

            {selectedFamily && (() => {
              const fam = COLOR_FAMILIES.find(f => f.label === selectedFamily)!;
              return (
                <div className="flex flex-wrap gap-1.5 pt-1 pl-1 border-l-2" style={{ borderColor: fam.base }}>
                  {fam.shades.map(shade => {
                    const isSelected = editColor?.toLowerCase() === shade.toLowerCase();
                    const isUsed = activities.some(a => a.id !== editAct?.id && a.color?.toLowerCase() === shade.toLowerCase());
                    return (
                      <button
                        type="button"
                        key={shade}
                        onClick={() => { if (!isUsed) { setEditColor(shade); } }}
                        className={`w-7 h-7 rounded-full border-2 transition-all ${isSelected ? 'border-slate-800 scale-110 shadow-md' : 'border-transparent hover:scale-110'} ${isUsed ? 'opacity-25 cursor-not-allowed' : ''}`}
                        style={{ backgroundColor: shade }}
                        title={isUsed ? 'Ya en uso' : shade}
                      />
                    );
                  })}
                </div>
              );
            })()}

            {editColor && (
              <div className="flex items-center gap-2 pt-1">
                <span className="w-4 h-4 rounded-full shrink-0 border border-gray-200" style={{ backgroundColor: editColor }} />
                <span className="text-xs text-slate-500 font-mono">{editColor}</span>
              </div>
            )}
          </div>
          {editError && (
            <div className="p-3 rounded-xl bg-red-50 text-red-600 text-xs font-semibold">{editError}</div>
          )}
        </div>
      </Modal>
    </>
  );
}
