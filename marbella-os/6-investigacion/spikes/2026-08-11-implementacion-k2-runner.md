---
documento: SPIKE-IMPLEMENTACION-K2-RUNNER
clase: inmutable
estado: archivado
capa: investigacion
normativo: false
precedencia: 0
responsable: propiedad del producto
fechado: 2026-08-11
caducidad: no aplica
supersede: —
depende_de: —
---

# Implementación K2 Runner / K2b

Implementación preparada sin ejecutar K2 ni K2b y sin modificar datos funcionales.

## Componentes

- `scripts/k2/k2-runner.cjs` — runner operativo server-side mediante una única invocación `psql` transaccional.
- `scripts/k2/k2-runner.test.cjs` — pruebas de gate, allowlist, drift, postconditions, retry y seguridad.
- `supabase/migrations/20260811033217_k2_execution_registry.sql` — registry privado sin acceso a `anon` ni `authenticated`.
- `package.json` — comandos específicos de allowlist y runner.

## Protecciones

- La allowlist se carga como artefacto cerrado; el runner no descubre ni transforma operaciones.
- El checksum exigido por la tarea es `999f93c0b071f08e0d8d62a1374b0b4`.
- El checksum calculado del artefacto actual es `999f93c0b071fbc05f08bdd05f5797ef85be79020184f0eaf0e8d62a1374b0b4`.
- La discrepancia bloquea el runner antes de cualquier DML.
- El runner exige `service_role`, `run_id` UUID, gate PASS, confirmación explícita y flag de ejecución.
- La transacción usa `BEGIN`, `SET LOCAL ROLE service_role`, freeze oficial, autorización transaction-local, 71 operaciones por PK/columna/before, postconditions y `COMMIT`.
- Un error termina la transacción y registra el fallo; el freeze se libera únicamente por la función oficial.

## Estado

- K2 Runner implementado: sí.
- Global K2 Write Gate: sí, fail-closed en el runner.
- K2b ejecutada: no.
- Datos funcionales modificados: no.
- Freeze final: INACTIVE.
- K2b lista para ejecución: no, hasta resolver el checksum aprobado frente al artefacto cargado.
