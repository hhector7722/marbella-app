/**
 * Orquestación ops: loaders reales → executeAndPersistShadowRun → resumen.
 * El dominio Shadow no importa este módulo.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  executeAndPersistShadowRun,
  type ExecuteAndPersistShadowRunOutput,
  type ShadowFactLoader,
  type ShadowSubjectLoader,
  SHADOW_DOMAIN_VERSION,
} from '../../../lib/shadow/index.ts';
import { createSupabaseShadowPersistence } from '../supabase-shadow-persistence.ts';
import { resolveHorizonBounds } from '../loaders/horizon.ts';
import { createSupabaseShadowSubjectLoader } from '../loaders/supabase-subject-loader.ts';
import { createSupabaseShadowFactLoader } from '../loaders/supabase-fact-loader.ts';
import type { ShadowCliArgs } from './parse-args.ts';
import { formatShadowRunSummary } from './format-summary.ts';

export const HOURS_ENGINE_SHADOW_LABEL = 'hours-engine';

export type ShadowOpsLogger = {
  info(message: string): void;
  error(message: string): void;
};

export type RunShadowOpsInput = {
  client: SupabaseClient;
  args: ShadowCliArgs;
  log?: ShadowOpsLogger;
  /** Inyectables para tests (si se omiten, se crean loaders Supabase). */
  subjects?: ShadowSubjectLoader;
  facts?: ShadowFactLoader;
  nowIso?: () => string;
};

function withProgress(
  inner: ShadowFactLoader,
  totalHint: number,
  log: ShadowOpsLogger,
  verbose: boolean,
): ShadowFactLoader {
  let done = 0;
  return {
    async loadFacts(subject) {
      done += 1;
      if (verbose || done === 1 || done === totalHint || done % 10 === 0) {
        log.info(
          `progreso ${done}/${totalHint || '?'}  ${subject.employeeId.slice(0, 8)}… ${subject.weekStart}`,
        );
      }
      return inner.loadFacts(subject);
    },
  };
}

export async function runShadowOps(
  input: RunShadowOpsInput,
): Promise<{
  output: ExecuteAndPersistShadowRunOutput;
  summary: string;
}> {
  const log: ShadowOpsLogger = input.log ?? {
    info: (m) => console.log(m),
    error: (m) => console.error(m),
  };

  const horizon = resolveHorizonBounds({
    week: input.args.week,
    from: input.args.from,
    to: input.args.to,
  });

  const subjects =
    input.subjects ??
    createSupabaseShadowSubjectLoader(input.client, {
      weekStarts: horizon.weekStarts,
      employeeIds:
        input.args.employeeIds.length > 0
          ? input.args.employeeIds
          : undefined,
      limit: input.args.limit,
    });

  const baseFacts =
    input.facts ??
    createSupabaseShadowFactLoader(input.client, {
      horizonEndWeekStart: horizon.horizonEnd,
    });

  const subjectList = await subjects.listSubjects();
  log.info(
    `inicio Shadow Run  horizonte=${horizon.horizonStart}…${horizon.horizonEnd}  sujetos=${subjectList.length}  persist=${input.args.persist ? 'yes' : 'dry-run'}`,
  );

  const facts = withProgress(
    baseFacts,
    subjectList.length,
    log,
    input.args.verbose,
  );

  const persistence = input.args.persist
    ? createSupabaseShadowPersistence(input.client)
    : undefined;

  const output = await executeAndPersistShadowRun({
    subjects,
    facts,
    options: {
      horizonStart: horizon.horizonStart,
      horizonEnd: horizon.horizonEnd,
      runId: input.args.runId,
      clock: input.nowIso ? { nowIso: input.nowIso } : undefined,
    },
    persistence,
    persistMeta: {
      hoursEngineVersion: HOURS_ENGINE_SHADOW_LABEL,
      shadowVersion: SHADOW_DOMAIN_VERSION,
      config: {
        employeeFilter: input.args.employeeIds,
        limit: input.args.limit ?? null,
        dryRun: input.args.dryRun,
        weekStarts: horizon.weekStarts,
      },
    },
  });

  for (const o of output.result.subjectOutcomes) {
    if (o.outcome === 'failed') {
      log.error(`error ${o.employeeId} ${o.weekStart}: ${o.detail ?? ''}`);
    }
  }

  const summary = formatShadowRunSummary(output, {
    persistEnabled: input.args.persist,
  });
  log.info(summary.trimEnd());

  return { output, summary };
}
