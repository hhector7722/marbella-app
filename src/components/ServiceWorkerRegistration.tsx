'use client';

import { useEffect } from 'react';
import { saveSubscription } from '@/app/actions/notifications';
import { toast } from 'sonner';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export function ServiceWorkerRegistration() {
    useEffect(() => {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            // Sin soporte de push (típico en iOS antiguo / navegadores restringidos)
            return;
        }

        navigator.serviceWorker.register('/sw.js')
            .then(async (registration) => {
                console.log('SW registered:', registration);
                if (!VAPID_PUBLIC_KEY) {
                    console.error('Push: missing NEXT_PUBLIC_VAPID_PUBLIC_KEY');
                    toast.error('Notificaciones push no configuradas en este entorno (falta VAPID_PUBLIC_KEY).');
                    return;
                }

                if (Notification.permission === 'default') {
                    const permission = await Notification.requestPermission();
                    if (permission !== 'granted') {
                        toast.error('Permiso de notificaciones denegado. Actívalo en el navegador para recibir avisos.');
                        return;
                    }
                }
                if (Notification.permission !== 'granted') {
                    toast.error('Notificaciones desactivadas en el navegador. No se pueden recibir avisos.');
                    return;
                }

                let subscription = await registration.pushManager.getSubscription();
                if (!subscription) {
                    try {
                        subscription = await registration.pushManager.subscribe({
                            userVisibleOnly: true,
                            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
                        });
                    } catch (err) {
                        console.error('Failed to subscribe to push:', err);
                        toast.error('No se pudo activar push en este dispositivo. Revisa permisos y que estés en HTTPS.');
                        return;
                    }
                }

                if (subscription) {
                    const res = await saveSubscription(JSON.parse(JSON.stringify(subscription)));
                    if (res?.error) {
                        console.error('Error saving push subscription:', res.error);
                        toast.error(`No se pudo guardar la suscripción push: ${res.error}`);
                    }
                }
            })
            .catch((error) => {
                console.error('SW registration failed:', error);
                toast.error('No se pudo registrar el Service Worker (push).');
            });
    }, []);

    return null;
}
