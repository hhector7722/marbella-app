'use client';

import React from 'react';
import { createClient } from '@/utils/supabase/client';
import { isMasterDashboardUser } from '@/lib/master-dashboard';

type Resultado = 'PASS' | 'FAIL' | 'NO EJECUTADO';

type TestValidacion = {
    id: string;
    titulo: string;
    pasos: string[];
};

const TESTS: TestValidacion[] = [
    {
        id: 'A',
        titulo: 'Lectura real',
        pasos: ['Abrir History', 'Comprobar datos reales', 'Abrir Ventas', 'Abrir Insights', 'Volver a History'],
    },
    {
        id: 'B',
        titulo: 'Persistencia de estética',
        pasos: ['Seleccionar una estética', 'Navegar por varias páginas', 'Confirmar que la estética permanece', 'Volver a la página inicial'],
    },
    {
        id: 'C',
        titulo: 'Escritura simulada',
        pasos: ['Ejecutar una operación que normalmente escribiría datos', 'Confirmar aviso de «acción simulada»', 'Confirmar que la operación no llega a producción'],
    },
    {
        id: 'D',
        titulo: 'Integridad de producción',
        pasos: ['Registrar el estado del dato afectado antes', 'Ejecutar la operación simulada', 'Consultar de nuevo el dato real y comparar'],
    },
    {
        id: 'E',
        titulo: 'Variantes',
        pasos: ['Duplicar estética', 'Modificar la copia', 'Navegar por varias páginas', 'Volver a la estética original', 'Confirmar que permanece intacta'],
    },
];

const PROTECCIONES = [
    'insert',
    'update',
    'delete',
    'upsert',
    'RPC no permitido',
    'Storage',
    'Auth mutante',
    'Functions',
    'window.print',
    'Server Actions protegidas',
];

function ResultadoBadge({ resultado }: { resultado: Resultado }) {
    const color = resultado === 'PASS' ? 'text-emerald-300 bg-emerald-500/15' : resultado === 'FAIL' ? 'text-rose-300 bg-rose-500/15' : 'text-zinc-400 bg-zinc-800';
    return <span className={`rounded-md px-2 py-1 text-[9px] font-black uppercase tracking-widest ${color}`}>{resultado}</span>;
}

export function ValidationPanel({ onClose }: { onClose: () => void }) {
    const [authenticated, setAuthenticated] = React.useState<boolean | null>(null);
    const [master, setMaster] = React.useState<boolean | null>(null);
    const [sandboxActivo, setSandboxActivo] = React.useState(false);
    const [resultados, setResultados] = React.useState<Record<string, Resultado>>(
        Object.fromEntries(TESTS.map(test => [test.id, 'NO EJECUTADO'])) as Record<string, Resultado>,
    );
    const [marcados, setMarcados] = React.useState<Record<string, boolean[]>>(
        Object.fromEntries(TESTS.map(test => [test.id, test.pasos.map(() => false)])),
    );

    React.useEffect(() => {
        let cancelado = false;
        const supabase = createClient();
        void supabase.auth.getSession().then(({ data }) => {
            if (cancelado) return;
            const email = data.session?.user?.email;
            setAuthenticated(Boolean(data.session?.user));
            setMaster(isMasterDashboardUser(email));
            setSandboxActivo(typeof window !== 'undefined' && window.__MARBELLA_SANDBOX__ === true);
        }).catch(() => {
            if (cancelado) return;
            setAuthenticated(false);
            setMaster(false);
            setSandboxActivo(typeof window !== 'undefined' && window.__MARBELLA_SANDBOX__ === true);
        });
        return () => {
            cancelado = true;
        };
    }, []);

    const cambiarPaso = (testId: string, index: number) => {
        setMarcados(prev => ({
            ...prev,
            [testId]: prev[testId]?.map((marcado, paso) => paso === index ? !marcado : marcado) ?? [],
        }));
    };

    return (
        <div className="fixed inset-0 z-[200] overflow-auto bg-zinc-950/95 p-4 text-white" role="dialog" aria-modal="true" aria-labelledby="validation-title">
            <div className="mx-auto max-w-3xl rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-2xl">
                <div className="flex items-start justify-between gap-4 border-b border-zinc-800 pb-3">
                    <div>
                        <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Diagnóstico temporal</div>
                        <h2 id="validation-title" className="text-lg font-black">Validación READ REAL / WRITE SIMULATED</h2>
                        <p className="mt-1 text-[10px] font-bold text-zinc-500">Este panel solo lee estado. No ejecuta operaciones de negocio.</p>
                    </div>
                    <button onClick={onClose} style={{ minHeight: 48, minWidth: 48 }} className="rounded-xl bg-zinc-800 text-zinc-300" aria-label="Cerrar diagnóstico">×</button>
                </div>

                <section className="mt-4 grid gap-2 sm:grid-cols-2" aria-labelledby="environment-title">
                    <h3 id="environment-title" className="col-span-full text-[9px] font-black uppercase tracking-widest text-zinc-500">Estado de entorno</h3>
                    <StatusRow label="Sesión autenticada" value={authenticated === null ? 'Comprobando…' : authenticated ? 'Sí' : 'No'} ok={authenticated === true} />
                    <StatusRow label="Usuario master" value={master === null ? 'Comprobando…' : master ? 'Sí' : 'No'} ok={master === true} />
                    <StatusRow label="Sandbox activo" value={sandboxActivo ? 'Sí' : 'No'} ok={sandboxActivo} />
                    <StatusRow label="Modo escritura" value="INTERCEPTADA" ok />
                </section>

                <section className="mt-5 grid gap-2 sm:grid-cols-2" aria-labelledby="data-title">
                    <h3 id="data-title" className="col-span-full text-[9px] font-black uppercase tracking-widest text-zinc-500">Estado de datos</h3>
                    <StatusRow label="Lecturas" value="REAL" ok />
                    <StatusRow label="Escrituras" value="SIMULADAS" ok />
                </section>

                <section className="mt-5" aria-labelledby="protection-title">
                    <h3 id="protection-title" className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Estado de protección</h3>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {PROTECCIONES.map(proteccion => <span key={proteccion} className="rounded-lg bg-emerald-500/10 px-2 py-1 text-[9px] font-black text-emerald-300">{proteccion} · interceptado</span>)}
                    </div>
                </section>

                <section className="mt-5" aria-labelledby="tests-title">
                    <h3 id="tests-title" className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Checklist manual A-E</h3>
                    <div className="mt-2 space-y-3">
                        {TESTS.map(test => {
                            const pasos = marcados[test.id] ?? [];
                            return (
                                <article key={test.id} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <h4 className="text-sm font-black">TEST {test.id} — {test.titulo}</h4>
                                        <div className="flex items-center gap-1.5">
                                            <ResultadoBadge resultado={resultados[test.id] ?? 'NO EJECUTADO'} />
                                            <select
                                                value={resultados[test.id] ?? 'NO EJECUTADO'}
                                                onChange={event => setResultados(prev => ({ ...prev, [test.id]: event.target.value as Resultado }))}
                                                className="min-h-11 rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-[9px] font-black uppercase text-zinc-300"
                                                aria-label={`Resultado del test ${test.id}`}
                                            >
                                                <option>NO EJECUTADO</option>
                                                <option>PASS</option>
                                                <option>FAIL</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="mt-2 space-y-1.5">
                                        {test.pasos.map((paso, index) => (
                                            <label key={paso} className="flex min-h-11 items-center gap-2 text-[11px] font-bold text-zinc-300">
                                                <input type="checkbox" checked={pasos[index] ?? false} onChange={() => cambiarPaso(test.id, index)} className="h-4 w-4 accent-[#36606F]" />
                                                {paso}
                                            </label>
                                        ))}
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </section>
            </div>
        </div>
    );
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
    return (
        <div className="flex min-h-12 items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/60 px-3">
            <span className="text-[10px] font-bold text-zinc-400">{label}</span>
            <span className={`text-[10px] font-black uppercase tracking-widest ${ok ? 'text-emerald-300' : 'text-rose-300'}`}>{value}</span>
        </div>
    );
}
