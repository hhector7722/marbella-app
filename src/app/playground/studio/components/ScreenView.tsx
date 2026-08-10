'use client';

import React from 'react';
import { SCREEN_REGISTRY, ScreenId } from '../screens/real';
import { DesignProvider } from '../screens/system';
import { Recipe } from '../types';

// ============================================================
// VISOR DE PANTALLA — la pantalla real protagonista, con una
// receta aplicada (o sin ella: identidad original).
// ============================================================

export function ScreenView({ screenKey, recipe, className = '' }: { screenKey: ScreenId; recipe: Recipe; className?: string }) {
    const Screen = SCREEN_REGISTRY[screenKey].component;
    return (
        <DesignProvider recipe={recipe}>
            <div className={`h-full ${className}`}>
                <Screen />
            </div>
        </DesignProvider>
    );
}

export function ScreenPicker({ value, onChange }: { value: ScreenId; onChange: (s: ScreenId) => void }) {
    return (
        <div className="flex flex-wrap items-center gap-1">
            {(Object.keys(SCREEN_REGISTRY) as ScreenId[]).map(key => (
                <button
                    key={key}
                    onClick={() => onChange(key)}
                    style={{ minHeight: 48 }}
                    className={`rounded-xl px-3 text-[9px] font-black uppercase tracking-widest transition-colors ${
                        value === key ? 'bg-[#36606F] text-white' : 'text-zinc-400 hover:text-white'
                    }`}
                >
                    {SCREEN_REGISTRY[key].title}
                </button>
            ))}
        </div>
    );
}
