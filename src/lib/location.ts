/**
 * Bar La Marbella - Geofencing Utilities
 */

export const MARBELLA_COORDS = {
    lat: 41.399772,
    lng: 2.211856
};

export const MAX_DISTANCE_METERS = 150;

/**
 * Calculates the distance between two points in meters using the Haversine formula.
 */
export function getDistanceFromLatLonInMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Radio de la tierra en metros
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distancia en metros
}

function deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
}

/**
 * Requests the current geolocation of the user.
 */
export function getCurrentPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
        if (typeof window === 'undefined' || !navigator.geolocation) {
            reject(new Error("Tu navegador no soporta geolocalización o estamos en el servidor."));
            return;
        }

        navigator.geolocation.getCurrentPosition(resolve, (error) => {
            let message = "Error al obtener ubicación";
            if (error.code === error.TIMEOUT) message = "Tiempo de espera agotado al obtener ubicación. Inténtalo de nuevo.";
            if (error.code === error.PERMISSION_DENIED) message = "Debes permitir el acceso a la ubicación para fichar.";
            if (error.code === error.POSITION_UNAVAILABLE) message = "Ubicación no disponible en este momento.";
            reject(new Error(message));
        }, {
            enableHighAccuracy: true,
            timeout: 20000,
            maximumAge: 0
        });
    });
}
