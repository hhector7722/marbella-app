import type { CreateDiscrepancyInput } from '../discrepancy/factory.ts';
import {
  createShadowDiscrepancy,
  touchDiscrepancyOccurrence,
} from '../discrepancy/factory.ts';
import { buildDiscrepancyFingerprint } from '../discrepancy/fingerprint.ts';
import { transitionDiscrepancy } from '../resolver/lifecycle.ts';
import type { ShadowRunResult } from '../types/run-result.ts';
import type {
  PersistShadowRunResult,
  ShadowComparisonRecord,
  ShadowDiscrepancyStore,
  ShadowFieldDiffRecord,
  ShadowPersistencePorts,
  ShadowRunPersistMeta,
  ShadowRunRecord,
} from './ports.ts';
import type { DiscrepancyOwnerDomain } from '../types/taxonomy.ts';
import type { DiscrepancyCode, DiscrepancySeverity } from '../types/taxonomy.ts';

export type UpsertObservedDiscrepancyResult = {
  discrepancy: import('../types/discrepancy.ts').ShadowDiscrepancy;
  wasExisting: boolean;
  isRegression: boolean;
};

export async function upsertObservedDiscrepancy(
  store: ShadowDiscrepancyStore,
  input: CreateDiscrepancyInput,
): Promise<UpsertObservedDiscrepancyResult> {
  const fingerprint = buildDiscrepancyFingerprint({
    employeeId: input.employeeId,
    weekStart: input.weekStart,
    discrepancyCode: input.discrepancyCode,
    affectedFields: input.affectedFields,
  });
  const existing = await store.getByFingerprint(fingerprint);
  const now = input.nowIso ?? new Date().toISOString();

  if (!existing) {
    const created = createShadowDiscrepancy({ ...input, nowIso: now });
    await store.upsert(created);
    return { discrepancy: created, wasExisting: false, isRegression: false };
  }

  const isRegression =
    existing.status === 'CLOSED' ||
    existing.status === 'VERIFIED' ||
    existing.status === 'FIXED';

  let next = touchDiscrepancyOccurrence(existing, now);
  if (isRegression && existing.status !== 'INVESTIGATING') {
    next = {
      ...next,
      status: 'INVESTIGATING',
      resolvedAt: null,
      accepted: false,
    };
  }
  await store.upsert(next);
  return {
    discrepancy: next,
    wasExisting: true,
    isRegression,
  };
}

function severityRank(s: DiscrepancySeverity): number {
  if (s === 'CRITICAL') return 4;
  if (s === 'HIGH') return 3;
  if (s === 'MEDIUM') return 2;
  return 1;
}

function ownerForCode(code: DiscrepancyCode): DiscrepancyOwnerDomain {
  switch (code) {
    case 'D001':
    case 'D008':
      return 'Contract';
    case 'D003':
      return 'Attendance';
    case 'D002':
    case 'D004':
    case 'D005':
    case 'D007':
    case 'D010':
      return 'Liquidation';
    case 'D012':
      return 'Payroll';
    case 'D006':
    case 'D015':
    case 'D016':
      return 'Architecture';
    case 'D000':
    case 'D009':
    case 'D011':
    case 'D013':
    case 'D014':
      return 'Infra';
    default:
      return 'Unknown';
  }
}

/**
 * Persiste un ShadowRunResult vía puertos (sin infraestructura concreta).
 */
export async function persistShadowRunResult(
  ports: ShadowPersistencePorts,
  result: ShadowRunResult,
  meta: ShadowRunPersistMeta,
): Promise<PersistShadowRunResult> {
  const run: ShadowRunRecord = {
    id: result.runId,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    status: result.status,
    horizonStart: result.horizonStart,
    horizonEnd: result.horizonEnd,
    durationMs: result.metrics.durationMs,
    hoursEngineVersion: meta.hoursEngineVersion,
    shadowVersion: meta.shadowVersion,
    config: meta.config,
    errorMessage: result.errorMessage,
  };
  await ports.runs.save(run);
  await ports.metrics.save(result.runId, result.metrics);

  let discrepanciesCreated = 0;
  let discrepanciesUpdated = 0;
  let discrepanciesClosed = 0;
  let discrepanciesReopened = 0;
  let comparisonsSaved = 0;
  let fieldDiffsSaved = 0;

  for (const c of result.comparisons) {
    const comparisonId = crypto.randomUUID();
    const fingerprints: string[] = [];

    if (c.matchStatus === 'exact') {
      const open = await ports.discrepancies.listBySubject(
        c.employeeId,
        c.weekStart,
      );
      for (const d of open) {
        if (
          d.status === 'CLOSED' ||
          d.status === 'VERIFIED' ||
          d.status === 'FIXED'
        ) {
          continue;
        }
        const closed =
          d.status === 'NEW' || d.status === 'ACCEPTED'
            ? transitionDiscrepancy(d, 'CLOSED', result.finishedAt)
            : transitionDiscrepancy(d, 'FIXED', result.finishedAt);
        await ports.discrepancies.upsert(closed);
        discrepanciesClosed += 1;
        fingerprints.push(closed.fingerprint);
      }
    } else if (c.fieldDiffs.length > 0) {
      const byCode = new Map<
        DiscrepancyCode,
        {
          fields: (typeof c.fieldDiffs)[number]['field'][];
          severity: DiscrepancySeverity;
        }
      >();

      for (const f of c.fieldDiffs) {
        const cur = byCode.get(f.discrepancyCode);
        if (!cur) {
          byCode.set(f.discrepancyCode, {
            fields: [f.field],
            severity: f.severity,
          });
        } else {
          cur.fields.push(f.field);
          if (severityRank(f.severity) > severityRank(cur.severity)) {
            cur.severity = f.severity;
          }
        }
      }

      for (const [code, group] of byCode) {
        const observed = await upsertObservedDiscrepancy(ports.discrepancies, {
          employeeId: c.employeeId,
          weekStart: c.weekStart,
          discrepancyCode: code,
          affectedFields: group.fields,
          severity: group.severity,
          owner: ownerForCode(code),
          nowIso: result.finishedAt,
        });
        fingerprints.push(observed.discrepancy.fingerprint);
        if (!observed.wasExisting) discrepanciesCreated += 1;
        else discrepanciesUpdated += 1;
        if (observed.isRegression) discrepanciesReopened += 1;
      }
    }

    const comparison: ShadowComparisonRecord = {
      id: comparisonId,
      runId: result.runId,
      employeeId: c.employeeId,
      weekStart: c.weekStart,
      matchStatus: c.matchStatus,
      primaryDiscrepancyCode: c.primaryDiscrepancyCode,
      discrepancyFingerprints: fingerprints,
    };
    await ports.comparisons.save(comparison);
    comparisonsSaved += 1;

    if (c.fieldDiffs.length > 0) {
      const rows: ShadowFieldDiffRecord[] = c.fieldDiffs.map((f) => ({
        id: crypto.randomUUID(),
        comparisonId,
        runId: result.runId,
        field: f.field,
        heValue: f.heValue,
        sqlValue: f.sqlValue,
        discrepancyCode: f.discrepancyCode,
        severity: f.severity,
      }));
      await ports.comparisons.saveFieldDiffs(rows);
      fieldDiffsSaved += rows.length;
    }
  }

  return {
    runId: result.runId,
    discrepanciesCreated,
    discrepanciesUpdated,
    discrepanciesClosed,
    discrepanciesReopened,
    comparisonsSaved,
    fieldDiffsSaved,
  };
}
