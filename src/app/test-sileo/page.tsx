"use client";

import React from 'react';
import { Toaster, sileo } from 'sileo';
import 'sileo/styles.css';
import { CheckCircle, AlertCircle, Info, Loader2 } from 'lucide-react';

export default function TestSileoPage() {
    const showSuccess = () => {
        sileo.success({
            title: "¡Éxito!",
            description: "La notificación se ha enviado correctamente con Sileo.",
            position: "top-right",
        });
    };

    const showError = () => {
        sileo.error({
            title: "Error Crítico",
            description: "Hubo un problema al procesar la solicitud en el servidor.",
            position: "top-right",
        });
    };

    const showInfo = () => {
        sileo.info({
            title: "Información",
            description: "Esta es una notificación informativa premium.",
            position: "top-right",
        });
    };

    const showLoading = () => {
        const id = sileo.show({
            title: "Cargando...",
            description: "Por favor, espera mientras procesamos los datos.",
            position: "top-right",
            duration: null,
        });

        setTimeout(() => {
            sileo.dismiss(id);
            sileo.success({
                title: "Proceso Completado",
                description: "Los datos se han cargado perfectamente.",
                position: "top-right",
            });
        }, 3000);
    };

    return (
        <div className="min-h-screen bg-zinc-50 p-8 flex flex-col items-center justify-center gap-8">
            {/* 
        Note: The global Toaster is already in layout.tsx, 
        but we keep one here just in case of standalone rendering issues in dev
      */}

            <div className="max-w-2xl w-full text-center space-y-4">
                <h1 className="text-4xl font-bold text-zinc-900">Sileo Notification Lab</h1>
                <p className="text-zinc-500 text-lg">
                    Experimenta las notificaciones premium de Bar La Marbella.
                    Haz clic en las tarjetas para ver las animaciones basadas en física.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl w-full">
                {/* Success Card */}
                <div
                    className="p-6 bg-white rounded-2xl border border-zinc-200 hover:shadow-md transition-shadow cursor-pointer flex items-center gap-4"
                    onClick={showSuccess}
                >
                    <div className="p-3 rounded-full bg-emerald-100 text-emerald-600">
                        <CheckCircle size={24} />
                    </div>
                    <div>
                        <p className="font-semibold text-zinc-900 text-lg">Éxito</p>
                        <p className="text-sm text-zinc-500">Animación suave en verde</p>
                    </div>
                </div>

                {/* Error Card */}
                <div
                    className="p-6 bg-white rounded-2xl border border-zinc-200 hover:shadow-md transition-shadow cursor-pointer flex items-center gap-4"
                    onClick={showError}
                >
                    <div className="p-3 rounded-full bg-red-100 text-red-600">
                        <AlertCircle size={24} />
                    </div>
                    <div>
                        <p className="font-semibold text-zinc-900 text-lg">Error</p>
                        <p className="text-sm text-zinc-500">Feedback visual inmediato</p>
                    </div>
                </div>

                {/* Info Card */}
                <div
                    className="p-6 bg-white rounded-2xl border border-zinc-200 hover:shadow-md transition-shadow cursor-pointer flex items-center gap-4"
                    onClick={showInfo}
                >
                    <div className="p-3 rounded-full bg-blue-100 text-blue-600">
                        <Info size={24} />
                    </div>
                    <div>
                        <p className="font-semibold text-zinc-900 text-lg">Información</p>
                        <p className="text-sm text-zinc-500">Diseño limpio y minimalista</p>
                    </div>
                </div>

                {/* Loading Card */}
                <div
                    className="p-6 bg-white rounded-2xl border border-zinc-200 hover:shadow-md transition-shadow cursor-pointer flex items-center gap-4"
                    onClick={showLoading}
                >
                    <div className="p-3 rounded-full bg-zinc-100 text-zinc-600">
                        <Loader2 size={24} className="animate-spin" />
                    </div>
                    <div>
                        <p className="font-semibold text-zinc-900 text-lg">Carga (Promise)</p>
                        <p className="text-sm text-zinc-500">Transición entre estados</p>
                    </div>
                </div>
            </div>

            <div className="mt-8 p-6 bg-white rounded-2xl border border-zinc-100 shadow-sm max-w-md w-full text-center">
                <p className="text-zinc-600 mb-6">
                    Estas notificaciones utilizan un motor de física para movimientos naturales y
                    están diseñadas para no interrumpir la experiencia táctil.
                </p>
                <button
                    onClick={() => window.history.back()}
                    className="w-full py-3 px-6 rounded-xl border border-zinc-200 hover:bg-zinc-50 transition-colors font-medium text-zinc-600"
                >
                    Volver
                </button>
            </div>
        </div>
    );
}
