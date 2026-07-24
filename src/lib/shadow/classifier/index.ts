export {
  classifyCompareResult,
  classifyFieldDelta,
  ROUNDING_EPSILON_HOURS,
  type ClassifiedFieldDiff,
  type ClassifyCompareResult,
} from './classify.ts';

/** @deprecated scaffolding */
export function classifyFieldDiffNotImplemented(): never {
  throw new Error('shadow/classifier: usar classifyCompareResult');
}
