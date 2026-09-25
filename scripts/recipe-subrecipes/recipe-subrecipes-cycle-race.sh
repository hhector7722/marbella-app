#!/usr/bin/env bash
# Dos conexiones reales. Una sostiene A→B; la otra intenta B→A y tiene que esperar el candado.
set -euo pipefail

CONTAINER="${MARBELLA_PG_CONTAINER:-marbella-b3-pg}"
run() {
  docker exec -i "$CONTAINER" psql -U postgres -d marbella -v ON_ERROR_STOP=1 -X -q "$@"
}

A="$(docker exec "$CONTAINER" psql -U postgres -d marbella -tA -c 'SELECT gen_random_uuid()')"
B="$(docker exec "$CONTAINER" psql -U postgres -d marbella -tA -c 'SELECT gen_random_uuid()')"

run <<SQL
INSERT INTO public.recipes (id, name) VALUES
  ('${A}', 'carrera A'),
  ('${B}', 'carrera B');
SQL

run > /tmp/cycle-race-1.out 2>&1 <<SQL &
BEGIN;
INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit)
VALUES ('${A}', '${B}', 1, 'ud');
SELECT pg_sleep(2);
COMMIT;
SQL
pid1=$!

sleep 0.4
start=$(date +%s%3N)
set +e
run > /tmp/cycle-race-2.out 2>&1 <<SQL
INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit)
VALUES ('${B}', '${A}', 1, 'ud');
SQL
code2=$?
set -e
end=$(date +%s%3N)
wait "$pid1"

elapsed=$((end - start))
if [[ "$code2" -eq 0 ]]; then
  echo "la segunda sesión confirmó B→A" >&2
  exit 1
fi
if ! grep -q 'recipe_subrecipes produciría un ciclo' /tmp/cycle-race-2.out; then
  echo "la segunda sesión no falló por ciclo:" >&2
  cat /tmp/cycle-race-2.out >&2
  exit 1
fi
if [[ "$elapsed" -lt 1500 ]]; then
  echo "la segunda sesión no esperó el candado (${elapsed} ms)" >&2
  exit 1
fi

count="$(docker exec "$CONTAINER" psql -U postgres -d marbella -tA -c \
  "SELECT count(*) FROM public.recipe_subrecipes WHERE parent_recipe_id IN ('${A}','${B}') AND child_recipe_id IN ('${A}','${B}')")"
if [[ "$count" != "1" ]]; then
  echo "filas persistidas: ${count}" >&2
  exit 1
fi

locks="$(docker exec "$CONTAINER" psql -U postgres -d marbella -tA -c \
  "SELECT count(*) FROM pg_locks WHERE locktype = 'advisory'")"
if [[ "$locks" != "0" ]]; then
  echo "advisory locks vivos: ${locks}" >&2
  exit 1
fi

echo "carrera ok: una arista, la otra rechazada, espera ${elapsed} ms, sin candado residual"
