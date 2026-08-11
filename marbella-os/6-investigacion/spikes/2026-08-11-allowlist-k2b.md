---
documento: SPIKE-ALLOWLIST-K2B
clase: inmutable
estado: archivado
capa: investigacion
normativo: false
precedencia: 0
responsable: propiedad del producto
fechado: 2026-08-11
caducidad: no aplica
supersede: —
depende_de: CANON, GLOSARIO, MODELO-DE-DATOS, ARQUITECTURA, PROTOCOLO-AGENTES
---

# Allowlist K2b

> **MATERIAL NO NORMATIVO — SPIKE-ALLOWLIST-K2B**
>
> Artefacto documental generado desde la allowlist JSON. No ejecuta K2b ni modifica datos.

## A. Objetivo

La allowlist es un conjunto cerrado de 71 operaciones explícitas. K2b no recalcula aliases ni conversiones durante la escritura.

## B. Fuente

- Source of truth: `sql/diagnostics/k2/2026-08-11-k2b-allowlist.json`.
- Diccionario: `marbella-os/6-investigacion/spikes/2026-08-11-diccionario-normalizacion-k2b-cierre.md`.
- Snapshot: `sql/diagnostics/k2/2026-08-10-k2-snapshot-37f7157a.json`.

## C. Scope

Solo `public.ingredients.purchase_unit`, `public.ingredients.unit_type` y `public.recipe_ingredients.unit`. No incluye precios, cantidades, packs, presentations, mappings ni stock.

## D. Counts

```text
candidate_rows = 40
candidate_cells = 71
allowlist_operations = 71
```

| Tabla | Filas | Operaciones |
|---|---:|---:|
| `public.ingredients` | 31 | 62 |
| `public.recipe_ingredients` | 9 | 9 |

| Tabla | Columna | Operaciones |
|---|---|---:|
| `public.ingredients` | `purchase_unit` | 31 |
| `public.ingredients` | `unit_type` | 31 |
| `public.recipe_ingredients` | `unit` | 9 |

## E. Checksum

```text
ALLOWLIST_VERSION = k2b-allowlist-v1
ALLOWLIST_CHECKSUM = 999f93c0b071fbc05f08bdd05f5797ef85be79020184f0eaf0e8d62a1374b0b4
```

## F. Operaciones

| # | Tabla | PK | Columna | Before | Expected | Regla | Evidencia |
|---:|---|---|---|---|---|---|---|
| 1 | public.ingredients | 0fce07d0-7f1e-4cb6-b0ab-8d60b06d68f8 | purchase_unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; ingredients.purchase_unit |
| 2 | public.ingredients | 0fce07d0-7f1e-4cb6-b0ab-8d60b06d68f8 | unit_type | u | ud | u_to_ud | diccionario K2b cierre: alias textual de conteo; ingredients.unit_type |
| 3 | public.ingredients | 22b7a22b-2ef3-4433-8bc7-086b894439b2 | purchase_unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; ingredients.purchase_unit |
| 4 | public.ingredients | 22b7a22b-2ef3-4433-8bc7-086b894439b2 | unit_type | unitat | ud | unitat_to_ud | diccionario K2b cierre: alias textual de conteo; ingredients.unit_type |
| 5 | public.ingredients | 23195cc0-7c54-4aeb-8ef8-d44c83257f25 | purchase_unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; ingredients.purchase_unit |
| 6 | public.ingredients | 23195cc0-7c54-4aeb-8ef8-d44c83257f25 | unit_type | u | ud | u_to_ud | diccionario K2b cierre: alias textual de conteo; ingredients.unit_type |
| 7 | public.ingredients | 234f1233-f7fa-43ed-976b-c9aef6029c7c | purchase_unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; ingredients.purchase_unit |
| 8 | public.ingredients | 234f1233-f7fa-43ed-976b-c9aef6029c7c | unit_type | u | ud | u_to_ud | diccionario K2b cierre: alias textual de conteo; ingredients.unit_type |
| 9 | public.ingredients | 2c2bcd41-cb58-419c-816f-4964b40a988b | purchase_unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; ingredients.purchase_unit |
| 10 | public.ingredients | 2c2bcd41-cb58-419c-816f-4964b40a988b | unit_type | u | ud | u_to_ud | diccionario K2b cierre: alias textual de conteo; ingredients.unit_type |
| 11 | public.ingredients | 3161d801-c778-49c5-92b1-1671770468bb | purchase_unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; ingredients.purchase_unit |
| 12 | public.ingredients | 3161d801-c778-49c5-92b1-1671770468bb | unit_type | u | ud | u_to_ud | diccionario K2b cierre: alias textual de conteo; ingredients.unit_type |
| 13 | public.ingredients | 381be8b7-eb35-4726-8bd0-5b79c01fede0 | purchase_unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; ingredients.purchase_unit |
| 14 | public.ingredients | 381be8b7-eb35-4726-8bd0-5b79c01fede0 | unit_type | u | ud | u_to_ud | diccionario K2b cierre: alias textual de conteo; ingredients.unit_type |
| 15 | public.ingredients | 489d4104-7b77-4644-874c-f17a4b20fb68 | purchase_unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; ingredients.purchase_unit |
| 16 | public.ingredients | 489d4104-7b77-4644-874c-f17a4b20fb68 | unit_type | u | ud | u_to_ud | diccionario K2b cierre: alias textual de conteo; ingredients.unit_type |
| 17 | public.ingredients | 537b5e26-3938-4f1f-a862-f8191cdcd341 | purchase_unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; ingredients.purchase_unit |
| 18 | public.ingredients | 537b5e26-3938-4f1f-a862-f8191cdcd341 | unit_type | u | ud | u_to_ud | diccionario K2b cierre: alias textual de conteo; ingredients.unit_type |
| 19 | public.ingredients | 565591eb-8ed2-47a4-82b6-85ee10293219 | purchase_unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; ingredients.purchase_unit |
| 20 | public.ingredients | 565591eb-8ed2-47a4-82b6-85ee10293219 | unit_type | u | ud | u_to_ud | diccionario K2b cierre: alias textual de conteo; ingredients.unit_type |
| 21 | public.ingredients | 63208d3a-91bd-4e3f-ba74-9a971229ce9c | purchase_unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; ingredients.purchase_unit |
| 22 | public.ingredients | 63208d3a-91bd-4e3f-ba74-9a971229ce9c | unit_type | u | ud | u_to_ud | diccionario K2b cierre: alias textual de conteo; ingredients.unit_type |
| 23 | public.ingredients | 69bce9f5-d406-43eb-bf10-da81cd5943d1 | purchase_unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; ingredients.purchase_unit |
| 24 | public.ingredients | 69bce9f5-d406-43eb-bf10-da81cd5943d1 | unit_type | u | ud | u_to_ud | diccionario K2b cierre: alias textual de conteo; ingredients.unit_type |
| 25 | public.ingredients | 7c38b97d-914f-4506-a038-7155fce8ae3c | purchase_unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; ingredients.purchase_unit |
| 26 | public.ingredients | 7c38b97d-914f-4506-a038-7155fce8ae3c | unit_type | u | ud | u_to_ud | diccionario K2b cierre: alias textual de conteo; ingredients.unit_type |
| 27 | public.ingredients | 83c2d9dd-fd24-4657-9f54-f1fe38d1e80f | purchase_unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; ingredients.purchase_unit |
| 28 | public.ingredients | 83c2d9dd-fd24-4657-9f54-f1fe38d1e80f | unit_type | u | ud | u_to_ud | diccionario K2b cierre: alias textual de conteo; ingredients.unit_type |
| 29 | public.ingredients | 888096ca-9379-49c8-a8ff-5c63f93dd9e3 | purchase_unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; ingredients.purchase_unit |
| 30 | public.ingredients | 888096ca-9379-49c8-a8ff-5c63f93dd9e3 | unit_type | u | ud | u_to_ud | diccionario K2b cierre: alias textual de conteo; ingredients.unit_type |
| 31 | public.ingredients | 9ec81f74-2fc9-4c4b-b8b4-9df3ae783a8c | purchase_unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; ingredients.purchase_unit |
| 32 | public.ingredients | 9ec81f74-2fc9-4c4b-b8b4-9df3ae783a8c | unit_type | u | ud | u_to_ud | diccionario K2b cierre: alias textual de conteo; ingredients.unit_type |
| 33 | public.ingredients | a3f2f1c0-e667-4573-bc7b-ff887e67eeae | purchase_unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; ingredients.purchase_unit |
| 34 | public.ingredients | a3f2f1c0-e667-4573-bc7b-ff887e67eeae | unit_type | u | ud | u_to_ud | diccionario K2b cierre: alias textual de conteo; ingredients.unit_type |
| 35 | public.ingredients | a593e221-21c8-4820-b22c-a3aca7253629 | purchase_unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; ingredients.purchase_unit |
| 36 | public.ingredients | a593e221-21c8-4820-b22c-a3aca7253629 | unit_type | u | ud | u_to_ud | diccionario K2b cierre: alias textual de conteo; ingredients.unit_type |
| 37 | public.ingredients | a8e4985d-4f8c-4e29-b04a-fff359897291 | purchase_unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; ingredients.purchase_unit |
| 38 | public.ingredients | a8e4985d-4f8c-4e29-b04a-fff359897291 | unit_type | u | ud | u_to_ud | diccionario K2b cierre: alias textual de conteo; ingredients.unit_type |
| 39 | public.ingredients | b13b0416-4601-442b-8be8-e55004851e71 | purchase_unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; ingredients.purchase_unit |
| 40 | public.ingredients | b13b0416-4601-442b-8be8-e55004851e71 | unit_type | u | ud | u_to_ud | diccionario K2b cierre: alias textual de conteo; ingredients.unit_type |
| 41 | public.ingredients | b48ea353-4f01-4b44-83c6-8deb22faf32f | purchase_unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; ingredients.purchase_unit |
| 42 | public.ingredients | b48ea353-4f01-4b44-83c6-8deb22faf32f | unit_type | u | ud | u_to_ud | diccionario K2b cierre: alias textual de conteo; ingredients.unit_type |
| 43 | public.ingredients | ba1e1e0c-f17b-4c36-a466-6be70ddc6508 | purchase_unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; ingredients.purchase_unit |
| 44 | public.ingredients | ba1e1e0c-f17b-4c36-a466-6be70ddc6508 | unit_type | u | ud | u_to_ud | diccionario K2b cierre: alias textual de conteo; ingredients.unit_type |
| 45 | public.ingredients | ca14ee93-b636-49fe-8faf-f5667082adc2 | purchase_unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; ingredients.purchase_unit |
| 46 | public.ingredients | ca14ee93-b636-49fe-8faf-f5667082adc2 | unit_type | u | ud | u_to_ud | diccionario K2b cierre: alias textual de conteo; ingredients.unit_type |
| 47 | public.ingredients | d3b90c3c-8c0b-407a-b674-5e4a451753d1 | purchase_unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; ingredients.purchase_unit |
| 48 | public.ingredients | d3b90c3c-8c0b-407a-b674-5e4a451753d1 | unit_type | u | ud | u_to_ud | diccionario K2b cierre: alias textual de conteo; ingredients.unit_type |
| 49 | public.ingredients | d58e8291-2b2d-4479-a8c2-59b165a099bb | purchase_unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; ingredients.purchase_unit |
| 50 | public.ingredients | d58e8291-2b2d-4479-a8c2-59b165a099bb | unit_type | u | ud | u_to_ud | diccionario K2b cierre: alias textual de conteo; ingredients.unit_type |
| 51 | public.ingredients | dee2d9f2-8d11-457a-bf22-3afeb8b3ac71 | purchase_unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; ingredients.purchase_unit |
| 52 | public.ingredients | dee2d9f2-8d11-457a-bf22-3afeb8b3ac71 | unit_type | u | ud | u_to_ud | diccionario K2b cierre: alias textual de conteo; ingredients.unit_type |
| 53 | public.ingredients | e36f1d9f-42f9-485c-9ecf-8175b1b78dd9 | purchase_unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; ingredients.purchase_unit |
| 54 | public.ingredients | e36f1d9f-42f9-485c-9ecf-8175b1b78dd9 | unit_type | u | ud | u_to_ud | diccionario K2b cierre: alias textual de conteo; ingredients.unit_type |
| 55 | public.ingredients | f06f6d44-d597-48fe-98ab-97ec53ea6dbe | purchase_unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; ingredients.purchase_unit |
| 56 | public.ingredients | f06f6d44-d597-48fe-98ab-97ec53ea6dbe | unit_type | u | ud | u_to_ud | diccionario K2b cierre: alias textual de conteo; ingredients.unit_type |
| 57 | public.ingredients | f2bb4d7d-bf93-402e-855d-83daafbabb98 | purchase_unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; ingredients.purchase_unit |
| 58 | public.ingredients | f2bb4d7d-bf93-402e-855d-83daafbabb98 | unit_type | u | ud | u_to_ud | diccionario K2b cierre: alias textual de conteo; ingredients.unit_type |
| 59 | public.ingredients | fb318925-2b5b-4e92-8562-6d573c2b4ad5 | purchase_unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; ingredients.purchase_unit |
| 60 | public.ingredients | fb318925-2b5b-4e92-8562-6d573c2b4ad5 | unit_type | u | ud | u_to_ud | diccionario K2b cierre: alias textual de conteo; ingredients.unit_type |
| 61 | public.ingredients | fe056cd1-ea97-449c-918c-7d6e08b42622 | purchase_unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; ingredients.purchase_unit |
| 62 | public.ingredients | fe056cd1-ea97-449c-918c-7d6e08b42622 | unit_type | u | ud | u_to_ud | diccionario K2b cierre: alias textual de conteo; ingredients.unit_type |
| 63 | public.recipe_ingredients | 0ef829a6-ff48-4857-9cc5-eb509df6677e | unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; recipe_ingredients.unit |
| 64 | public.recipe_ingredients | 1851860b-c6ce-4666-8df0-f9911facb177 | unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; recipe_ingredients.unit |
| 65 | public.recipe_ingredients | 2203e3c3-e31f-49ae-adc9-90af90f39502 | unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; recipe_ingredients.unit |
| 66 | public.recipe_ingredients | 22197a98-760a-482b-9969-bb7b5f63d970 | unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; recipe_ingredients.unit |
| 67 | public.recipe_ingredients | 31367ec7-0958-4a16-95c7-a8893cd83c73 | unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; recipe_ingredients.unit |
| 68 | public.recipe_ingredients | 46fa5522-bf88-456f-8232-7f65a4fba8c4 | unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; recipe_ingredients.unit |
| 69 | public.recipe_ingredients | 4e48e103-5304-4742-874e-1d83488a416f | unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; recipe_ingredients.unit |
| 70 | public.recipe_ingredients | 5f4b44fd-2284-4d70-96ec-ac26fda1745e | unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; recipe_ingredients.unit |
| 71 | public.recipe_ingredients | c6075a31-68b2-49e3-b212-2621ab396e09 | unit | u | ud | u_to_ud | diccionario K2b cierre: u→ud; recipe_ingredients.unit |

## G. Protección drift

Antes de escribir, la BD debe coincidir con cada `before_value`, el snapshot y el checksum aprobado. Cualquier diferencia bloquea K2b. Después, cada valor debe coincidir con `expected_value`; de lo contrario, rollback.

## H. Validación

- 40 filas → 71 operaciones: PASS.
- Duplicados `table+pk+column`: 0.
- PK ausente: 0.
- Before ausente: 0.
- Expected ausente: 0.
- Target no canónico: 0.
- Dimensional/presentation/ambiguous: 0.
- Checksum reproducible: PASS.
- Tests A-J: PASS.

## I. Inmutabilidad

Este JSON es la única fuente ejecutable. No se modifica durante una ejecución. Cambiar una operación, before, expected o el orden invalida el checksum.

## J. Gate final

```text
ALLOWLIST = READY
K2b = NO EJECUTADA
DATOS MODIFICADOS = NO
FREEZE = INACTIVE
```
