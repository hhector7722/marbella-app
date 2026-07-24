export {
  compareCanonicalVectors,
  type CanonicalCompareResult,
  type RawCanonicalFieldDelta,
} from './compare.ts';

/** @deprecated scaffolding */
export function compareCanonicalVectorsNotImplemented(): never {
  throw new Error('shadow/comparator: usar compareCanonicalVectors');
}
