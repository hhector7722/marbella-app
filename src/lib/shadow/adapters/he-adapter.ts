import type { CanonicalComparisonVector } from '../types/canonical-vector.ts';

/**
 * Puerto de entrada al Shadow Domain desde Hours Engine.
 *
 * Implementación real (Commit 2): proyecta LiquidationResult → CanonicalComparisonVector.
 * Este módulo NO importa hours-engine en el scaffolding (evita acoplar el bounded context).
 */
export type HeAdapterInput = {
  employeeId: string;
  weekStart: string;
  /**
   * Payload opaco del productor HE.
   * Tipado concreto vive solo en el adapter implementado (fuera del núcleo de tipos Shadow).
   */
  liquidation: unknown;
  /** Metadatos de hechos ya resueltos (justificadas, etc.) si el adapter los necesita. */
  facts?: unknown;
};

export type HeAdapter = {
  toCanonical(input: HeAdapterInput): CanonicalComparisonVector;
};

export function createHeAdapterStub(): HeAdapter {
  return {
    toCanonical() {
      throw new Error(
        'shadow/adapters: HeAdapter no implementado (Commit 2)',
      );
    },
  };
}
