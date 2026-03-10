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
