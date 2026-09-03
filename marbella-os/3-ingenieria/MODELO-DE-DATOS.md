---
documento: MODELO-DE-DATOS
clase: vivo
estado: vigente
capa: ingenieria
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-07-29
caducidad: 6 meses
supersede: —
---

# MODELO DE DATOS — Qué guarda Marbella y quién manda sobre cada dato

Mapa de las entidades y, sobre todo, **de la autoridad**: para cada magnitud, qué tabla es la buena. No es un esquema exhaustivo; el esquema vive en `supabase/migrations/`. Este documento es la guía para no leer del sitio equivocado.

Verificado el 2026-07-29 contra `src/types/supabase.ts` y las migraciones.

---

## 1. Cifras y una advertencia

- **72 tablas tipadas**, 7 vistas, **107 funciones** de base de datos.
- **Al menos 16 tablas más existen en migraciones y no están en los tipos**: las siete del módulo de pabellón, las cinco de paridad de sombra, `payroll_import_runs`, `web_analytics_events`, `app_settings` y `schedule_day_notes`.

**Advertencia sobre los tipos.** Hay dos definiciones del esquema en el repositorio: la generada (`src/types/supabase.ts`, 72 tablas) y una escrita a mano (`src/types/index.ts`, 3 tablas). **Ninguna de las dos se importa en ningún fichero.** Todo el acceso a la base de datos es, por tanto, sin tipos: cada consulta devuelve un valor sin comprobación en compilación.

Esto convierte el modelo de datos en conocimiento puramente humano. **Un nombre de columna mal escrito no lo detecta el compilador, lo detecta el usuario.** Registrado como [D19](../5-estado/DEUDA.md).

Consecuencia práctica para este documento: **es la única defensa que existe contra un error de esquema.** Si se desactualiza, no hay red debajo.

---

## 2. Dominios

Las 72 tablas tipadas se agrupan en nueve dominios.

### Personas y jornada — 9 tablas

| Tabla | Autoridad sobre |
|---|---|
| `profiles` | Identidad, rol, datos personales |
| `time_logs` | El fichaje. Hecho primario, nunca derivado |
| `hours_contract_terms` | Condiciones de contrato con vigencia temporal |
| `profile_labor_cost_terms` | Coste laboral con vigencia temporal |
| `weekly_snapshots` | **Resultado del motor de horas.** Única lectura válida |
| `shifts` | Turnos planificados |
| `schedule_day_notes` | Notas libres por día y por usuario en el horario. Una por usuario y día |
| `weekly_closings_log` | Registro de cierres semanales |
| `employee_documents` | Documentos de la persona |

**La regla que gobierna este dominio:** `time_logs` es hecho, `weekly_snapshots` es resultado. Nada más produce horas. Ver [ADR-0001](../4-decisiones/ADR-0001-hours-engine-productor-unico.md).

#### La duplicación de condiciones laborales

`profiles` conserva columnas que las tablas con vigencia ya cubren: `contracted_hours_weekly`, `is_fixed_salary`, `prefer_stock_hours`, `monthly_cost`, `overtime_cost_per_hour`, `hours_balance`.

Las tablas versionadas —`hours_contract_terms` y `profile_labor_cost_terms`— existen precisamente porque **un cambio de contrato no debe reescribir el pasado**: al recalcular una semana de marzo hay que usar las condiciones de marzo, no las de hoy.

**Autoridad, en este orden:**

1. Para cualquier cálculo con fecha: las tablas con vigencia.
2. Las columnas de `profiles` son caché de la condición vigente hoy, no autoridad.
3. `profiles.hours_balance` es un espejo del último `weekly_snapshots.final_balance`. Si discrepan, manda `weekly_snapshots`.

**Leer una condición laboral desde `profiles` para calcular una semana pasada es un error silencioso**: el resultado sale plausible y equivocado. Es la trampa más peligrosa del esquema. Registrado como [D20](../5-estado/DEUDA.md).

### Coste y nómina — 4 tablas

| Tabla | Autoridad sobre |
|---|---|
| `payroll_monthly_totals` | Coste mensual real de empresa, por período |
| `payroll_import_runs` | Auditoría de cada importación (sin tipar) |
| `fixed_monthly_costs` | Costes fijos que no son personal |
| `nominas`, `nominas_excepciones` | Modelo anterior de nóminas |

El coste ordinario de un día **no se guarda**: se calcula prorrateando `total_company_cost` entre los días naturales del período. La fórmula está en [dominio/COSTE-LABORAL](./dominio/COSTE-LABORAL.md).

`nominas` y `employee_documents` cubren terreno solapado. Es duplicación heredada, [D17](../5-estado/DEUDA.md).

### Venta y punto de venta — 6 tablas

| Tabla | Autoridad sobre |
|---|---|
| `tickets_marbella` | Cabecera del ticket: importe, forma de pago, mesa, cierre |
| `ticket_lines_marbella` | Líneas del ticket: artículo, unidades, importe |
| `ventas_marbella` | Modelo anterior de ventas |
| `bdp_articulos`, `bdp_familias`, `bdp_departamentos` | Catálogo copiado del ERP |
| `bdp_cash_movements` | Movimientos de caja del ERP |

**Dos fechas por ticket, y no son intercambiables:** `fecha` es la fecha de negocio y `fecha_real` la del sistema. Un ticket cerrado a las tres de la madrugada pertenece al día anterior. Confundirlas desplaza la venta de un día.

Las tablas `bdp_*` son **copia de un sistema ajeno**. Se sobrescriben en cada sincronización; escribir en ellas no tiene efecto sobre el ERP.

`ventas_marbella` frente a `tickets_marbella` es duplicación heredada, [D17](../5-estado/DEUDA.md).

### Cocina y sala — 8 tablas

| Tabla | Autoridad sobre |
|---|---|
| `estado_sala` | Radiografía completa que envía el extractor |
| `kds_events` | Registro de sucesos, modelo actual |
| `kds_projection_orders`, `kds_projection_lines` | Proyección derivada de los sucesos |
| `kds_orders`, `kds_order_lines` | Modelo anterior |
| `kds_ticket_state` | Estado por ticket |
| `comandero_events` | Sucesos del comandero |

**Cuatro modelos de cocina conviven.** El vigente es el de sucesos más proyección. Los otros son capas anteriores no retiradas. Antes de tocar cocina hay que saber en qué modelo se está. Registrado como [D18](../5-estado/DEUDA.md).

`estado_sala` guarda un documento completo en `radiografia_completa`. No es normalizado a propósito: es la copia literal de lo que envía el extractor, y sirve como registro de lo recibido.

### Cocina de datos: carta, recetas, existencias — 11 tablas

`recipes`, `recipe_ingredients`, `ingredients`, `ingredient_price_history`, `categories`, `stock_movements`, `map_tpv_receta`, `digital_menu_overrides`, `menu_category_overrides`, `carta_editors`, `carta_ui_labels`.

- `ingredients.current_price` es el precio vigente; `ingredient_price_history`, su histórico.
- `map_tpv_receta` une el artículo del punto de venta con la receta. **Sin este puente no hay descuento de existencias ni margen por producto.**
- Las tablas de anulación permiten que la carta pública muestre algo distinto del dato interno sin duplicar la receta.

### Compras — 7 tablas

`suppliers`, `supplier_item_mappings`, `purchase_invoices`, `purchase_invoice_lines`, `purchase_invoice_attachments`, `purchase_orders`, `purchase_order_items`.

Detalle del cálculo en [dominio/PRECIOS-Y-COMPRAS](./dominio/PRECIOS-Y-COMPRAS.md).

### Caja y tesorería — 8 tablas

`cash_boxes`, `cash_box_inventory`, `cash_closings`, `denominations_log`, `treasury_log`, `manager_ledger`, `tip_pools`, `tip_pool_overrides` y las tablas de reparto de propina.

`manager_ledger` es el libro de movimientos del responsable. **Es la tabla con el control de acceso más débil del sistema**, ver [SEGURIDAD](./SEGURIDAD.md).

### Eventos y reservas — 7 tablas

`events`, `event_orders`, `event_products`, `event_default_pack`, `reservations`, `pavilion_activity_sheets` y las siete tablas sin tipar del módulo de pabellón.

Los encargos de cliente se editan **con un identificador en el enlace, sin sesión**. Es una decisión deliberada de producto: el cliente no tiene cuenta. Sus implicaciones están en [SEGURIDAD](./SEGURIDAD.md).

### Sistema — 9 tablas

`user_notifications`, `push_subscriptions`, `app_usage_events`, `import_runs`, `order_drafts`, `ai_chat_sessions`, `ai_chat_messages`, `ai_call_logs`, `staff_consumption_register_errors`.

`staff_consumption_register_errors` merece atención: **guarda los fallos en vez de descartarlos**. Es el patrón correcto, y el único sitio del sistema donde se aplica de forma explícita.

---

## 3. Vistas

| Vista | Para qué |
|---|---|
| `view_daily_hours_breakdown` | Desglose diario de horas |
| `view_daily_accumulated` | Acumulado diario |
| `view_payable_overtime` | Horas extra pendientes de pago |
| `v_treasury_movements_balance` | Movimientos con saldo corrido |
| `v_manager_ledger_with_running` | Libro con saldo corrido |
| `v_public_menu_items`, `v_digital_menu_items` | Carta ya resuelta con anulaciones |

Una vista **no es autoridad**, es una forma de leer. Si una vista contradice a su tabla de origen, la vista está mal.

---

## 4. Las 107 funciones

Se agrupan en cuatro familias con propósitos muy distintos:

| Familia | Ejemplos | Naturaleza |
|---|---|---|
| Lectura agregada | `get_daily_sales_chart`, `get_financial_statement` | Consulta compleja empaquetada |
| Escritura transaccional | `process_staff_consumption`, `process_cash_exchange` | Varias escrituras que deben ir juntas |
| Cálculo de dominio | `fn_worker_hourly_rate`, `fn_recipe_line_cost` | **Regla de negocio dentro de Postgres** |
| Mantenimiento | `rpc_recalculate_all_balances_from_week` | Operación masiva |

**La tercera familia es la problemática.** Hay reglas de negocio implementadas en Postgres que también existen en TypeScript. El coste de receta se calcula en los dos sitios. Las tarifas laborales tienen función en base de datos y equivalente en el motor.

**Criterio de autoridad cuando hay duplicación:** manda el motor en TypeScript, porque es el que tiene pruebas. Las funciones equivalentes en base de datos son atajos de consulta y deben dar el mismo resultado. Si discrepan, la función está mal.

Este criterio no está garantizado por nada automático. Es deuda: [D21](../5-estado/DEUDA.md).

---

## 5. Reglas del esquema

1. **Un hecho no se sobrescribe.** Un fichaje se corrige creando la corrección, no borrando el original.
2. **Un resultado siempre se puede regenerar.** Si borrar `weekly_snapshots` pierde información, es que se estaba usando como hecho.
3. **Condiciones laborales, con vigencia.** Nunca reescribir la condición: cerrar la anterior y abrir la nueva.
4. **Dos fechas cuando el negocio no coincide con el reloj.** Fecha de negocio y fecha real, siempre separadas.
5. **Una tabla nueva nace con política de acceso.** Sin excepción, ver [SEGURIDAD](./SEGURIDAD.md).
6. **Un importe es numérico**, nunca coma flotante.

---

## 6. Cómo se cambia el esquema

- Toda modificación es una migración en `supabase/migrations/`, con nombre `AAAAMMDDHHMMSS_descripcion.sql`.
- **Una migración no se edita después de aplicarse.** Se corrige con otra.
- Debe incluir la política de acceso de las tablas que crea.
- Los tipos generados deberían regenerarse, pero **hoy no sirven de nada porque nadie los importa**. Volverán a importar cuando se pague [D19](../5-estado/DEUDA.md).
- Si el cambio afecta a una magnitud de negocio, además hay que actualizar el documento de [dominio](./dominio/README.md) correspondiente.

**No hay entorno de pruebas.** Cada migración se aplica contra la base de datos real. Es la razón por la que una migración destructiva es inaceptable aquí, y no solo una mala práctica.
