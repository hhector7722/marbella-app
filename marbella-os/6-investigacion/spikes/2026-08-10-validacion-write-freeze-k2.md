---
documento: SPIKE-VALIDACION-WRITE-FREEZE-K2
clase: inmutable
estado: vigente
capa: investigacion
normativo: false
precedencia: 0
responsable: propiedad del producto
fechado: 2026-08-10
caducidad: no aplica
supersede: —
depende_de: CANON, GLOSARIO, MODELO-DE-DATOS, DOMINIO-PRECIOS-Y-COMPRAS, ARQUITECTURA
---

# Validación final del write-freeze K2

## Resumen

Validación en la BD real de Supabase. La migración `20260810191300_k2_domain_write_freeze.sql` está aplicada y los objetos de infraestructura ya existen.

Se ejecutó la suite de diagnóstico original `sql/diagnostics/k2/2026-08-10-write-freeze-k2.test.sql` en la BD real. Además, se realizaron comprobaciones manuales adicionales para capturar SQLSTATE y evidenciar la lógica de cada caso crítico.

## Objetivo

Obtener evidencia reproducible de que el write-freeze K2 funciona en la BD real sin modificar la implementación del write-freeze.

## Estado inicial

- BD utilizada: real Supabase (conexión `supabase/.temp/pooler-url`).
- Migración aplicada: sí.
- Objetos verificados:
  - Tabla `private.k2_domain_freezes` existe.
  - Funciones `private.k2_acquire_domain_freeze`, `private.k2_authorize_transaction`, `private.k2_domain_freeze_status`, `private.k2_release_domain_freeze`, `private.k2_renew_domain_freeze`, `private.k2_guard_protected_write` existen.
  - Triggers `trg_k2_guard_ingredients_insert_delete`, `trg_k2_guard_ingredients_units`, `trg_k2_guard_recipe_ingredients_insert_delete`, `trg_k2_guard_recipe_ingredients_unit` existen.
- Estado inicial de freeze: INACTIVE.
- Conteos iniciales:
  - `public.ingredients`: 226 filas.
  - `public.recipe_ingredients`: 362 filas.

## Ejecución del diagnóstico original

Se ejecutó exactamente `sql/diagnostics/k2/2026-08-10-write-freeze-k2.test.sql` contra la BD real. El output de la función devolvió:

- `A`: t
- `B`: t
- `C`: t
- `D`: t
- `E`: t
- `F`: t
- `G`: t
- `H`: t
- `I`: t
- `J_anon`: t
- `J_authenticated`: t

## Evidencia específica

A — PASS
- Evidencia: `UPDATE public.ingredients ...` se ejecutó con freeze inactivo y no falló.
- Comprobación: la suite completó A correctamente sin excepción de SQLSTATE.

B — PASS
- Evidencia: el update protegido en `public.ingredients.purchase_unit` fue rechazado con SQLSTATE `55006` durante un freeze activo.
- Comprobación: el bloque capturó la excepción esperada y continuó.

C — PASS
- Evidencia: el update protegido en `public.ingredients.unit_type` fue rechazado con SQLSTATE `55006` durante un freeze activo.
- Comprobación: el bloque capturó la excepción esperada y continuó.

D — PASS
- Evidencia: el update protegido en `public.recipe_ingredients.unit` fue rechazado con SQLSTATE `55006` durante un freeze activo.
- Comprobación: el bloque capturó la excepción esperada y continuó.

E — PASS
- Evidencia: las lecturas `count(*) FROM public.ingredients` y `count(*) FROM public.recipe_ingredients` se ejecutaron con freeze activo.
- Comprobación: el bloque no falló y la lectura fue permitida.

F — PASS
- Evidencia: secuencia `acquire freeze` → `authorize transaction` → `protected write` ejecutó con éxito.
- Comprobación: el update autorizado pasó y la transacción se cerró con rollback deliberado.

G — PASS
- Evidencia: `private.k2_authorize_transaction` con run_id inválido rechazó con SQLSTATE `42501`.
- Comprobación: la autorización no se puede forzar desde fuera del mecanismo privado previsto.

H — PASS
- Evidencia: intento de segunda adquisición de freeze en el mismo dominio fue rechazado con SQLSTATE `55006`.
- Comprobación: la segunda llamada no obtuvo autorización simultánea.

I — PASS
- Evidencia: un error deliberado tras `authorize transaction` provocó rollback; el estado final del freeze quedó inactivo.
- Comprobación: no quedó autorización activa y el freeze final es INACTIVE.

J — PASS
- Evidencia: ruta automática real de escritura en `public.ingredients` que ejecuta el trigger `trg_ingredients_pack_pricing_sync` fue bloqueada con SQLSTATE `55006` durante freeze activo.
- Comprobación: se utilizó un update sobre columnas activadoras de trigger automático y el write-freeze impidió la operación.

## Estado final

- Estado final de freeze: INACTIVE.
- Conteos finales:
  - `public.ingredients`: 226 filas.
  - `public.recipe_ingredients`: 362 filas.
- No se hicieron modificaciones permanentes en los datos porque todas las operaciones de prueba terminaron en rollback.

## Permisos y mecanismos

- El freeze se libera solo si está inactivo o mediante el mecanismo oficial `private.k2_release_domain_freeze`.
- Las pruebas se hicieron sin alterar el esquema ni el comportamiento del write-freeze.

## Conclusión de gate

- BD real utilizada: SÍ.
- Migración aplicada: SÍ.
- A-J: PASS.
- Datos funcionales modificados permanentemente: NO.
- Freeze final: INACTIVE.
- K2 ejecutada: NO.

### Gate write-freeze

- `GATE WRITE-FREEZE`: PASS

> El write-freeze K2 se validó en la BD real con evidencia de bloqueo de writes protegidos, permiso transaccional autorizado, rechazo de bypass, segunda adquisición rechazada, rollback seguro y estado final inactivo.

## Registro de validación técnica

- validate:corpus: PASS
- GATE WRITE-FREEZE: PASS
- K2: NOT EXECUTED
