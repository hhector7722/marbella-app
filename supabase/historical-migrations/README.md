# Fuentes históricas excluidas del ejecutor de migraciones

Este directorio conserva, sin modificación, fuentes SQL que no son migraciones
desplegables contra la producción actual. No forma parte de
`supabase/migrations/`, por lo que `supabase db push` no las considera.

| Fuente original | SHA-256 al auditar | Clasificación | Decisión |
| --- | --- | --- | --- |
| `20260220000000_initial_schema.sql` | `ec787329c668ea63494f0309aeecef6336daf95158752766e1365e4da2640e3f` | D — obsoleta/peligrosa | Es un volcado de esquema añadido al repositorio el 2026-08-11 con timestamp de febrero. El historial remoto comienza el 2026-02-21 y no contiene esta versión. Su ejecución hoy intenta recrear objetos, constraints, políticas y grants históricos; contradice, entre otros, el endurecimiento K1. Se conserva como evidencia, pero no se registra como aplicada ni se ejecutará. |
| `20260812020000_rpc_persist_document_evidence.sql` | `5c8b61b51c6e9b1debd22332604dd50631189c20f8b92be43d318b4356ea06bc` | B — sustituida | Define la primera versión de `persist_document_evidence`. La versión aplicada de K3 (`20260913230020_k3_docling_evidence_queue`) conserva la firma pero sustituye por completo su semántica: autorización, idempotencia por documento+versión+extractor y `search_path` seguro. No hay evidencia suficiente para afirmar que la v1 se aplicó históricamente, por lo que no se falsifica el historial con `migration repair`. |
| `20260908150000_suppliers_add_fields.sql` | `c9be8cd831fb7fbe8ecf3695b037eef1bca0e4697f94ce79fe8060bdb6997657` | D — obsoleta/peligrosa | Pretendía elevar ocho campos desde `notes`, pero reducía el plazo a `time`, el mínimo a `numeric` y forzaba `reliability` de texto a entero. En producción existen literales incompatibles como «Lunes o martes», «5 cajas» y `Alta`; aplicarla perdería información. La sustituye `20260914210304_suppliers_normalize_operational_fields.sql`, que preserva los valores completos y proyecta la puntuación sólo cuando es segura. |

La fuente de proveedores queda fuera de `supabase/migrations/` para que nunca
pueda volver a ejecutarse. Su sucesora permanece en el directorio ejecutable y
es la única vía de normalización compatible con los datos reales.
