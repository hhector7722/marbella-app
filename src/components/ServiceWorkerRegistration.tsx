'use client';

import { useEffect } from 'react';
import { saveSubscription } from '@/app/actions/notifications';

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
        if ('serviceWorker' in navigator && 'PushManager' in window && VAPID_PUBLIC_KEY) {
            navigator.serviceWorker.register('/sw.js')
                .then(async (registration) => {
                    console.log('SW registered:', registration);

                    // Request notification permission if not granted
                    if (Notification.permission === 'default') {
                        const permission = await Notification.requestPermission();
                        if (permission !== 'granted') return;
                    }

                    // Get existing subscription or create new one
                    let subscription = await registration.pushManager.getSubscription();

                    if (!subscription) {
                        try {
                            subscription = await registration.pushManager.subscribe({
                                userVisibleOnly: true,
                                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
                            });

                            // Save to DB
                            await saveSubscription(JSON.parse(JSON.stringify(subscription)));
                        } catch (err) {
                            console.error('Failed to subscribe to push:', err);
                        }
                    }
                })
                .catch((error) => {
                    console.error('SW registration failed:', error);
                });
        }
    }, []);

    return null;
}
