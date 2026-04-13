import { useCallback, useEffect, useRef, useState } from 'react';

type UseKdsNotificationSoundOptions = {
    storageKey?: string;
    cooldownMs?: number;
};

type UseKdsNotificationSoundReturn = {
    enabled: boolean;
    setEnabled: (next: boolean) => void;
    isUnlocked: boolean;
    unlock: () => Promise<boolean>;
    play: () => void;
};

/**
 * Sonido de notificación para KDS (autoplay-safe).
 * - Requiere `unlock()` tras un gesto del usuario (click/touch) para que el navegador permita audio.
 * - Usa WebAudio (no requiere archivos en `public/`).
 */
export function useKdsNotificationSound(
    options: UseKdsNotificationSoundOptions = {}
): UseKdsNotificationSoundReturn {
    const { storageKey = 'kds:soundEnabled', cooldownMs = 900 } = options;

    const [enabled, _setEnabled] = useState(false);
    const [isUnlocked, setIsUnlocked] = useState(false);

    const audioCtxRef = useRef<AudioContext | null>(null);
    const lastPlayedAtRef = useRef<number>(0);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const raw = window.localStorage.getItem(storageKey);
            if (raw === '1') _setEnabled(true);
            if (raw === '0') _setEnabled(false);
        } catch {
            // Si localStorage falla (modo kiosco estricto), seguimos sin persistencia.
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const setEnabled = useCallback(
        (next: boolean) => {
            _setEnabled(next);
            if (typeof window === 'undefined') return;
            try {
                window.localStorage.setItem(storageKey, next ? '1' : '0');
            } catch {
                // no-op
            }
        },
        [storageKey]
    );

    const getOrCreateContext = useCallback(() => {
        if (typeof window === 'undefined') return null;
        const webkitAudioContext = (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        const Ctx = (window.AudioContext ?? webkitAudioContext) as typeof AudioContext | undefined;
        if (!Ctx) return null;
        if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
        return audioCtxRef.current;
    }, []);

    const unlock = useCallback(async () => {
        if (typeof window === 'undefined') return false;
        const ctx = getOrCreateContext();
        if (!ctx) return false;
        try {
            if (ctx.state === 'suspended') await ctx.resume();
            setIsUnlocked(ctx.state === 'running');
            return ctx.state === 'running';
        } catch {
            setIsUnlocked(false);
            return false;
        }
    }, [getOrCreateContext]);

    const play = useCallback(() => {
        if (typeof window === 'undefined') return;
        if (!enabled || !isUnlocked) return;

        const now = Date.now();
        if (now - lastPlayedAtRef.current < cooldownMs) return;
        lastPlayedAtRef.current = now;

        const ctx = getOrCreateContext();
        if (!ctx || ctx.state !== 'running') return;

        // Ping corto tipo notificación (no molesto, audible en cocina).
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.19);
    }, [cooldownMs, enabled, getOrCreateContext, isUnlocked]);

    return { enabled, setEnabled, isUnlocked, unlock, play };
}

