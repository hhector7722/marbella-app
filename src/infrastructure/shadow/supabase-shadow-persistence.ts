/**
 * Infraestructura Shadow → Supabase.
 * Implementa puertos de `src/lib/shadow/persistence/ports`.
 * El dominio Shadow NO importa este módulo.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ShadowDiscrepancy } from '../../lib/shadow/types/discrepancy.ts';
import type { ShadowRunMetrics } from '../../lib/shadow/types/run-result.ts';
import type {
  ShadowComparisonRecord,
  ShadowComparisonStore,
  ShadowDiscrepancyStore,
  ShadowFieldDiffRecord,
  ShadowMetricsStore,
  ShadowPersistencePorts,
  ShadowRunRecord,
  ShadowRunStore,
} from '../../lib/shadow/persistence/ports.ts';

type Db = SupabaseClient;

function toJsonValue(v: string | number | boolean | null): unknown {
  return v;
}

export function createSupabaseShadowRunStore(client: Db): ShadowRunStore {
  return {
    async save(run: ShadowRunRecord) {
      const { error } = await client.from('shadow_parity_runs').upsert(
        {
          id: run.id,
          started_at: run.startedAt,
          finished_at: run.finishedAt,
          status: run.status,
          horizon_start: run.horizonStart,
          horizon_end: run.horizonEnd,
          duration_ms: run.durationMs,
          hours_engine_version: run.hoursEngineVersion,
          shadow_version: run.shadowVersion,
          config: run.config,
          error_message: run.errorMessage,
        },
        { onConflict: 'id' },
      );
      if (error) throw new Error(`shadow_parity_runs: ${error.message}`);
    },
    async getById(id: string) {
      const { data, error } = await client
        .from('shadow_parity_runs')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(`shadow_parity_runs get: ${error.message}`);
      if (!data) return null;
      return {
        id: data.id,
        startedAt: data.started_at,
        finishedAt: data.finished_at,
        status: data.status,
        horizonStart: data.horizon_start,
        horizonEnd: data.horizon_end,
        durationMs: data.duration_ms,
        hoursEngineVersion: data.hours_engine_version,
        shadowVersion: data.shadow_version,
        config: data.config ?? {},
        errorMessage: data.error_message,
      } as ShadowRunRecord;
    },
  };
}

export function createSupabaseShadowMetricsStore(
  client: Db,
): ShadowMetricsStore {
  return {
    async save(runId: string, metrics: ShadowRunMetrics) {
      const { error } = await client.from('shadow_parity_run_metrics').upsert(
        {
          run_id: runId,
          total_subjects: metrics.totalSubjects,
          exact_matches: metrics.exactMatches,
          tolerated_matches: metrics.toleratedMatches,
          critical_differences: metrics.criticalDifferences,
          comparisons: metrics.comparisons,
          skipped: metrics.skipped,
          failed: metrics.failed,
          succeeded: metrics.succeeded,
          diffs: metrics.diffs,
          duration_ms: metrics.durationMs,
          exact_match_rate: metrics.exactMatchRate,
          critical_diff_rate: metrics.criticalDiffRate,
          by_code: metrics.byCode,
        },
        { onConflict: 'run_id' },
      );
      if (error) throw new Error(`shadow_parity_run_metrics: ${error.message}`);
    },
  };
}

export function createSupabaseShadowDiscrepancyStore(
  client: Db,
): ShadowDiscrepancyStore {
  return {
    async getByFingerprint(fingerprint: string) {
      const { data, error } = await client
        .from('shadow_parity_discrepancies')
        .select('*')
        .eq('fingerprint', fingerprint)
        .maybeSingle();
      if (error) throw new Error(`discrepancies get: ${error.message}`);
      return data ? rowToDiscrepancy(data) : null;
    },
    async getById(id: string) {
      const { data, error } = await client
        .from('shadow_parity_discrepancies')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(`discrepancies getById: ${error.message}`);
      return data ? rowToDiscrepancy(data) : null;
    },
    async listBySubject(employeeId: string, weekStart: string) {
      const { data, error } = await client
        .from('shadow_parity_discrepancies')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('week_start', weekStart);
      if (error) throw new Error(`discrepancies list: ${error.message}`);
      return (data ?? []).map(rowToDiscrepancy);
    },
    async upsert(d: ShadowDiscrepancy) {
      const { error } = await client.from('shadow_parity_discrepancies').upsert(
        {
          id: d.id,
          fingerprint: d.fingerprint,
          employee_id: d.employeeId,
          week_start: d.weekStart,
          discrepancy_code: d.discrepancyCode,
          severity: d.severity,
          owner: d.owner,
          status: d.status,
          affected_fields: [...d.affectedFields],
          occurrences: d.occurrences,
          accepted: d.accepted,
          notes: d.notes,
          first_seen_at: d.firstSeenAt,
          last_seen_at: d.lastSeenAt,
          resolved_at: d.resolvedAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'fingerprint' },
      );
      if (error) throw new Error(`discrepancies upsert: ${error.message}`);
    },
  };
}

export function createSupabaseShadowComparisonStore(
  client: Db,
): ShadowComparisonStore {
  return {
    async save(c: ShadowComparisonRecord) {
      const { error } = await client.from('shadow_parity_comparisons').upsert(
        {
          id: c.id,
          run_id: c.runId,
          employee_id: c.employeeId,
          week_start: c.weekStart,
          match_status: c.matchStatus,
          primary_discrepancy_code: c.primaryDiscrepancyCode,
          discrepancy_fingerprints: [...c.discrepancyFingerprints],
        },
        { onConflict: 'id' },
      );
      if (error) throw new Error(`comparisons: ${error.message}`);
    },
    async saveFieldDiffs(diffs: readonly ShadowFieldDiffRecord[]) {
      if (diffs.length === 0) return;
      const { error } = await client.from('shadow_parity_field_diffs').upsert(
        diffs.map((d) => ({
          id: d.id,
          comparison_id: d.comparisonId,
          run_id: d.runId,
          field: d.field,
          he_value: toJsonValue(d.heValue),
          sql_value: toJsonValue(d.sqlValue),
          discrepancy_code: d.discrepancyCode,
          severity: d.severity,
        })),
        { onConflict: 'id' },
      );
      if (error) throw new Error(`field_diffs: ${error.message}`);
    },
  };
}

export function createSupabaseShadowPersistence(
  client: Db,
): ShadowPersistencePorts {
  return {
    runs: createSupabaseShadowRunStore(client),
    comparisons: createSupabaseShadowComparisonStore(client),
    discrepancies: createSupabaseShadowDiscrepancyStore(client),
    metrics: createSupabaseShadowMetricsStore(client),
  };
}

function rowToDiscrepancy(row: Record<string, unknown>): ShadowDiscrepancy {
  return {
    id: String(row.id),
    fingerprint: String(row.fingerprint),
    employeeId: String(row.employee_id),
    weekStart: String(row.week_start).slice(0, 10),
    discrepancyCode: row.discrepancy_code as ShadowDiscrepancy['discrepancyCode'],
    severity: row.severity as ShadowDiscrepancy['severity'],
    owner: row.owner as ShadowDiscrepancy['owner'],
    status: row.status as ShadowDiscrepancy['status'],
    affectedFields: ((row.affected_fields as string[]) ??
      []) as ShadowDiscrepancy['affectedFields'],
    occurrences: Number(row.occurrences),
    accepted: Boolean(row.accepted),
    notes: (row.notes as string | null) ?? null,
    firstSeenAt: String(row.first_seen_at),
    lastSeenAt: String(row.last_seen_at),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
  };
}
