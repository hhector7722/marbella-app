# Migraciones Supabase: por qué falla "duplicate key" y cómo evitarlo

## Qué pasó

Al ejecutar `supabase db push --include-all` apareció:

```text
ERROR: duplicate key value violates unique constraint "schema_migrations_pkey"
Key (version)=(20260302) already exists.
```

Supabase guarda cada migración aplicada en la tabla `supabase_migrations.schema_migrations`. La **versión** que usa como clave primaria es **el prefijo numérico del nombre del fichero** (todo lo que hay antes del primer `_`).

Si dos migraciones comparten el mismo prefijo, la segunda intenta hacer `INSERT` con la misma `version` → **duplicate key** y el push se corta.

## Conflictos que había en este proyecto (resueltos)

Se renombraron los ficheros que compartían prefijo para que cada uno tenga versión única (14 dígitos):

| Antes | Después |
|-------|---------|
| `20260302_manager_ledger.sql` | `20260302120000_manager_ledger.sql` |
| `20260302_manager_ledger_mutations.sql` | `20260302120001_manager_ledger_mutations.sql` |
| `20260302_manager_ledger_unified.sql` | `20260302120002_manager_ledger_unified.sql` |
| `20260310_time_logs_clock_out_show_no_registrada.sql` | `20260310120000_time_logs_clock_out_show_no_registrada.sql` |
| `20260310_fix_get_hourly_sales_parse_space_datetime.sql` | `20260310120001_fix_get_hourly_sales_parse_space_datetime.sql` |
| `20260310_tip_pools_and_overrides.sql` | `20260310143000_tip_pools_and_overrides.sql` |

Solo puede existir **una fila por versión** en `schema_migrations`. Con estos nombres ya no hay duplicados.

## Convención recomendada por Supabase

Cada migración debe tener un **identificador único**. La convención oficial es:

```text
YYYYMMDDHHMMSS_descripcion.sql
```

Es decir, **fecha + hora** (14 dígitos), por ejemplo:

- `20260310143000_tip_pools_and_overrides.sql`
- `20260310143001_otra_migracion.sql`

Así nunca se repite la "version" y no hay conflictos.

## Cómo solucionarlo

### Opción A: Renombrar migraciones locales (para el futuro)

1. Dar a cada fichero un prefijo único con hora (14 dígitos), por ejemplo:
   - `20260302_manager_ledger.sql` → `20260302120000_manager_ledger.sql`
   - `20260302_manager_ledger_mutations.sql` → `20260302120001_manager_ledger_mutations.sql`
   - `20260302_manager_ledger_unified.sql` → `20260302120002_manager_ledger_unified.sql`
   - Y lo mismo para las que comparten `20260310`.

2. **Importante:** En la base remota ya aplicada, las versiones viejas (p. ej. `20260302`) pueden estar registradas. Si renombras y haces push, las nuevas versiones (p. ej. `20260302120001`) se tratarán como migraciones nuevas. Si en remoto ya aplicaste a mano el contenido de alguna, puede haber diferencias; en ese caso conviene no volver a aplicar ese contenido y solo usar nombres únicos para lo que aún no está aplicado.

### Opción B: No depender del orden de aplicado en remoto

Si en remoto ya tienes aplicadas migraciones a mano (por ejemplo desde el SQL Editor):

- Las que ya están aplicadas **no** deben volver a ejecutarse con el CLI.
- Para las que faltan, puedes:
  - Ejecutarlas a mano en el SQL Editor (como la de propinas), o
  - Renombrar solo esas migraciones pendientes a un timestamp único nuevo (p. ej. `20260315120000_tip_pools_and_overrides.sql`) y hacer `db push` para que el CLI las marque y ejecute sin chocar con versiones ya existentes.

### Para no repetir el problema

- **Siempre** usar prefijo de 14 dígitos al crear una migración nueva, por ejemplo:
  ```bash
  # Crear migración con timestamp único (Supabase lo puede generar)
  npx supabase migration new nombre_descriptivo
  ```
  Eso genera un fichero con nombre tipo `YYYYMMDDHHMMSS_nombre_descriptivo.sql`.

- O nombrar a mano: `YYYYMMDDHHMMSS_descripcion.sql`, comprobando que ese prefijo no exista ya en `supabase/migrations/`.

Resumen: el fallo viene de **varias migraciones con el mismo prefijo (version)**. La solución es **un prefijo distinto por migración**; la forma más segura es usar fecha+hora en 14 dígitos.

---

## Error: "Remote migration versions not found in local migrations directory"

Si al hacer `npx supabase db push` aparece que **en remoto hay versiones que ya no existen en tu carpeta local** (por ejemplo porque en remoto quedaron los prefijos antiguos `20260302`, `20260310`, `20260315` y localmente los renombraste a `20260302120000`, etc.):

1. **Reparar el historial** (marca esas versiones remotas como "revertidas" para que el CLI no espere encontrarlas localmente):
   ```bash
   npx supabase migration repair --status reverted 20260302 20260310 20260315
   ```
   (Sustituye por las versiones que te indique el mensaje de error.)

2. **Opcional:** Sincronizar esquema remoto a local:
   ```bash
   npx supabase db pull
   ```

3. Vuelve a intentar:
   ```bash
   npx supabase db push
   ```

**Alternativa:** Si prefieres no tocar el historial, puedes aplicar las migraciones nuevas **a mano** desde el **SQL Editor** del dashboard de Supabase (copiar el contenido del `.sql` y ejecutarlo).

---

## Error EPERM al usar `npx supabase` (Windows)

Si ves avisos de **npm warn cleanup** y **EPERM: operation not permitted** al hacer `npx supabase db push`, es un problema de **permisos de la caché de npm** en Windows, no del comando en sí. El `db push` puede haber terminado bien.

Opciones:

- **Ignorar el aviso** si el push terminó correctamente.
- **Instalar Supabase CLI globalmente** para no depender de npx:
  ```bash
  npm install -g supabase
  supabase db push
  ```
- Cerrar VS Code / otros procesos que usen Node y volver a intentar, o ejecutar el terminal **como administrador** una vez para que npm pueda limpiar la caché.

---

## 20261003164640 · Evidencia Mistral en sombra

`20261003164640_mistral_shadow_evidence.sql` añade únicamente
`document_shadow_extractions`: versiones append-only de la respuesta OCR cruda,
observación canónica y métricas para comparar albaranes reales sin modificar
líneas, movimientos, precios ni confirmaciones. La tabla nace con RLS y sin
permisos para `anon` o `authenticated`; solo `service_role` puede insertar y
leer. Un trigger rechaza modificaciones y borrados. Se verifica con el esquema,
los privilegios, el trigger y los recuentos económicos antes y después del
benchmark. No se revierte eliminando la tabla una vez que contiene evidencia.

## 20261003172325–20261003174839 · Cola y recepción Mistral

`20261003172325_mistral_durable_queue.sql` separa leases Docling y Mistral, añade
backoff y límite de tres intentos e indexa las propuestas versionadas. El
estado operativo es mutable; los eventos y la evidencia siguen append-only.

`20261003173324_mistral_processor_schedule.sql` despierta al procesador de
Vercel cada dos minutos mediante `pg_cron` y un secreto de Vault provisionado
fuera de Git. No concede ejecución a `anon` ni a `authenticated`.

`20261003173751_mistral_k4_delegate.sql` añadió la procedencia Mistral al
delegado de servicio K4; `20261003173850_mistral_k4_array_guard_fix.sql` corrigió
el tipo real `text[]` de razones y advertencias. Son dos pasos históricos y se
conservan ambos para reproducir la secuencia aplicada. La vista previa real
descubrió la precisión de cuatro decimales de `purchase_invoice_lines.unit_price`;
`20261003174058_mistral_k4_v2_precision.sql` admitió la propuesta ajustada y
`20261003174839_mistral_k4_v3_aliases.sql` acotó el delegado a la versión con
alias derivados y añadió su índice único por fila. Ninguna migración reescribe
stock, precios, recepciones o extracciones previas. Tras cada paso se verificó
la versión aplicada y la ausencia de permisos `anon`/`authenticated` sobre las
funciones internas.

`20261003180530_mistral_scanner_page_count.sql` añade `expected_pages` con
valor histórico de una hoja y obliga a que la captura nueva declare el número
antes de su primer job. `20261003180658_k4_attachment_evidence_hash.sql` permite
la huella de un adjunto solo si está vinculada al mismo albarán; conserva las
demás comprobaciones de K4. Se verificaron la columna real y la definición de
la función aplicada. Ninguna de las dos migraciones toca el ledger.
