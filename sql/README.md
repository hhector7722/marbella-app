# SQL de apoyo

**Esto no son migraciones.** Las migraciones viven en [`supabase/migrations/`](../supabase/migrations/README_MIGRACIONES.md) y son las únicas que definen el esquema.

Aquí hay consultas que se ejecutaron una vez o que se ejecutan a mano cuando hace falta comprobar algo.

| Carpeta | Contenido |
|---|---|
| `diagnostics/` | Verificaciones y recuperaciones puntuales: comprobar ventas de un día, recuperar un hueco de datos |
| raíz de `sql/` | Material histórico: arreglos aplicados a mano y borradores anteriores a la disciplina de migraciones |

## Reglas

- **Nada de aquí se aplica automáticamente.** Si un cambio debe estar en producción, es una migración.
- **Un archivo de aquí no describe el esquema actual.** Varios son de hace meses y ya no se corresponden con nada.
- Si necesitas saber cómo está el esquema, consúltalo en la base de datos, no aquí.

## Por qué existe

Buena parte de estos archivos son de antes de que el proyecto tuviera migraciones versionadas. Se conservan porque documentan qué se ejecutó, pero **no tienen autoridad sobre nada**.
