---
documento: ADR-0025
clase: inmutable
estado: vigente
capa: decisiones
normativo: true
precedencia: 80
responsable: propiedad del producto
decidido: 2026-10-08
depende_de: ADR-0023, MODELO-DE-DATOS, SEGURIDAD
supersede: ADR-0013
---

# ADR-0025 · Recepción autónoma y una acción humana

## Contexto

La secuencia de revisión, vista previa visible y segunda confirmación de
ADR-0013 obliga a repetir trabajo ya corregido. Una línea conocida y
verificable tampoco debe esperar la apertura de una pantalla. La propiedad del
producto autorizó el 2026-10-08 que la revisión humana termine con una única
acción «Guardar y aplicar» y que las líneas seguras se reciban sin acción.

## Decisión

1. `public.apply_receipt_line(...)` sigue siendo el único comando económico
   expuesto. Solo `manager` y `admin` pueden invocarlo como personas; el
   delegado automático de Mistral conserva el actor técnico auditado y las
   restricciones de [ADR-0023](ADR-0023-mistral-unico-y-relectura-historica.md).
2. K4 valida identidad, documento, proveedor, línea, ingrediente, versión de
   mapeo, presentación, unidades, factor, importes, precio, pedidos y
   autorización. La incertidumbre devuelve `needs_review`. La vista previa
   técnica se ejecuta antes de aplicar, pero no requiere una segunda pantalla
   ni un segundo toque cuando la persona acaba de resolver la excepción.
3. Una recepción confirmada crea atómicamente como máximo un `PURCHASE`, una
   confirmación append-only, las asignaciones a pedidos y, cuando procede, un
   cambio de precio trazado. La clave idempotente y las restricciones de K4
   impiden repetir el hecho en reintentos o concurrencia. Una línea recibida no
   se reescribe; su corrección futura exige rectificación o reversor.
4. Una propuesta de mapeo solo se vuelve conocimiento económico confirmado
   al cruzar K4. Una propuesta posterior no retira la presentación confirmada
   hasta que también se confirme. Un código de artículo solo se aprende de
   recepciones confirmadas; un nombre parecido propone identidad pero nunca
   autoriza por sí solo un movimiento. Un cambio numérico de presentación
   exige otra decisión.
5. Un documento puede tener líneas recibidas y excepciones pendientes. Al
   reintentar se omiten las confirmadas y se valida que ninguna recepción
   previa pertenezca a otra materialización. La relectura `historical` sigue
   sin invocar K4. Los originales, la evidencia y las versiones se conservan.
6. `stock_current` sigue siendo una proyección del ledger canónico. Ninguna
   interfaz, OCR o mapeo escribe stock o precio por otro camino.

## Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| Mantener una segunda confirmación visible | Repite la decisión humana sin añadir una validación que K4 no haga. |
| Aplicar directamente desde K5 | Rompe autorización, atomicidad e idempotencia de K4. |
| Tratar la similitud OCR como mapeo confirmado | Puede confundir cajas o variantes y corromper stock. |
| Bloquear todo el documento tras una recepción parcial | Deja líneas seguras pendientes en un reintento. |

## Consecuencias

- La interfaz comunica el motivo concreto si K4 rechaza la aplicación y
  conserva la corrección ya guardada para reintentar.
- Las pruebas de aceptación deben verificar tanto el único gesto visible
  como la vista previa, el comando atómico y la ausencia de duplicados.
