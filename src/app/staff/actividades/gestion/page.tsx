'use client';

import { useState, useEffect } from 'react';
import { getGestionActivitiesAction, updateActivityAction } from './actions';

interface GestionActivity {
  id: string;
  name: string;
  color: string | null;
  is_active: boolean;
}

export default function GestionActividadesPage() {
  const [activities, setActivities] = useState<GestionActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

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

  async function handleUpdateName(id: string, currentName: string) {
    const newName = prompt('Nuevo nombre para la actividad:', currentName);
    if (!newName || newName === currentName) return;

    setSavingId(id);
    const res = await updateActivityAction(id, { name: newName });
    if (res.success) {
      setActivities(prev => prev.map(a => a.id === id ? { ...a, name: newName } : a));
    } else {
      alert('Error: ' + res.error);
    }
    setSavingId(null);
  }

  if (loading) return <div className="p-8 text-white">Cargando catálogo...</div>;
  if (error) return <div className="p-8 text-red-400">{error}</div>;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Gestión de Catálogo de Actividades</h1>
        <p className="text-zinc-400 text-sm">
          Aquí puedes ver todas las actividades que el sistema conoce. Puedes editar su nombre (útil para unificar errores tipográficos persistentes) o desactivarlas para que no aparezcan en los menús desplegables de los reportes.
        </p>
      </div>

      <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800/50 overflow-hidden">
        <table className="w-full text-left text-sm text-zinc-300">
          <thead className="bg-zinc-800/80 text-xs uppercase font-semibold text-zinc-500">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3 text-center">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {activities.map(act => (
              <tr key={act.id} className={`hover:bg-zinc-800/30 transition-colors ${!act.is_active ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 font-medium text-white">
                  {act.name}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${act.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                    {act.is_active ? 'Activa' : 'Inactiva'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleUpdateName(act.id, act.name)}
                      disabled={savingId === act.id}
                      className="px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleToggleActive(act)}
                      disabled={savingId === act.id}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${act.is_active ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'}`}
                    >
                      {act.is_active ? 'Desactivar' : 'Activar'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
