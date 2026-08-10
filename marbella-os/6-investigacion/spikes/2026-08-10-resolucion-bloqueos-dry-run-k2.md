---
documento: SPIKE-RESOLUCION-BLOQUEOS-DRY-RUN-K2
clase: inmutable
estado: archivado
capa: investigacion
normativo: false
precedencia: 0
responsable: propiedad del producto
fechado: 2026-08-10
caducidad: no aplica
supersede: —
depende_de: CANON, GLOSARIO, MODELO-DE-DATOS, DOMINIO-PRECIOS-Y-COMPRAS, ARQUITECTURA, DEUDA, PROTOCOLO-AGENTES
---

# Resolución de bloqueos del dry-run K2

> **MATERIAL NO NORMATIVO — SPIKE-RESOLUCION-BLOQUEOS-DRY-RUN-K2**
>
> Análisis read-only de los bloqueos encontrados en `2026-08-10-dry-run-k2-unidades.md`. No ejecuta K2, no modifica datos y no reabre la arquitectura aprobada. Las decisiones de fases y SSOT se toman del DAG y de la matriz de writers ya cerrados.

**BD:** Supabase real `feqjbwxkelpgzsdiphei`  
**Freeze consultado:** `INACTIVE`  
**Snapshot drift:** `0`  
**K2:** no ejecutada.

## A. Estado actual

El dry-run anterior analizó 588 filas: 226 ingredientes y 362 líneas de receta. Encontró 216 mappings de proveedor sin contenido explícito, 14 líneas no convertibles automáticamente, 59 recetas con alguna conversión B o F, 13 writers legacy de las columnas protegidas e invariantes fallidas.

No se repitió K2 ni se adquirió el freeze para este análisis. Los cuatro cambios de código ajenos ya presentes en el working tree siguen sin tocarse:

- `src/app/playground/studio/components/RealAppView.tsx`
- `src/app/playground/studio/design-context.test.ts`
- `src/app/playground/studio/screens/system.tsx`
- `src/lib/sandbox/client.ts`

Los derivados de Marbella OS y el spike anterior ya constaban como cambios del trabajo previo. Este informe es un nuevo spike; no sobrescribe ninguno anterior.

## B. Los 216 ambiguos

### B.1 Qué son realmente

Los 216 no son 216 productos distintos ni 216 decisiones arquitectónicas. Son 216 filas de `supplier_item_mappings` que cumplen simultáneamente:

- `line_content_qty` ausente o no positivo;
- `line_content_unit` ausente;
- `line_billing_unit` nulo o vacío;
- `conversion_factor = 1`.

Las 216 filas pertenecen a 133 ingredientes y 13 proveedores. Hay 145 filas dentro de pares `(supplier_id, ingredient_id)` con más de un mapping, por lo que también existe selección/multiplicidad legacy. 71 filas están solas para su par proveedor-producto.

El `1` de `conversion_factor` no es evidencia de equivalencia: es el fallback legacy. La función `invoice_line_price_to_purchase_unit` divide por `COALESCE(NULLIF(p_fallback_factor, 0), 1)` cuando falta el contenido. Por eso los 216 casos no pueden tratarse como factor unitario.

### B.2 Señales del texto observado

El nombre del artículo contiene una señal textual de packaging en 53 mappings y una señal de tamaño físico en 79. Hay solapamiento: 21 contienen ambas señales. La distribución exclusiva es:

| Señal observada | Casos |
|---|---:|
| Pack y tamaño | 21 |
| Pack sin tamaño | 32 |
| Tamaño sin pack | 58 |
| Sin señal interpretable | 105 |
| Total | 216 |

Estas señales son observaciones OCR/proveedor, no composición verificada. `COCA COLA ... 33CL` prueba un tamaño de lata, pero no cuántas latas contiene una caja.

### B.3 Categorías de causa

Las causas siguientes son no excluyentes porque una misma fila puede tener varias:

| Causa | Categoría | Casos | Qué demuestra |
|---|---|---:|---|
| Falta de contenido de presentación de proveedor | A/J | 216 | No hay cantidad ni unidad de contenido verificadas |
| Fallback `conversion_factor=1` sin unidad de línea | E/F | 216 | El factor no puede interpretarse semánticamente |
| Señal textual de pack o tamaño sin dato estructurado | C/J | 111 | Hay una pista, pero no una conversión autorizable |
| Multiplicidad de mappings del mismo proveedor-producto | G/D | 145 | Hay más de una posible presentación o alias |
| Unidad de precio explícita ausente | E | 216 | El precio observado no tiene unidad de referencia fiable |
| Fuente sin señal interpretable | J | 105 | No existe ni siquiera una pista que pueda verificarse automáticamente |

Las causas estructurales principales son **6**: presentación ausente, fallback legacy, observación OCR no verificada, mappings múltiples, referencia de precio implícita y unidades incompatibles en recetas.

### B.4 Matriz de los 216

El identificador de cada caso es `supplier_item_mappings.id`. La matriz completa se obtiene sin modificar datos con esta consulta, ordenada de forma estable y con las columnas solicitadas:

```sql
SELECT
  m.id AS id,
  i.name AS producto,
  s.name AS proveedor,
  m.supplier_item_name AS situacion_actual,
  CASE
    WHEN m.supplier_item_name ~* '(caja|caj|pack|bulto|saco|bolsa|botella|garrafa|\\([0-9]+\\)|[0-9]+[xX][0-9]+|c/[0-9]+)'
      THEN 'C/J: señal textual sin contenido estructurado'
    WHEN m.supplier_item_name ~* '([0-9]+([,.][0-9]+)?\\s*(ml|cl|l|kg|g|gr))'
      THEN 'C/J: tamaño observado sin presentación estructurada'
    ELSE 'A/J: presentación sin evidencia suficiente'
  END AS ambiguedad,
  jsonb_build_object(
    'line_billing_unit', m.line_billing_unit,
    'line_content_qty', m.line_content_qty,
    'line_content_unit', m.line_content_unit,
    'conversion_factor', m.conversion_factor,
    'last_known_price', m.last_known_price
  ) AS evidencia,
  'supplier_product_presentation verificada o cola REQUIRES_REVIEW' AS resolucion_posible,
  'contenido de proveedor y unidad de referencia' AS requiere_dato
FROM public.supplier_item_mappings m
LEFT JOIN public.ingredients i ON i.id = m.ingredient_id
LEFT JOIN public.suppliers s ON s.id = m.supplier_id
WHERE m.line_content_qty IS NULL
   OR m.line_content_qty <= 0
   OR m.line_content_unit IS NULL
   OR trim(m.line_content_unit) = ''
ORDER BY m.id;
```

La resolución común no es asignar `ud`, ni usar `factor=1`: cada fila debe obtener una presentación de proveedor verificada o quedar aislada como `REQUIRES_REVIEW`, conservando el dato observado sin usarlo como maestro.

## C. Las 14 líneas no migrables automáticamente

Son 14 líneas F en 13 productos. `Ajo` tiene dos líneas; los otros productos tienen una. No son 14 transformaciones pendientes: son 14 casos en los que el algoritmo no puede demostrar una relación dimensional ni un puente de presentación con los datos actuales.

| Producto | Proveedor | Compra actual | Receta | Evidencia actual | Falta | Presentación posible | Estado |
|---|---|---|---|---|---|---|---|
| Ajo | Ametller | `kg` | `l` y `ud` | 2 líneas; sin pack completo | confirmar si es pieza, peso o líquido | solo con dato de contenido | REQUIERE REVISIÓN HUMANA |
| Apio | Ametller | `kg` | `ud` | 1 línea; sin puente | peso por pieza o corregir receta | sí, si proveedor declara peso/pieza | REQUIERE REVISIÓN HUMANA |
| Arandanos | Ametller | `kg` | `ud` | 1 línea; sin puente | gramaje por unidad | sí, si presentación lo prueba | REQUIERE REVISIÓN HUMANA |
| Cebolla seca | Ametller | `kg` | `ud` | 1 línea; sin puente | unidad física de la receta | posible, pendiente de dato | REQUIERE REVISIÓN HUMANA |
| Frambuesas | Ametller | `kg` | `ud` | 1 línea; sin puente | unidades por peso o receta por kg | sí, con presentación | REQUIERE REVISIÓN HUMANA |
| Fresas | Ametller | `kg` | `ud` | 1 línea; sin puente | unidades por peso o receta por kg | sí, con presentación | REQUIERE REVISIÓN HUMANA |
| Juver naranja | Santa Teresa | `ud` | `ml` | 1 línea; no hay tamaño | ml por botella/unidad | sí, contenido de botella | RESOLVIBLE POR DATOS |
| Juver piña | Santa Teresa | `u` | `ml` | 1 línea; no hay tamaño | ml por botella/unidad | sí, contenido de botella | RESOLVIBLE POR DATOS |
| Nestea | Santa Teresa | `u` | `l` | 1 línea; no hay tamaño | litros por unidad | sí, contenido de botella/lata | RESOLVIBLE POR DATOS |
| Powerade | Santa Teresa | `u` | `l` | 1 línea; no hay tamaño | litros por unidad | sí, contenido de botella | RESOLVIBLE POR DATOS |
| Red bull | Santa Teresa | `u` | `l` | 1 línea; no hay tamaño | litros por lata | sí, contenido de lata | RESOLVIBLE POR DATOS |
| Trina naranja | Santa Teresa | `ud` | `l` | 1 línea; no hay tamaño | litros por unidad | sí, contenido de botella/lata | RESOLVIBLE POR DATOS |
| Voll damm | Santa Teresa | `u` | `l` | 1 línea; no hay tamaño | litros por unidad | sí, contenido de botella/lata | RESOLVIBLE POR DATOS |

Resumen de resolución:

| Clasificación | Líneas |
|---|---:|
| Resolubles mediante dato de proveedor/presentación | 7 |
| Requieren revisión humana de semántica de receta o producto | 7 |
| Resolubles por configuración automática sin evidencia nueva | 0 |
| Permanentes no migrables | 0 demostrados; se mantienen legacy hasta resolverlos |

Forzar cualquiera de ellos puede convertir litros en kilos, piezas en kilos o unidades de bebida en litros incorrectos. El riesgo es coste y stock plausibles pero falsos. Se mantienen sin tocar y con estado explícito de revisión.

## D. Atribución de la causa

| Problema | Datos actuales | Modelo canónico | Algoritmo | Legacy | Conclusión |
|---|---|---|---|---|---|
| 216 mappings sin contenido | sí | no; el modelo previsto sí tiene presentación | no debe inferir | sí; mapping/factor incompleto | causa primaria de datos legacy |
| `factor=1` sin unidad | sí | no; debe existir contenido o estado | sí; fallback no es admisible | sí | bug de fallback y datos incompletos |
| 14 F | sí | el modelo puede expresarlo con presentación o unidad corregida | correctamente bloquea | sí; receta y compra incompatibles | datos actuales, no fallo de arquitectura |
| `current_price` sin referencia FK | sí | la solución canónica ya define `product_prices.reference_buy_unit_id` | no puede inventar referencia | sí | falta de implementación legacy |
| `fn_recipe_line_cost` devuelve 0 | sí | estados explícitos previstos | sí; contrato SQL actual contradice el objetivo | sí | defecto de implementación, reservado a K4 |
| escritores directos | sí | matriz B9 ya define writer único | no | sí | control de fase, no nueva arquitectura |

## E. Invariantes fallidas

| Invariante | Evidencia real | Productos afectados | Causa | Solución necesaria |
|---|---|---:|---|---|
| Precio con unidad de referencia explícita | `ingredients.current_price` solo se interpreta junto a `purchase_unit`; no hay FK ni snapshot de unidad | 226 | modelo legacy implícito | K8a/K8b/K9: `product_prices.reference_buy_unit_id` y precio observado separado |
| Caja sin contenido no se convierte | 216 mappings tienen contenido ausente, billing unit nulo y factor 1; 53 nombres tienen señal de pack | 133 | fallback legacy y presentación ausente | K3/K8b: dato verificado o `REQUIRES_REVIEW`; nunca factor 1 |
| Conversión desconocida no devuelve 0 | `fn_recipe_line_cost` retorna 0 cuando `converted IS NULL`; hay 14 líneas F | 13 productos / 8 recetas | contrato SQL legacy | K4: contrato con `status`, sin wrapper numérico silencioso |
| Coste desconocido no devuelve 0 | 33 ingredientes tienen `current_price=0`; las líneas F también producen cero en SQL/TS numérico | hasta 33 productos y 14 líneas | cero mezcla ausencia, incompatibilidad y valor real | K4/K7: estados `MISSING_PRICE`/`INCOMPATIBLE_UNITS` |
| Proveedor con presentación propia | 216 de 366 mappings carecen de contenido; 133 productos y 13 proveedores afectados | 133 | mapping legacy no normalizado | K3/K8b: `supplier_product_presentations` y cola de revisión |
| Histórico conserva precio y unidad | 1.162 filas de `ingredient_price_history`, 180 productos, sin unidad de referencia; `changed_by` es nulo en 1.162 | 180 históricos | histórico legacy incompleto | K9: histórico canónico con unidad y evidencia; legacy read-only |

**Invariantes fallidas descompuestas: 6.** Las demás invariantes del dry-run quedaron PASS o PASS parcial; no se reinterpreta una PASS parcial como autorización de escritura.

## F. Coca-Cola

### Coca cola

**ANTES:** `ingredients.purchase_unit=ud`, `recipe_unit=ud`, `current_price=0,60`, sin `pack_*`; mapping Santa Teresa sin contenido; albaranes con `line_unit=caja`, `l`, `ud` y nulo. Existe una línea de 10 cajas a 14,40 € de precio unitario y 144,00 € de total.

**MODELO CANÓNICO ESPERADO:** un producto maestro Coca-Cola; una presentación de proveedor Santa Teresa con tipo de presentación, contenido total y unidad atómica verificados; precio observado en €/caja conservado; precio normalizado en `product_prices` como €/ud; receta en ud.

**DATOS NECESARIOS:** número de latas por caja; confirmación de que `14,40 €` es €/caja; unidad real de cada línea; relación estable de la línea con el mapping; fecha/documento de proveedor.

**¿Automatizable?:** no actualmente. Sí después de verificar contenido, seleccionar mapping de forma determinista en K3 y recalcular el precio desde la presentación en K9.

### Coca cola zero

**ANTES:** `purchase_unit=u`, `recipe_unit=ud`, `current_price=0,60`, sin pack; mapping sin contenido; albaranes con `caja`, `ud` y unidad nula.

**MODELO CANÓNICO ESPERADO:** igual que Coca cola, pero con su propia presentación de proveedor y sin compartir automáticamente el contenido ni el precio.

**DATOS NECESARIOS:** contenido por caja/lata, precio observado por presentación y mapping exacto.

**¿Automatizable?:** no actualmente. La similitud nominal “Coca-Cola” no es evidencia suficiente para compartir presentación.

El problema real es combinado: presentación ausente, mapping incompleto, unidad OCR inconsistente y precio de presentación sin unidad de referencia. No se divide ningún precio.

## G. Aceite

El aceite de oliva virgen extra no está bloqueado por conversión:

```text
Compra: 1 × 5 l por 154,95 €
Precio normalizado observado: 30,99 €/l
Receta: 10 ml
10 ml → 0,010 l
```

El producto y las recetas actuales aportan evidencia suficiente para el factor dimensional `0,001`; no hace falta crear otro producto. El riesgo está en que el precio legacy tiene unidad implícita y el trigger actual debe recomputar desde la presentación, no copiar `current_price`. La resolución corresponde a K8b/K9 y la conversión común a K6/K7; no es un bloqueo de `recipe_ingredients.unit`.

## H. Unidades por contexto

La clasificación de todas las 362 líneas, incluyendo las 59 recetas afectadas, queda así. Las cifras de “recetas” son IDs distintos y las categorías pueden representar contextos diferentes del mismo producto.

| Contexto compra | Contexto receta | Casos | Recetas | ¿Conversión determinista? |
|---|---|---:|---:|---|
| `kg` | `g` | 109 | 49 | sí, `g↔kg` |
| `l` | `ml` | 34 | 29 | sí, `ml↔l` |
| compra `caja` por `order_unit` | `ud` | 87 | 63 | solo con contenido de presentación; no por `order_unit` |
| compra `pack` por `order_unit` | `ud` | 79 | 48 | solo con presentación verificada |
| `per_pack` volumétrico | `ud` | 2 | 2 | sí, si `pack_unit_size_*` es completo |
| `ud/u` | `ml/cl/l` | 7 | 6 | no sin puente de presentación |
| otros/contextos ya equivalentes o sin cambio | varios | 44 | 34 | depende de alias o igualdad |

Las 148 líneas B de conversión determinista pertenecen a 59 recetas. La misma identidad de producto puede comprar en litros, mantener stock en su unidad y ser usada en mililitros; esa diferencia contextual es correcta. Lo que no es correcto es resolverla sin factor, presentación o unidad de referencia verificable.

## I. Los 13 writers legacy

Todos los 13 writers que escriben columnas protegidas son críticos durante una operación de K2b. El freeze de BD puede impedir la escritura, pero no elimina el riesgo operativo ni autoriza que continúen como writers canónicos.

| Writer | Tabla | Campo | Qué escribe | Riesgo | Fase necesaria | Clasificación |
|---|---|---|---|---|---|---|
| `src/app/ingredients/page.tsx` | `ingredients` | purchase/unit_type/recipe/order | alta completa de ingrediente | crea nueva semántica legacy | K8b/K12 | C/D |
| `CreateIngredientModal.tsx` | `ingredients` | purchase/unit_type | alta con default `kg` | default arbitrario | K8b/K12 | C/D |
| `IngredientEditModal.tsx` | `ingredients` | purchase/unit_type/recipe/order | edición y pack | reescribe varias verdades | K8b/K12 | C/D |
| `IngredientWizard.tsx` | `ingredients` | purchase/unit_type/recipe + pack | configuración de precio y presentación | writer directo y pack legacy | K8b/K12 | C/D |
| `albaranes-precios/actions.ts` | `ingredients` | purchase/unit_type + pack | revisión de precio/unidad | fallback `kg` y reconfiguración | K8b/K12 | C/D |
| `OrderProductCard.tsx` | `ingredients` | order_unit | persiste unidad de pedido | confunde contexto pedido con unidad física | K8b/K12 | C/D |
| `trg_ingredients_pack_pricing_sync` | `ingredients` | unit_type/base_unit/unit | deriva columnas desde purchase | side effect legacy | K8a/K6/K12 | C/D |
| `public.gestionar_ingredientes` | `ingredients` | purchase_unit/unit_type | alta vía RPC | ruta de máquina adicional | K8b/K12 | C/D |
| `src/app/recipes/page.tsx` | `recipe_ingredients` | unit | alta de línea | escribe texto sin FK | K11/K12 | C/D |
| `src/app/recipes/[id]/page.tsx` | `recipe_ingredients` | unit | alta y edición directa | escritura desde cliente | K11/K12 | C/D |
| `recetas-import/actions.ts` | `recipe_ingredients` | unit | importación | normalizador local | K11/K12 | C/D |
| `import-legacy.ts` | `recipe_ingredients` | unit | delete/reinsert e importación | operación destructiva legacy | K11/K12 | C/D |
| `recetas-tpv/actions.ts` | `recipe_ingredients` | unit | alta desde TPV | default `kg` | K11/K12 | C/D |

**Writers críticos: 13.** Durante K2b todos deben estar bloqueados por el freeze y observados por el gate; la eliminación definitiva sigue el DAG aprobado, no esta tarea. No se cambia ningún writer ahora.

## J. Causas estructurales y mecanismo mínimo

| Causa | Casos relevantes | Mecanismo mínimo propuesto | No hacer |
|---|---:|---|---|
| Presentación de proveedor ausente | 216 mappings / 133 productos | crear registro de supplier presentation solo con evidencia verificada o `REQUIRES_REVIEW` | no inferir de “caja” |
| Contenido de pack ausente | 216 mappings | completar cantidad y unidad de contenido, con fuente y confianza | no usar `factor=1` |
| OCR/unidad textual inconsistente | 111 con señales; 681 `line_unit` nulos en líneas | conservar raw y separar campo verificado | no convertir OCR en maestro |
| Multiplicidad de mappings | 145 filas en pares duplicados | K3 define selección determinista y cola de duplicados | no elegir por último insert |
| Precio sin referencia explícita | 226 ingredientes; 1.162 históricos sin unidad | K8b/K9 usa `product_prices.reference_buy_unit_id` e histórico canónico | no copiar `current_price` |
| Incompatibilidad receta/compra | 14 líneas F | pedir dato, corregir configuración con revisión humana o aislar en legacy | no cambiar `l` a `kg` |
| Cero como error | 33 precios cero; 14 líneas F | K4/K7 devuelve estados explícitos | no usar 0 como coste válido de desconocido |

## K. Orden de ejecución

No se introduce una nueva familia de fases. Se mantiene el DAG aprobado:

```text
K1 → K2a → K2b → K3 → K5 → K8a → K6 → K7 → K8b → K9 → K4 → K10 → K11 → K12
```

Aplicación al bloqueo actual:

1. `K2a`: este análisis clasifica; no muta.
2. `K2b`: solo podrá normalizar filas textuales deterministas aprobadas, no los 216 ni las 14 F.
3. `K3`: resuelve mappings múltiples y presentations verificadas.
4. `K5`: controla el writer de stock antes de crear el modelo canónico.
5. `K8a`: crea unidades, dimensiones, conversiones, claves, constraints y RLS.
6. `K6/K7`: unifica conversión y verifica paridad de estados/valores.
7. `K8b`: backfill de productos, defaults, presentations y supplier relations; los 216 no verificables permanecen en cola.
8. `K9`: normaliza precio desde presentación verificada; Coca-Cola y Leche son gates explícitos.
9. `K4`: elimina el cero semántico y expone estados de coste.
10. `K10/K11/K12`: stock, flujos, readers/writers cero y retirada legacy.

La resolución de los 216 no convierte K2a en una migración de presentaciones. Es una condición de datos para K3/K8b/K9 y una razón para mantener una cola explícita.

## L. Regla para ambiguos

Quedan prohibidas estas equivalencias:

- `caja` → `ud` sin contenido verificado;
- `conversion_factor=1` → equivalencia semántica;
- texto OCR → presentación maestra;
- precio de línea → €/unidad sin unidad de línea confirmada;
- IA/OCR → decisión final sin confirmación.

Una fila ambigua solo puede salir de la cola cuando existe evidencia de proveedor, composición de presentación, unidad de referencia y mapping determinista. En otro caso conserva su observación raw y el estado `REQUIRES_REVIEW`.

## M. Matriz de bloqueos

| Bloqueo | Casos | Severidad | Causa | Acción | Dependencia | Gate |
|---|---:|---|---|---|---|---|
| Mappings sin contenido | 216 | crítica | A/J | proveedor o cola explícita | K3/K8b | G2/G7 |
| Fallback factor 1 | 216 | crítica | E/F legacy | retirar fallback y exigir estado | K4/K6 | G5/G9 |
| Líneas F | 14 | crítica | H/datos | aislar y resolver manualmente o conservar legacy | K2b/K8b | G1/G7 |
| Coca-Cola | 2 productos | crítica | presentación + mapping + precio | verificar caja/lata y precio | K3/K9 | G2/G8 |
| Leche avena | 1 producto | alta | precio derivado contradice current | recomputar desde pack verificado | K8b/K9 | G8 |
| Precio sin referencia/histórico | 226 / 1.162 | crítica | modelo legacy | crear referencia y history canónico | K8a/K9 | G0/G8 |
| Coste cero por error | 33 precios / 14 líneas | crítica | contrato SQL/TS | estados explícitos y paridad | K4/K7 | G6/G9 |
| Writers legacy | 13 | crítica | rutas directas activas | freeze durante K2b; adaptar después | K5/K8b/K11 | G1/G3/G12 |

**Bloqueos críticos: 8.** Ninguno se resuelve escribiendo datos durante esta tarea.

## N. Criterios de desbloqueo

La siguiente preparación read-only podrá repetirse cuando se cumplan todos estos criterios:

1. Las 14 líneas F estén resueltas con dato/configuración revisada o aisladas explícitamente como legacy, con estado visible y sin candidato de conversión.
2. Los 216 mappings tengan presentación verificada o una cola `REQUIRES_REVIEW` con motivo, evidencia, proveedor y prohibición de uso automático.
3. Ningún caso ambiguo sea seleccionado por `factor=1`, `ud` por defecto, último mapping o heurística OCR.
4. Coca-Cola tenga contenido por presentación y precio de caja confirmado; Leche avena tenga fuente verificada para `1,60 €/L`.
5. Exista unidad de referencia explícita para cada precio canónico y snapshot histórico de precio/presentación.
6. La paridad TS/SQL devuelva el mismo estado, y ningún coste de conversión desconocida sea `0` sin estado.
7. Las 13 rutas writer estén inventariadas, bloqueadas por el freeze durante K2b y con la transición posterior prevista en el DAG.
8. El dry-run vuelva a producir snapshot drift `0`, clasificación completa, reversibilidad y ninguna conversión heurística.
9. Los gates G0, G1 y G2 del DAG aprobado estén satisfechos; la autorización de escritura será una decisión posterior y separada.

Los 216 no tienen que desaparecer físicamente antes de todo trabajo posterior: pueden permanecer aislados en una cola de revisión. Sí deben quedar fuera de cualquier backfill automático y fuera de la fuente maestra de precio/stock/coste.

## Gate

```text
ANÁLISIS = COMPLETO
DATOS MODIFICADOS = NO
K2 = NO EJECUTADA
FREEZE = INACTIVE
DRY-RUN = BLOCKED
IMPLEMENTACIÓN DE RESOLUCIONES = NO AUTORIZADA EN ESTA TAREA
```
