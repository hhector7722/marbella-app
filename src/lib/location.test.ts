import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    MAX_DISTANCE_METERS,
    formatGeofenceRejectionMessage,
    getDistanceFromLatLonInMeters,
    isOutsideGeofence,
    MARBELLA_COORDS,
} from './location.ts';

describe('location geofencing', () => {
    it('MAX_DISTANCE_METERS es 150', () => {
        assert.equal(MAX_DISTANCE_METERS, 150);
    });

    it('isOutsideGeofence respeta el umbral', () => {
        assert.equal(isOutsideGeofence(149), false);
        assert.equal(isOutsideGeofence(150), false);
        assert.equal(isOutsideGeofence(151), true);
    });

    it('formatGeofenceRejectionMessage incluye distancia y máximo', () => {
        const message = formatGeofenceRejectionMessage(312.4);
        assert.match(message, /312 m/);
        assert.match(message, /máx\. 150 m/);
        assert.match(message, /terraza/i);
    });

    it('distancia al ancla es 0 en el mismo punto', () => {
        const distance = getDistanceFromLatLonInMeters(
            MARBELLA_COORDS.lat,
            MARBELLA_COORDS.lng,
            MARBELLA_COORDS.lat,
            MARBELLA_COORDS.lng,
        );
        assert.equal(distance, 0);
    });
});
