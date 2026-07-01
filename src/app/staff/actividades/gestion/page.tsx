'use client';

import { useState, useEffect } from 'react';
import { getGestionActivitiesAction, updateActivityAction, mergeActivitiesAction } from './actions';

interface GestionActivity {
  id: string;
  name: string;
  color: string | null;
  is_active: boolean;
  is_pista?: boolean;
}

const PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', 
  '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', 
  '#8b5cf6', '#d946ef', '#ec4899', '#f43f5e', '#64748b', 
  '#78716c', '#334155', '#0f766e', '#4338ca', '#b91c1c',
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
    const res = await updateActivityAction(act.id, { is_active: !act.is_active });
    if (res.success) {
      setActivities(prev => prev.map(a => a.id === act.id ? { ...a, is_active: !a.is_active } : a));
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

  if (loading) return <div className="p-8 text-slate-700">Cargando catálogo...</div>;
  if (error) return <div className="p-8 text-red-500">{error}</div>;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {selected.size >= 2 && (
            <button
              onClick={openMergeModal}
              className="px-3 py-2 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 text-xs font-bold transition-colors border border-amber-200"
            >
              ⚡ Unificar seleccionadas ({selected.size})
            </button>
          )}
          {selected.size > 0 && (
            <button
              onClick={() => setSelected(new Set())}
              className="px-3 py-2 rounded-lg text-slate-500 hover:text-slate-700 text-xs font-semibold transition-colors"
            >
              Cancelar selección
            </button>
          )}
          {selected.size === 0 && (
            <p className="text-xs text-slate-400 hidden sm:block">Marca varias actividades para unificarlas</p>
          )}
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as 'pistas' | 'all')}
          className="bg-white border border-gray-200 text-slate-700 text-sm px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-[#36606F]/50 shadow-sm cursor-pointer"
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
                className={`transition-colors ${!act.is_active ? 'opacity-50' : ''} ${selected.has(act.id) ? 'bg-amber-50' : 'hover:bg-blue-50/30'}`}
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
                  <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md text-[9px] sm:text-[10px] font-bold uppercase tracking-wider ${act.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {act.is_active ? 'Activa' : 'Inactiva'}
                  </span>
                </td>
                <td className="px-2 sm:px-4 py-2 sm:py-3 text-right">
                  <div className="flex items-center justify-end gap-1 sm:gap-2">
                    <button
                      onClick={() => openEditModal(act)}
                      disabled={savingId === act.id}
                      className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-md sm:rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 text-[10px] sm:text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleToggleActive(act)}
                      disabled={savingId === act.id}
                      className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-semibold transition-colors disabled:opacity-50 ${act.is_active ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                    >
                      {act.is_active ? 'Quitar' : 'Activar'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Merge Modal */}
      {merging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
            <div className="p-4 md:p-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-slate-800">Unificar Actividades</h2>
              <p className="text-xs text-slate-500 mt-1">Elige el nombre que quieres conservar. El resto quedarán eliminadas y sus registros históricos pasarán al nombre elegido.</p>
            </div>
            <div className="p-4 md:p-5 space-y-2">
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
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                onClick={() => { setMerging(false); setMergeError(''); }}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleMerge}
                className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-md transition-colors"
              >
                Unificar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editAct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
            <div className="p-4 md:p-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-slate-800">Editar Actividad</h2>
            </div>
            <div className="p-4 md:p-5 space-y-4">
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
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Color (Único)</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setEditColor(null)}
                    className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-[10px] font-medium bg-gray-50 transition-transform hover:scale-110 ${editColor === null ? 'border-[#36606F]' : 'border-gray-200 text-gray-400'}`}
                    title="Automático"
                  >
                    Auto
                  </button>
                  {PALETTE.map(hex => {
                    const isSelected = editColor === hex;
                    const isUsed = activities.some(a => a.id !== editAct.id && a.color === hex);
                    return (
                      <button
                        key={hex}
                        onClick={() => { if (!isUsed) setEditColor(hex); }}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${isSelected ? 'border-slate-800 scale-110 shadow-md' : 'border-transparent hover:scale-110'} ${isUsed ? 'opacity-20 cursor-not-allowed' : ''}`}
                        style={{ backgroundColor: hex }}
                        title={isUsed ? 'Color ya en uso' : hex}
                      />
                    );
                  })}
                </div>
              </div>
              {editError && (
                <div className="p-3 rounded-xl bg-red-50 text-red-600 text-xs font-semibold">{editError}</div>
              )}
            </div>
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                onClick={() => setEditAct(null)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-[#36606F] hover:bg-[#2A4B57] shadow-md transition-colors"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
