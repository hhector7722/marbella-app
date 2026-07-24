/**
 * Parser de argumentos del Shadow CLI (ops).
 * Sin dependencias del dominio más allá de tipos de opciones.
 */

export type ShadowCliArgs = {
  employeeIds: string[];
  week?: string;
  from?: string;
  to?: string;
  limit?: number;
  persist: boolean;
  dryRun: boolean;
  verbose: boolean;
  runId?: string;
  help: boolean;
};

function takeValue(
  argv: string[],
  i: number,
  flag: string,
): { value: string; next: number } {
  const next = argv[i + 1];
  if (!next || next.startsWith('--')) {
    throw new Error(`${flag} requiere un valor`);
  }
  return { value: next, next: i + 1 };
}

/**
 * Parsea argv estilo:
 * --employee id [--employee id2] | --employee id1,id2
 * --week | --from/--to | --limit | --persist | --dry-run | --verbose | --run-id
 */
export function parseShadowCliArgs(argv: readonly string[]): ShadowCliArgs {
  const employeeIds: string[] = [];
  let week: string | undefined;
  let from: string | undefined;
  let to: string | undefined;
  let limit: number | undefined;
  let persist = false;
  let dryRun = false;
  let verbose = false;
  let runId: string | undefined;
  let help = false;

  const args = [...argv];
  for (let i = 0; i < args.length; i++) {
    const token = args[i]!;
    switch (token) {
      case '-h':
      case '--help':
        help = true;
        break;
      case '--employee':
      case '--employees': {
        const { value, next } = takeValue(args, i, token);
        i = next;
        for (const part of value.split(',')) {
          const id = part.trim();
          if (id) employeeIds.push(id);
        }
        break;
      }
      case '--week': {
        const { value, next } = takeValue(args, i, token);
        i = next;
        week = value;
        break;
      }
      case '--from': {
        const { value, next } = takeValue(args, i, token);
        i = next;
        from = value;
        break;
      }
      case '--to': {
        const { value, next } = takeValue(args, i, token);
        i = next;
        to = value;
        break;
      }
      case '--limit': {
        const { value, next } = takeValue(args, i, token);
        i = next;
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1) {
          throw new Error('--limit debe ser un entero ≥ 1');
        }
        limit = n;
        break;
      }
      case '--run-id': {
        const { value, next } = takeValue(args, i, token);
        i = next;
        runId = value;
        break;
      }
      case '--persist':
        persist = true;
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--verbose':
      case '-v':
        verbose = true;
        break;
      default:
        if (token.startsWith('-')) {
          throw new Error(`Flag desconocido: ${token}`);
        }
        throw new Error(`Argumento posicional no soportado: ${token}`);
    }
  }

  // --dry-run gana sobre --persist; sin ninguno → dry-run (seguro).
  if (dryRun) persist = false;
  else if (!persist) dryRun = true;

  return {
    employeeIds,
    week,
    from,
    to,
    limit,
    persist,
    dryRun,
    verbose,
    runId,
    help,
  };
}

export const SHADOW_CLI_HELP = `Shadow Mode CLI (ops) — Etapa 8A

Uso:
  npm run shadow -- --week 2026-07-20
  npm run shadow -- --from 2026-07-01 --to 2026-07-31 --limit 20
  npm run shadow -- --employee <uuid> --week 2026-07-20 --persist

Flags:
  --employee <uuid>[,uuid…]   Filtrar empleado(s)
  --week YYYY-MM-DD           Una semana (lunes o día de esa semana)
  --from / --to YYYY-MM-DD    Horizonte inclusivo
  --limit <n>                 Máximo de sujetos Employee×Week
  --dry-run                   No persistir (default)
  --persist                   Persistir vía Supabase (requiere migración)
  --verbose                   Más progreso
  --run-id <id>               Id fijo del run
  --help                      Esta ayuda

No incluye cron, dashboard ni alertas (Etapa 8B).
`;
