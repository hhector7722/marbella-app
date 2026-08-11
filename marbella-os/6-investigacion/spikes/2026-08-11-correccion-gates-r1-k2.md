---
documento: SPIKE-CORRECCION-GATES-R1-K2
clase: inmutable
estado: archivado
capa: investigacion
normativo: false
precedencia: 0
responsable: propiedad del producto
fechado: 2026-08-11
caducidad: no aplica
supersede: —
depende_de: CANON, GLOSARIO, MODELO-DE-DATOS, DOMINIO-PRECIOS-Y-COMPRAS, ARQUITECTURA, PROTOCOLO-AGENTES
---

# Corrección formal de gates R1 y K2

> **MATERIAL NO NORMATIVO — SPIKE-CORRECCION-GATES-R1-K2**
>
> Corrección documental del modelo de gates. No modifica el plan anterior, no modifica código, SQL, datos ni writers y no autoriza K2.

**Freeze:** `INACTIVE`  
**K2:** no ejecutada  
**Fase 2:** no ejecutada  
**Datos modificados:** `NO`

## A. Estado

El diagnóstico anterior distinguió dos hechos:

1. Las cinco condiciones literales del gate R1 se cumplen en el snapshot y dry-run read-only de los 216 mappings.
2. La ejecución se marcó `FAIL` porque se exigió un contrato persistente para una cola que no existe todavía en la BD y cuya materialización se relaciona con K3/K8b.

Ese `FAIL` operativo no debe convertirse en una falsa aprobación de escritura, pero tampoco debe contaminar la clasificación read-only de R1 con invariantes y writers de fases posteriores.

La corrección separa:

```text
R1-CLASSIFICATION PASS
        ↓
K2a/K2b dry-run y fases K aplicables
        ↓
GLOBAL K2 WRITE GATE
        ↓
K2 WRITE AUTHORIZED
```

Un PASS de clasificación nunca es autorización de escritura.

## B. Gate R1 actual

El gate literal del plan dice:

```text
PASS si: existen 216 IDs reproducibles, causa, proveedor, producto,
raw, estado y prohibición de conversión automática.

FAIL si: una fila usa ud, factor=1 o último mapping como resolución.
```

La ejecución anterior añadió una sexta condición operativa:

```text
Contrato persistente R1 disponible = PASS requerido
```

Esa condición no aparece en el gate literal. La ejecución la añadió porque R1 está clasificada como `DATA + BACKEND`, pero el propio plan sitúa supplier presentations y la materialización canónica en K3/K8b.

## C. Condición bloqueante

| Condición | ¿R1 depende de ella? | ¿Pertenece a fase posterior? | Resultado |
|---|---|---|---|
| 216 IDs reproducibles | sí | no | PASS |
| Causa por fila | sí | no | PASS |
| Proveedor, producto y raw | sí | no | PASS |
| Estado `REQUIRES_REVIEW` | sí | no | PASS read-only |
| Prohibición de unidad/factor/presentación implícitos | sí | no | PASS |
| Snapshot, dry-run, tests y rollback por PK | sí | no | PASS |
| Contrato persistente de cola | no para clasificar; sí para materializar | sí, K3/K8b | FAIL operativo |

La única condición que provocó el `FAIL` de ejecución es la última. No es una condición propia del trabajo read-only de R1; es una precondición de persistencia/materilización que se debe tratar en la fase que cree el destino canónico.

## D. Por qué no pertenece a R1

R1 puede clasificar y proteger los 216 casos sin escribirlos:

- el snapshot identifica cada PK;
- el dry-run conserva raw y evidencia;
- todos quedan `REQUIRES_REVIEW`;
- ningún factor o unidad se deriva.

La BD no tiene columnas `resolution_state`, `cause`, `evidence`, `confidence` o `review_owner` en `supplier_item_mappings`, ni tiene las tablas canónicas de supplier presentation. Persistir esos campos requiere contrato, RLS, writer y rollback.

El plan asigna la resolución de mappings y presentations a K3/K8b. Por tanto, `R1-PERSISTENCE READY` se reubica como condición del gate global de cualquier escritura que necesite esa persistencia, no como requisito para declarar que R1 completó su clasificación read-only.

Esto no relaja seguridad: mientras `R1-PERSISTENCE READY` no pase, no se permite escribir la cola ni seleccionar mappings ambiguos.

## E. Las 6 invariantes

| Invariante | Responsable | Fase | ¿Bloquea R1? | ¿Bloquea K2 WRITE? |
|---|---|---|---|---|
| Precio con unidad de referencia | R5 / ProductPriceService | K8a/K9 | no | sí para precio/coste afectado |
| Caja sin contenido no se convierte | R1 como guardia; R2/R3 para resolver | R1/K3/K8b | sí, solo como prohibición; está PASS read-only | sí si la escritura toca esos casos |
| Conversión desconocida no devuelve 0 | R8 / Cost Engine | K4/K6/K7 | no | sí para escrituras que afecten coste/conversión |
| Coste desconocido no devuelve 0 | R8 / Cost Engine | K4/K7 | no | sí para coste/coste derivado |
| Supplier presentation propia | R1/R2/R3 | K3/K8b | no para clasificar; sí para materializar | sí si se escribe presentación/mapping |
| Histórico conserva precio/unidad | R5 / PriceService | K9 | no | sí para precio/histórico |

Las seis invariantes globales siguen existiendo. Cinco no bloquean artificialmente `R1-CLASSIFICATION PASS` porque no son responsabilidad de R1; sí permanecen en el gate global o en el gate de su fase propietaria.

**Invariantes propias de R1:** 1 guardia de no conversión.  
**Invariantes globales:** 6.

## F. Los 13 writers

Los 13 writers de columnas K2 no se modifican ni se adelantan a R1.

| Writer | R1 | Fase posterior | ¿Controlado para R1? | ¿Controlado para K2 WRITE? |
|---|---|---|---|---|
| Alta de ingredientes | no | K8b/K12 | no escribe durante lectura | sí |
| Modal de alta | no | K8b/K12 | no escribe durante lectura | sí |
| Edición de ingrediente | no | K8b/K12 | no escribe durante lectura | sí |
| Wizard de ingrediente | no | K8b/K12 | no escribe durante lectura | sí |
| Revisión de precios | no | K8b/K12 | no escribe durante lectura | sí |
| Pedido de proveedor | no | K8b/K12 | no escribe durante lectura | sí |
| Trigger de pack | no | K8a/K6/K12 | no se activa sin DML | sí |
| RPC de ingredientes | no | K8b/K12 | no se invoca | sí |
| Alta de receta | no | K11/K12 | no escribe durante lectura | sí |
| Edición de receta | no | K11/K12 | no escribe durante lectura | sí |
| Importador de recetas | no | K11/K12 | no se invoca | sí |
| Importador legacy | no | K11/K12 | no se invoca | sí |
| Recetas TPV | no | K11/K12 | no se invoca | sí |

Los 3 writers de mappings sí son relevantes operacionalmente para la revisión R1: las rutas de albaranes que hacen `upsert` y pueden generar factor 1, y la ruta TPV que hace `delete/upsert`. R1 no los migra; el control de writers se comprueba en el gate global y en R9/K5.

**Writers responsabilidad R1:** 3 rutas de mappings observadas, solo como riesgo a controlar.  
**Writers globales:** 13 writers de columnas K2.

## G. Los 216 casos

Los 216 casos corresponden a la clasificación de R1, no a una obligación de resolver 216 presentations durante R1.

R1 debe garantizar:

- identificación completa;
- causa y evidencia raw;
- estado `REQUIRES_REVIEW`;
- prohibición de selección/conversión.

R1 no debe garantizar:

- contenido proveedor que no existe;
- selección final entre mappings duplicados;
- supplier presentation canónica;
- precio normalizado;
- corrección de las 7 decisiones humanas.

Esas salidas pertenecen a R2/R3/R5/K3/K8b. Los 216 siguen fuera de cualquier escritura K2 mientras no exista el contrato de persistencia y resolución correspondiente.

## H. Gate R1 corregido

### Condiciones propias

| ID | Condición | Responsable | Evidencia actual | PASS |
|---|---|---|---|---|
| R1-1 | Snapshot específico válido y no sobrescrito | R1 | snapshot R1 con checksum y 216 filas | PASS |
| R1-2 | Todos los PK del alcance son reproducibles | R1 | 216 `supplier_item_mappings.id` | PASS |
| R1-3 | Cada fila conserva causa, proveedor, producto y raw | R1 | `before`, nombres y `reason` | PASS |
| R1-4 | Cada fila tiene `REQUIRES_REVIEW` | R1 | 216 estados en dry-run | PASS |
| R1-5 | Ninguna fila recibe unidad, factor, presentation o mapping seleccionado | R1 | propuestas nulas y `HOLD_NO_WRITE` | PASS |
| R1-6 | Tests read-only, conteos y rollback por PK pasan | R1 | JSON 216/216, `proposed_writes=0`, snapshot | PASS |
| R1-7 | Ningún dato/writer fuera del alcance se modifica | R1 | DML=0; freeze final `INACTIVE` | PASS |

### Definición

```text
R1-CLASSIFICATION PASS
```

R1 corregida obtiene **PASS documental/read-only** porque cumple sus siete condiciones propias. Esto no ejecuta ni persiste R1 y no autoriza K2.

`R1-PERSISTENCE READY` no forma parte del PASS de clasificación. Es una condición separada del gate global cuando una fase posterior requiera materializar la cola.

## I. Global K2 Write Gate

Este gate responde a una pregunta distinta:

```text
¿Es seguro escribir cualquier cambio K2 en la BD real?
```

### Condiciones

| ID | Condición global | Responsable | Resultado actual |
|---|---|---|---|
| GW-1 | `R1-CLASSIFICATION PASS` | R1 | PASS |
| GW-2 | Snapshot K2 inmediato y drift `0` | Operación K2 | debe comprobarse de nuevo |
| GW-3 | Dry-run final por PK/columna, reversible y sin heurísticas | K2a/K2b/R10 | no autorizado todavía |
| GW-4 | Ambiguos excluidos o persistidos en contrato aprobado; cero selección implícita | R1/R2/R3/K3/K8b | FAIL actual |
| GW-5 | 14 F aisladas o resueltas con evidencia | R4 | FAIL actual |
| GW-6 | Precio, histórico y presentaciones cumplen sus invariantes | R5/K8a/K9 | FAIL actual |
| GW-7 | Conversión/coste propaga estados, nunca cero silencioso | R8/K4/K6/K7 | FAIL actual |
| GW-8 | Los 13 writers están controlados y no hay writer oculto | R9/K5/K11/K12 | FAIL actual |
| GW-9 | Rollback exacto, observabilidad y responsable operativo | Operación K2 | no autorizado todavía |
| GW-10 | Aprobación explícita de escritura y freeze oficial durante la ventana | Propiedad/Operación | FAIL: no autorizado |

### Definición

```text
K2 WRITE AUTHORIZED
```

Solo puede declararse cuando GW-1 a GW-10 pasan. El `DRY-RUN PASS` no lo implica.

La condición persistente que bloqueó la ejecución anterior queda reflejada en GW-4, no en R1-CLASSIFICATION. Las invariantes globales y los writers siguen protegiendo la escritura; no se eliminan.

## J. DAG corregido

No se inventan fases K nuevas. Se separan el resultado read-only y la autorización de escritura dentro del DAG aprobado:

```text
K1
 ↓
R1-CLASSIFICATION PASS
 ↓
K2a — preflight/clasificación read-only
 ↓
K2b — dry-run determinista por PK/columna
 ↓
R2/R3/R4/R5/R8/R9 según dependencias del plan
 ↓
K3 → K5 → K8a → K6 → K7 → K8b → K9 → K4 → K10 → K11 → K12
 ↓
R10 — dry-run final y gates
 ↓
GLOBAL K2 WRITE GATE
 ↓
K2 WRITE AUTHORIZED
 ↓
K2 WRITE, solo con aprobación explícita
```

La escritura real de K2b no se adelanta por declarar R1 PASS. El DAG de fases y la autorización global siguen siendo independientes.

## K. Dependencias

| Dependencia | Desde | Hacia | Motivo |
|---|---|---|---|
| R1 clasificación | K1 | K2a | el preflight necesita alcance y estados reproducibles |
| Evidencia de presentations | R1 | R2/R3/R5 | no se resuelve proveedor/precio sin raw clasificado |
| 14 F | R1 | R4/K8b | la revisión humana no debe mezclarse con R1 |
| Writers | R1 | R9/K5/K11 | control global antes de cualquier escritura |
| Conversión/coste | K8a | R8/K6/K7 | el motor debe tener fuente canónica |
| Precio/histórico | K8b | R5/K9 | precio solo desde presentación verificada |
| Dry-run final | todas | R10 | una escritura necesita evidencia conjunta |

## L. Criterios PASS/FAIL

### `R1-CLASSIFICATION PASS`

**PASS si:** se cumplen R1-1 a R1-7, con 216 filas, ninguna propuesta de conversión y cero DML.  
**FAIL si:** falta una PK, falta raw/causa/estado, aparece una propuesta de unidad/factor/presentation, o se modifica una fila.

### `GLOBAL K2 WRITE GATE`

**PASS si:** GW-1 a GW-10 pasan, incluido snapshot fresco, drift cero, rollback, writers controlados, invariantes aplicables, exclusión de ambiguos y aprobación explícita.  
**FAIL si:** existe cualquier ambigüedad seleccionada, writer activo, presentación desconocida, precio sin unidad, conversión silenciosa, invariante global no satisfecha o falta aprobación.

## M. Riesgos

- Declarar R1 PASS no crea una cola persistente ni resuelve los 216 mappings.
- La materialización prematura de `REQUIRES_REVIEW` podría inventar otra fuente de verdad; por eso permanece bloqueada en GW-4.
- Los 13 writers continúan siendo riesgo global aunque R1 read-only pase.
- Las seis invariantes globales pueden fallar fuera del alcance de R1; esa separación no reduce sus gates propietarios.
- No hay entorno de pruebas; cualquier WRITE futuro seguirá requiriendo snapshot, freeze, shadow y rollback en BD real.

## N. Próximo paso

El próximo paso permitido es aprobar documentalmente esta separación. Después, una fase posterior puede definir el contrato de persistencia de R1/K3/K8b. No se ejecuta Fase 2 ni K2 en esta tarea.

## Estado final

```text
R1-CLASSIFICATION PASS = DOCUMENTAL/READ-ONLY
R1-PERSISTENCE READY = NO
GLOBAL K2 WRITE GATE = FAIL
K2 WRITE AUTHORIZED = NO
DATOS MODIFICADOS = NO
FREEZE = INACTIVE
K2 = NO EJECUTADA
FASE 2 = NO EJECUTADA
```
