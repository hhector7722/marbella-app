import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  PayrollEmployeeNormalizer,
  extractLastName,
  normalizeLastName,
} from './payroll-employee-normalizer.ts';
import type { ProfileEmployeeCandidate } from './payroll-employee-normalizer.ts';

const mockProfiles: ProfileEmployeeCandidate[] = [
  { id: 'uuid-1', first_name: 'Héctor', last_name: 'Sánchez Arranz', email: null, dni: null },
  { id: 'uuid-2', first_name: 'Maria', last_name: 'Perez Garcia', email: null, dni: null },
  { id: 'uuid-3', first_name: 'Juan', last_name: 'López Gómez', email: null, dni: null },
];

describe('PayrollEmployeeNormalizer', () => {
  describe('initialize', () => {
    it('el servicio siempre puede inicializarse aunque existan apellidos duplicados', async () => {
      const normalizer = new PayrollEmployeeNormalizer();
      const duplicateProfiles: ProfileEmployeeCandidate[] = [
        { id: '1', first_name: 'Ana', last_name: 'Martínez', email: null, dni: null },
        { id: '2', first_name: 'Carlos', last_name: 'Martínez', email: null, dni: null },
      ];
      
      await assert.doesNotReject(normalizer.initialize(duplicateProfiles));
      
      // Validar que el error solo surge durante la resolución de un trabajador con ese apellido
      const match = normalizer.matchCandidate({ name: 'MARTINEZ, ANA' });
      assert.equal(match.matched, false);
      assert.ok(match.errorMessage?.includes('Ambigüedad'));
    });
  });

  describe('extractLastName', () => {
    it('extrae el apellido correctamente cuando hay coma', () => {
      assert.equal(extractLastName('SANCHEZ ARRANZ, HECTOR', mockProfiles), 'SANCHEZ ARRANZ');
    });

    it('extrae el apellido buscando en profiles si no hay coma (Formato First Last)', () => {
      // "Juan López Gómez" no tiene coma, iterará por perfiles y verá que Juan (first) + López Gómez (last) coincide
      assert.equal(extractLastName('Juan López Gómez', mockProfiles), 'López Gómez');
    });

    it('extrae el apellido buscando en profiles si no hay coma (Formato Last First)', () => {
      // "López Gómez Juan"
      assert.equal(extractLastName('LÓPEZ GÓMEZ JUAN', mockProfiles), 'López Gómez');
    });

    it('devuelve el string completo como fallback si no hay coma ni coincidencias en perfiles', () => {
      assert.equal(extractLastName('PEPE INVENTADO PEREZ', mockProfiles), 'PEPE INVENTADO PEREZ');
    });

    it('hace trim al resultado', () => {
      assert.equal(extractLastName('  GARCIA PEREZ  ,   JUAN  ', mockProfiles), 'GARCIA PEREZ');
    });
  });

  describe('normalizeLastName', () => {
    it('convierte a mayúsculas', () => {
      assert.equal(normalizeLastName('sanchez arranz'), 'SANCHEZ ARRANZ');
    });

    it('elimina acentos', () => {
      assert.equal(normalizeLastName('Sánchez'), 'SANCHEZ');
      assert.equal(normalizeLastName('Pérez, García'), 'PEREZ GARCIA'); // Quita la coma también
    });

    it('elimina caracteres especiales', () => {
      assert.equal(normalizeLastName('SANCHEZ-ARRANZ.'), 'SANCHEZARRANZ');
    });

    it('reduce espacios duplicados', () => {
      assert.equal(normalizeLastName('SANCHEZ    ARRANZ'), 'SANCHEZ ARRANZ');
    });
  });

  describe('matchCandidate', () => {
    it('Caso 1: Asignación correcta con diferencias de mayúsculas/minúsculas y coma', async () => {
      const normalizer = new PayrollEmployeeNormalizer();
      await normalizer.initialize(mockProfiles);
      
      const match = normalizer.matchCandidate({ name: 'SANCHEZ ARRANZ, HECTOR' });
      assert.equal(match.matched, true);
      assert.equal(match.userId, 'uuid-1');
      assert.equal(match.matchMethod, 'fullName');
    });

    it('Caso 1: Asignación correcta con diferencias de acentos', async () => {
      const normalizer = new PayrollEmployeeNormalizer();
      await normalizer.initialize(mockProfiles);
      
      const match = normalizer.matchCandidate({ name: 'PÉREZ GARCÍA, MARIA' });
      assert.equal(match.matched, true);
      assert.equal(match.userId, 'uuid-2');
    });

    it('Caso 1: Asignación correcta con diferencias de espacios', async () => {
      const normalizer = new PayrollEmployeeNormalizer();
      await normalizer.initialize(mockProfiles);
      
      const match = normalizer.matchCandidate({ name: 'SANCHEZ    ARRANZ, HECTOR' });
      assert.equal(match.matched, true);
      assert.equal(match.userId, 'uuid-1');
    });

    it('Caso 1: Ausencia de coma en PDF (Se resuelve vía extractLastName con perfiles)', async () => {
      const normalizer = new PayrollEmployeeNormalizer();
      await normalizer.initialize(mockProfiles);
      
      const match = normalizer.matchCandidate({ name: 'JUAN LÓPEZ GÓMEZ' }); 
      assert.equal(match.matched, true);
      assert.equal(match.userId, 'uuid-3');
    });

    it('Caso 2: Trabajador inexistente (0 coincidencias)', async () => {
      const normalizer = new PayrollEmployeeNormalizer();
      await normalizer.initialize(mockProfiles);
      
      const match = normalizer.matchCandidate({ name: 'INVENTADO RODRIGUEZ, PEPE' });
      assert.equal(match.matched, false);
      assert.equal(match.userId, null);
      assert.ok(match.errorMessage?.includes('No existe coincidencia para el apellido'));
    });
  });
});
