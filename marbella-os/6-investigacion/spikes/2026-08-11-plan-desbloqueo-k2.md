---
documento: SPIKE-PLAN-DESBLOQUEO-K2
clase: inmutable
estado: archivado
capa: investigacion
normativo: false
precedencia: 0
responsable: propiedad del producto
fechado: 2026-08-11
caducidad: no aplica
supersede: —
depende_de: CANON, GLOSARIO, MODELO-DE-DATOS, DOMINIO-PRECIOS-Y-COMPRAS, ARQUITECTURA, DEUDA, PROTOCOLO-AGENTES
---

# Plan de desbloqueo K2

> **MATERIAL NO NORMATIVO — SPIKE-PLAN-DESBLOQUEO-K2**
>
> Plan de diseño posterior al dry-run K2. No implementa resoluciones, no crea migraciones, no modifica datos, no modifica writers y no ejecuta K2. Usa el modelo canónico y el DAG K1-K12 ya cerrados.

**BD examinada:** Supabase real `feqjbwxkelpgzsdiphei`  
**Freeze final del análisis:** `INACTIVE`  
**Snapshot drift:** `0`  
**K2:** no ejecutada.

## A. Estado actual

El dry-run analizó 588 filas y dejó ocho bloqueos críticos:

- 216 mappings sin presentación/contenido estructurado;
- fallback legacy `conversion_factor=1` sin unidad de línea;
- 14 líneas de receta con incompatibilidad de dimensiones;
- Coca-Cola sin composición de caja verificable;
- Leche avena con precio actual incompatible con su pack;
- precio e histórico sin unidad de referencia explícita;
- coste desconocido silenciado como `0`;
- 13 writers legacy activos sobre las columnas protegidas.

El working tree ya tenía cambios ajenos en `playground/sandbox` y derivados generados. No se tocaron. Este documento no sobrescribe los spikes anteriores.

### A.1 Aclaración sobre los 14 resolubles

“Resoluble” significa que puede llegar a resolverse aportando datos o una decisión humana. No significa que pueda resolverse automáticamente con la BD actual.

- 7 líneas de bebidas son resolubles mediante dato de proveedor/presentación.
- 7 líneas de alimentos requieren revisión humana de la semántica de receta o de la presentación.
- 0 líneas son resolubles automáticamente sin evidencia nueva.

## B. Los 8 bloqueos

| ID | Bloqueo | Evidencia | Casos afectados | Severidad | Dependencias |
|---|---|---|---:|---|---|
| B1 | Mappings sin contenido de presentación | 216 filas; 133 productos; 13 proveedores; `line_content_qty/unit` ausentes | 216 | crítica | R1, R2, K3, K8b |
| B2 | Fallback de unidad/factor implícito | Las 216 filas tienen `line_billing_unit` nulo y `conversion_factor=1`; SQL usa fallback 1 | 216 | crítica | R1, R8, K4/K6 |
| B3 | Recetas incompatibles | 14 líneas F en 13 productos y 8 recetas | 14 | crítica | R3, K2b, K8b |
| B4 | Coca-Cola sin presentación verificable | 2 productos; líneas `caja`, `l`, `ud` y nulas; mapping sin contenido | 2 productos | crítica | R2, R5, K3, K9 |
| B5 | Pack de Leche avena incoherente | `9,60 €`, `6 × 1 L`, `current_price=9,60 €/L`; derivado esperado `1,60 €/L` | 1 producto | alta | R2, R5, K8b, K9 |
| B6 | Precio/histórico sin unidad explícita | `current_price` depende de `purchase_unit`; 1.162 históricos sin unidad de referencia | 226 / 1.162 | crítica | R5, K8a, K9 |
| B7 | Coste desconocido convertido en cero | `fn_recipe_line_cost` retorna 0 ante `converted IS NULL`; 33 precios son cero | 33 / 14 líneas | crítica | R8, K4, K7 |
| B8 | Writers legacy activos | 13 rutas escriben columnas K2; además hay writers relacionados de precio/stock | 13 | crítica | R6, K2b, K5, K8b, K11/K12 |

Los bloqueos se mantienen separados. B1 no se fusiona con B2: uno es ausencia de evidencia de presentación; el otro es la regla legacy que convierte esa ausencia en un factor operativo.

## C. Las 6 causas estructurales

| Causa | Bloqueos | Tipo dominante | Diagnóstico |
|---|---|---|---|
| Presentación de proveedor ausente | B1, B4 | datos / proveedor | faltan cantidad, unidad de contenido y precio por presentación |
| Fallback y unidad implícita | B2, B6 | algoritmo / legacy / modelo | `1` y `purchase_unit` implícito sustituyen evidencia estructurada |
| Mapping/OCR no verificado | B1, B2, B4 | datos / legacy | hay señales textuales, pero no una unidad maestra confirmada |
| Multiplicidad de mappings | B1, B4 | datos / algoritmo | 145 mappings están en pares producto-proveedor duplicados |
| Incompatibilidad dimensional en receta | B3 | datos / configuración | no existe conversión universal ni puente de presentación probado |
| Productor de coste/histórico incompleto | B5, B6, B7 | modelo / SQL / backend | precio y coste no conservan referencia/estado suficiente |

La arquitectura canónica no se cambia. `units`/dimensiones/conversiones universales, presentations, supplier presentations, `product_prices` y estados de coste siguen siendo los componentes aprobados.

## D. Los 14 no migrables automáticamente

| Grupo | Líneas | Productos | Qué falta | Quién lo proporciona | Evidencia desbloqueante |
|---|---:|---:|---|---|---|
| Bebidas con compra `u/ud` y receta `ml/l` | 7 | Juver naranja, Juver piña, Nestea, Powerade, Red bull, Trina naranja, Voll damm | contenido por botella/lata | proveedor o revisión de albarán | `piece_content_qty/unit` o presentación de proveedor confirmada |
| Alimentos con compra `kg` y receta `ud/l` | 7 | Ajo, Apio, Arandanos, Cebolla seca, Frambuesas, Fresas | significado de la cantidad de receta y peso por pieza, si existe | responsable de recetas y/o proveedor | unidad de receta corregida o presentación con contenido explícito |

Los siete casos del primer grupo son **resolubles por datos**, pero no automáticamente ahora. Los siete del segundo grupo son **revisión humana** porque la receta puede estar expresando una intención culinaria que no se deduce del nombre.

Si no se obtiene la evidencia, los 14 permanecen legacy, fuera del backfill y con estado `REQUIRES_REVIEW`. El riesgo de forzarlos es introducir conversiones de volumen/masa/conteo falsas en coste y stock.

## E. Los 7 casos humanos

Son las dos líneas de `Ajo` y una línea de cada uno de `Apio`, `Arandanos`, `Cebolla seca`, `Frambuesas` y `Fresas`.

La revisión debe responder, por producto y receta:

- si la receta quiso expresar una pieza, un volumen o una masa;
- si existe un peso medio o contenido contractual por pieza;
- si el dato correcto es cambiar la configuración de la receta o registrar una presentación;
- qué documento de proveedor respalda la decisión.

No se permite elegir `ud`, `kg` o `l` por defecto. La decisión humana debe quedar auditada antes de que una línea entre en un backfill.

## F. Los 148 casos de unidades diferentes

Las 148 líneas no son un bloqueo conceptual. La diferencia de unidad por contexto es una capacidad esperada del modelo.

| Subgrupo B | Casos | Recetas | Clasificación |
|---|---:|---:|---|
| `kg` de compra → `g` de receta | 109 | 49 | A: conversión universal determinista |
| `l` de compra → `ml` de receta | 34 | 29 | A: conversión universal determinista |
| `per_pack` con puente de presentación | 5 | 4 | B: requiere presentación de producto completa |
| **Total** | **148** | **59** | **143 universales + 5 de presentación** |

Dentro de las cinco líneas de puente están `Cava` y vinos con pack `750 ml` por unidad. No son conversiones universales de `ud` a litros: son composición de una presentación concreta.

Los contextos `order_unit=caja/pack` con receta `ud` aparecen también en la fotografía completa, pero no forman parte de las 148 líneas B cuando la unidad de compra física ya es `ud`. Para compra/stock necesitan presentación verificada; no se deben usar `order_unit` como sustituto de esa presentación.

Clasificación solicitada:

| Clase | Casos dentro de los 148 | Acción |
|---|---:|---|
| A. Conversión universal determinista | 143 | automatizable por el motor canónico |
| B. Requiere presentación | 5 | automatizable solo con `pack_*` completo y validado |
| C. Requiere supplier presentation adicional | 0 dentro de B; sí aplica a B1/B4 | cola K3/K8b |
| D. Requiere dato adicional | 0 dentro de B; sí aplica a los 14 F | revisión de proveedor/receta |
| E. Realmente ambiguo | 0 dentro de B; los ambiguos están fuera de este grupo | no transformar |

La SSOT resultante conserva una identidad de producto y permite unidades distintas por compra, stock, receta y coste. No se homogeneizan las cadenas de texto como objetivo de negocio.

## G. Pack problemático

El único pack catalogado con discrepancia económica es `Leche avena`, proveedor `Shers`.

| Dato | Actual |
|---|---|
| Producto | Leche avena |
| Proveedor | Shers |
| Presentación observada | `6 × 1 L` |
| `pack_price` | `9,60 €` |
| `pack_units` | `6` |
| `pack_unit_size_qty/unit` | `1 l` |
| `purchase_unit` | `l` |
| `current_price` | `9,60 €/l` implícitos |
| Precio esperado por pack | `9,60 € / 6 l = 1,60 €/l` |
| Dato que falta | confirmación de que `9,60 €` es el pack completo y que contiene 6 litros |
| Automatización | solo después de evidencia verificada |

No se modifica el registro. K9 debe derivar `product_prices` desde la presentación verificada, nunca copiar `current_price`. La discrepancia debe ser un caso obligatorio del shadow y del gate G8.

## H. Las 6 invariantes fallidas

| Invariante | Evidencia | Causa | Resolución | Test posterior |
|---|---|---|---|---|
| Precio con unidad de referencia | 226 `current_price` dependen implícitamente de `purchase_unit`; no hay FK histórica | modelo legacy | R5: `product_prices.reference_buy_unit_id` e histórico canónico | cada precio actual tiene una única unidad FK y snapshot |
| Caja sin contenido no se convierte | 216 mappings sin contenido; 133 productos | fallback + presentación ausente | R1/R2/R8 | ninguna línea sin contenido genera factor ni precio normalizado |
| Conversión desconocida no devuelve 0 | `fn_recipe_line_cost` retorna 0 con `converted IS NULL` | SQL legacy | R8 | `INCOMPATIBLE_UNITS` con `line_cost=NULL`, nunca cero semántico |
| Coste desconocido no devuelve 0 | 33 ingredientes con precio cero y 14 líneas incompatibles | contrato coste mezclado | R8 | estados TS/SQL idénticos para missing/incompatible |
| Supplier presentation propia | 216 mappings incompletos, 133 productos, 13 proveedores | mapping legacy | R1/R2/R3 | cada mapping migrado tiene presentation o `REQUIRES_REVIEW` |
| Histórico conserva precio/unidad | 1.162 filas históricas sin unidad de referencia; 180 productos | histórico legacy | R5 | precio, unidad, presentación y fuente reproducen el evento original |

La solución es combinada: modelo canónico para referencias y estados, datos verificados para presentations, código SQL/backend para fallos silenciosos y writers controlados por fase.

## I. Los 13 writers

| Writer | Tabla/campo | Ruta | Qué escribe | Riesgo K2 | Acción |
|---|---|---|---|---|---|
| Alta ingredientes | `ingredients.purchase_unit/unit_type` | `src/app/ingredients/page.tsx` | alta con unidades y pack | crea legacy durante backfill | BLOQUEAR DURANTE K2; ADAPTAR A NUEVO SSOT |
| Modal alta | `ingredients.purchase_unit/unit_type` | `src/components/CreateIngredientModal.tsx` | default `kg` | unidad inventada por UI | BLOQUEAR DURANTE K2; ADAPTAR |
| Edición ingrediente | `ingredients.purchase_unit/unit_type/recipe_unit/order_unit` | `IngredientEditModal.tsx` | edición completa | pisa contextos distintos | BLOQUEAR; ADAPTAR |
| Wizard | unidades y `pack_*` en `ingredients` | `IngredientWizard.tsx` | precio/presentación legacy | segundo writer de precio | BLOQUEAR; ADAPTAR |
| Revisión precios | purchase/unit_type/pack | `dashboard/albaranes-precios/actions.ts` | precio y posible unidad | fallback `kg` | BLOQUEAR; ADAPTAR |
| Pedido | `ingredients.order_unit` | `OrderProductCard.tsx` | unidad de pedido | confunde presentación con física | BLOQUEAR; ADAPTAR |
| Trigger pack | `unit_type/base_unit/unit` | `trg_ingredients_pack_pricing_sync` | deriva columnas | side effect al tocar purchase | BLOQUEAR; ELIMINAR DESPUÉS |
| RPC ingredientes | `purchase_unit/unit_type` | `public.gestionar_ingredientes` | alta vía máquina | ruta no cubierta por UI | BLOQUEAR; ADAPTAR |
| Alta receta | `recipe_ingredients.unit` | `src/app/recipes/page.tsx` | línea con unidad textual | línea sin FK canónica | BLOQUEAR; ADAPTAR |
| Edición receta | `recipe_ingredients.unit` | `src/app/recipes/[id]/page.tsx` | alta y edición directa | escribe durante clasificación | BLOQUEAR; ADAPTAR |
| Importador recetas | `recipe_ingredients.unit` | `dashboard/recetas-import/actions.ts` | importación | normalizador local | BLOQUEAR; ADAPTAR |
| Importador legacy | `recipe_ingredients.unit` | `src/app/actions/import-legacy.ts` | delete/reinsert/import | operación destructiva | BLOQUEAR; ADAPTAR |
| Recetas TPV | `recipe_ingredients.unit` | `dashboard/recetas-tpv/actions.ts` | alta con default | default `kg` | BLOQUEAR; ADAPTAR |

Los 13 son **críticos** para K2 porque pueden escribir campos protegidos. La acción inmediata permitida es bloquearlos mediante el freeze oficial; su migración a un writer canónico ocurre en las fases del DAG aprobado. No se modifica ninguno en esta tarea.

## J. Las 10 resoluciones

| ID | Resolución | Tipo | Capa/archivos a tocar después | Tabla/campos | Lógica | Tests necesarios |
|---|---|---|---|---|---|---|
| R1 | Crear cola explícita de mappings ambiguos | DATA + BACKEND | K3/K8b; servicio de revisión | `supplier_item_mappings`, supplier presentations | cada caso conserva raw, causa, evidencia y estado | 216 casos reproducibles; cero selección implícita |
| R2 | Completar contenido de proveedor | REVISIÓN HUMANA + DATA | flujo de confirmación de presentación | `supplier_product_presentations`, `verified_*` | contenido solo con fuente verificable | Coca, agua, leche y fixtures de packs |
| R3 | Resolver mappings duplicados | SQL + BACKEND | K3; selector de mapping | supplier/product relations | orden determinista; duplicado no elegido queda en revisión | 145 filas duplicadas; repetición idempotente |
| R4 | Resolver o aislar las 14 F | REVISIÓN HUMANA + CONFIG | revisión de recetas y producto | `recipe_ingredients.unit`, presentation | corregir solo con decisión documentada; si no, legacy | 14 líneas; ningún `kg↔l` inventado |
| R5 | Precio e histórico con unidad explícita | SQL + BACKEND + DOCUMENTACIÓN | K8a/K9; servicios de precio | `product_prices`, `product_price_history`, `reference_buy_unit_id` | un writer y snapshot de unidad/presentación | unicidad de precio actual, histórico reproducible |
| R6 | Recomponer Leche avena desde pack | DATA + REVISIÓN HUMANA | K8b/K9; PriceService | presentación y precio, no copia de current | verificar `6×1 L`; derivar `1,60 €/L` | caso T22b y shadow bloqueante |
| R7 | Resolver Coca-Cola por proveedor | DATA + REVISIÓN HUMANA | K3/K8b/K9; matching/precio | supplier presentation y precio verificado | separar caja/lata y conservar precio observado | caja con contenido, precio €/ud y receta ud |
| R8 | Eliminar ceros/factor 1 silenciosos | SQL + BACKEND | K4/K6/K7; `recipe-cost.ts`, RPCs SQL | funciones de conversión/coste | estados explícitos; no fallback semántico | paridad TS/SQL, incompatibilidad no cero |
| R9 | Controlar y migrar writers | WRITER MIGRATION + BACKEND | K5/K8b/K11/K12; 13 rutas | columnas legacy y nuevos SSOT | un writer canónico; freeze durante transición | grep/AST, permisos, prueba concurrente |
| R10 | Repetir validación y gates | AUTOMÁTICA + DOCUMENTACIÓN | scripts read-only, spike y CI | snapshot, clasificaciones, shadow | comparar, auditar y producir PASS/BLOCKED | drift 0, reversibilidad, gates G0-G2/G8/G9 |

### J.1 Clasificación de automatización

Esta clasificación se refiere al mecanismo de resolución, no a ejecutar cambios ahora:

| Clase | Resoluciones | Número | Motivo |
|---|---|---:|---|
| AUTOMÁTICA | R1, R8, R10 | 3 | consulta, estado y tests tienen reglas formales |
| SEMI-AUTOMÁTICA | R2, R3, R5, R6 | 4 | el sistema prepara/procesa, pero necesita evidencia o aprobación |
| HUMANA | R4, R7, R9 | 3 | semántica de receta, proveedor o cambio de writer requiere decisión |

La IA/OCR puede aportar observaciones para R2/R7, nunca aprobar composición o precio por sí sola.

## K. DAG de implementación posterior

Se conserva el DAG aprobado; estas son resoluciones agrupadas sobre sus fases, no fases K nuevas:

```text
R1 cola y alcance
  ↓
R2 evidencia de presentaciones ──→ R3 mappings deterministas
  ↓                                  ↓
R4 14 F aisladas/resueltas       R5 referencia de precio
  └──────────────┬───────────────────┘
                 ↓
R9 control de writers ──→ K2a/K2b read-only revalidado
                 ↓
K5 → K8a → R8/K6 → K7 → K8b → R6/R7/K9 → K4 → K10 → K11 → K12
                                      ↓
                                    R10 gates finales
```

Dependencias principales: **7 grupos**.

1. R1 precede R2 y R3.
2. R2 precede R3, R6 y R7.
3. R4 precede cualquier backfill de sus 14 líneas.
4. R5 precede R6 y K9.
5. R8 depende de K8a para la fuente canónica y precede K4/K7.
6. R9 debe estar controlado antes de cualquier escritura K2b y vuelve a ser gate de K11/K12.
7. R10 depende de todas las resoluciones aplicables y no sustituye la autorización de escritura.

En paralelo pueden prepararse R1, el inventario de R9 y los fixtures read-only de R10. R2/R3 y R4 dependen de evidencia. R5/R6/R7 dependen de presentaciones verificadas. Nada de esto se implementa ahora.

## L. Gates

### GATE R1 — Cola de revisión

**PASS si:** existen 216 IDs reproducibles, causa, proveedor, producto, raw, estado y prohibición de conversión automática.  
**FAIL si:** una fila usa `ud`, `factor=1` o último mapping como resolución.

### GATE R2 — Presentaciones verificadas

**PASS si:** cada presentation usada para precio tiene contenido, unidad, fuente y confianza; Coca-Cola, agua y leche tienen evidencia.  
**FAIL si:** solo hay texto OCR o una señal de nombre.

### GATE R3 — Mappings

**PASS si:** los 145 casos duplicados tienen selección determinista o estado de revisión, y la repetición produce el mismo resultado.  
**FAIL si:** la selección depende del orden de inserción o de un `LIMIT` sin orden estable.

### GATE R4 — No migrables

**PASS si:** las 14 líneas tienen decisión documentada, evidencia o aislamiento legacy explícito; las 7 humanas tienen responsable y fuente.  
**FAIL si:** se cambia una unidad incompatible por defecto.

### GATE R5 — Precio e histórico

**PASS si:** cada precio canónico tiene `reference_buy_unit_id`, presentación fuente y snapshot histórico; Leche deriva `1,60 €/L`.  
**FAIL si:** se copia `current_price` o se escribe precio sin unidad.

### GATE R8 — Conversiones y coste

**PASS si:** TS y SQL devuelven el mismo estado y una conversión desconocida no devuelve cero/factor uno.  
**FAIL si:** una línea F aparece como coste válido `0`.

### GATE R9 — Writers

**PASS si:** los 13 writers están bloqueados durante la ventana K2b, el freeze se prueba y existe la ruta del writer canónico posterior.  
**FAIL si:** una ruta puede escribir silenciosamente una columna protegida o existe un writer oculto.

### GATE R10 — Nuevo dry-run

**PASS si:** snapshot drift `0`, clasificación completa, 200 filas A reversibles, 148 B fuera de normalización textual salvo presentación aprobada, 14 F aisladas/resueltas, sin heurísticas y freeze final `INACTIVE`.  
**FAIL si:** cualquier diferencia, ambigüedad seleccionada, writer no controlado o invariante aplicable fallida.

### Separación final

`DRY-RUN PASS` solo demuestra que la propuesta es correcta y reversible. `WRITE K2 AUTHORIZED` requiere además aprobación explícita, ventana operativa, freeze adquirido por el mecanismo oficial, snapshot confirmado inmediatamente antes y rollback probado. Un PASS nunca autoriza automáticamente una escritura.

**Gates definidos:** 10: R1, R2, R3, R4, R5, R8, R9, R10 y las dos decisiones finales `DRY-RUN PASS` / `WRITE AUTHORIZED`.

## M. Rollback

Esta tarea no tiene rollback de datos porque no escribe datos.

Para la implementación posterior se conserva el principio aprobado:

- K2b solo con delta reversible por PK y columna;
- snapshot anterior intacto;
- sin `DROP` ni `DELETE` como rollback operativo;
- flags/cut-over desactivables;
- cualquier presentación o precio creado después se conserva y se corrige mediante operación compensatoria documentada;
- K12 solo después de shadow, histórico, restore, stock y cero readers/writers.

## N. Criterios para nuevo dry-run

Antes de repetirlo debe existir:

1. cola R1 reproducible;
2. resolución R2/R3 de mappings que se pretendan tocar;
3. 14 F resueltas o aisladas;
4. Coca-Cola y Leche con evidencia separada;
5. writer inventory R9 actualizado y probado;
6. contrato de estados R8 implementado y probado donde corresponda;
7. snapshot sin regenerar ni sobrescribir, tomado según protocolo;
8. freeze final `INACTIVE` después de la validación.

## O. Criterios para `WRITE AUTHORIZED`

La autorización requiere todos los criterios siguientes, además de `DRY-RUN PASS`:

- aprobación explícita de la fase de escritura;
- snapshot drift `0` inmediatamente antes;
- alcance limitado a filas/columnas allowlist;
- cero ambigüedades seleccionadas;
- 14 F fuera del conjunto de escritura o resueltas con evidencia;
- ningún writer legacy concurrente sin bloqueo;
- rollback por delta probado;
- plan de observabilidad y operador responsable;
- freeze adquirido y liberado por las funciones oficiales;
- validación posterior y freeze final `INACTIVE`.

## P. Riesgos residuales

- Los 216 mappings pueden requerir intervención externa de proveedores y no tienen fecha de resolución automática.
- Las 7 decisiones humanas pueden corregir la configuración de receta, la presentación o ambas; el dato de proveedor no siempre decide la intención culinaria.
- El legacy contiene 33 precios cero; no se puede asumir que todos sean desconocidos sin revisar cada caso.
- Los writers relacionados de precio y stock no forman parte de las 13 columnas K2, pero pueden producir efectos laterales durante fases posteriores.
- No existe entorno de pruebas; toda implementación futura seguirá necesitando snapshots, freeze, shadow y rollback en la BD real.

## Q. Estado final

```text
PLAN DE DESBLOQUEO = DOCUMENTADO
DATOS MODIFICADOS = NO
K2 = NO EJECUTADA
FREEZE = INACTIVE
DRY-RUN = BLOCKED
IMPLEMENTACIÓN = NO AUTORIZADA
```
