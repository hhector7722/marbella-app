# MIGRATION HISTORY AUDIT

## Local
Total: 300 migraciones.
Última local: 99990000000000

## Remote
Total: 297 migraciones.
Última remota: 99990000000000

## Coincidencias
Total: 297
Última coincidencia: 99990000000000

## LOCAL_ONLY (3)
- 20260220000000_initial_schema.sql
- 20260812012400_create_document_evidence_layer.sql
- 20260812020000_rpc_persist_document_evidence.sql

## REMOTE_ONLY (0)

## Último punto común
99990000000000

## Primera divergencia
Local diverge (ahead) en: 20260220000000

## Evidence migrations
- 20260812012400_create_document_evidence_layer.sql: PENDING
- 20260812020000_rpc_persist_document_evidence.sql: PENDING

## Causa de la divergencia
El baseline inicial `20260220000000` NO ESTÁ REGISTRADO en `supabase_migrations.schema_migrations`. 
Al no estar registrado el baseline inicial, el CLI local (que contiene el baseline original) diverge inmediatamente al comparar historiales con la base de datos remota. 
Todas las migraciones posteriores sí están sincronizadas y aplicadas remotamente, coincidiendo 1:1. Esto suele ocurrir cuando el entorno de producción se levanta inicialmente sin pasar por la migración formal de CLI, y el registro comienza a contarse en la segunda migración.

## Opciones técnicamente posibles

### A) Aplicar únicamente las dos migraciones de Evidence (Vía API SQL crudo)
- **Riesgo:** Bajo a corto plazo, pero no soluciona el problema de `db push` a futuro.
- **Qué modifica:** Crea la nueva capa de evidencia. 
- **Qué NO modifica:** El historial `schema_migrations`, por lo que el CLI seguirá detectando divergencia.
- **Impacto en producción:** Añade la capa de evidencia y hace que el Visor funcione. Cero downtime.

### B) Crear una migración de reconciliación (Baseline Snapshot)
- **Riesgo:** Alto (involucra un `squash` de todo el esquema local y forzar a producción a adoptar ese historial, o recrear la bd).
- **Qué modifica:** El historial de migraciones.
- **Qué NO modifica:** Datos existentes.
- **Impacto en producción:** Muy peligroso sin downtime y validación profunda, ya comprobamos que hay divergencias estructurales entre lo local y producción.

### C) Sincronizar hacia abajo (Pull production to Local)
- **Riesgo:** Moderado.
- **Qué modifica:** Sobreescribe el `20260220000000_initial_schema.sql` local y todos los demás usando un volcado del esquema actual.
- **Qué NO modifica:** Producción.
- **Impacto en producción:** Cero, pero reconstruye el repositorio local para que sea una copia exacta de producción.

### D) Insertar el baseline faltante manualmente en el historial remoto (migration repair)
- **Riesgo:** Moderado-Bajo. La CLI solo hará un `INSERT` en la tabla `schema_migrations`.
- **Qué modifica:** Solamente inserta la fila `20260220000000` en la tabla `schema_migrations` remota.
- **Qué NO modifica:** Esquema ni datos.
- **Impacto en producción:** Cero. Soluciona la divergencia para el CLI, permitiendo hacer `db push`. Sin embargo, ignorará las diferencias estructurales subyacentes entre el archivo SQL local y el schema remoto real (detectadas en el deep audit).

## RECOMENDACIÓN

**La Opción A es la recomendada para este turno.** Dado que has descartado explícitamente usar `migration repair` para el baseline 20260220000000 debido a las divergencias estructurales confirmadas, intentar forzar la reconciliación del historial mediante Supabase CLI (Opciones C o B) requeriría un proyecto de refactorización de infraestructura mayor que bloquea el objetivo inmediato. 

Aplicar **únicamente** las dos migraciones de Evidence mediante consultas SQL directas (Opción A) no afecta los datos existentes ni el historial corrompido, y permite habilitar la funcionalidad del Visor Documental hoy mismo. El saneamiento del baseline (Opciones B o C) debe abordarse como un ticket de deuda técnica separado.
