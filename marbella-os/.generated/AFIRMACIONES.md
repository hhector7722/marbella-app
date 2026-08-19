<!-- Generado desde 39 documentos de marbella-os/.
     Huella del origen: 555af58ffd022ec2
     NO EDITAR A MANO: se regenera con `npm run generate:corpus`, y
     `npm run validate:corpus` compara este fichero con lo que produce
     el generador. Cualquier edición manual se detecta. -->

# Afirmaciones citables

Los 39 hechos del corpus que tienen identificador estable, con dónde
viven y desde cuántos sitios se citan. Derivado. **No es norma**: la norma está
en el documento de origen, y este índice solo dice dónde.

Para reutilizar un hecho que ya está escrito, cita su identificador. Copiar el
texto crea un segundo dueño, y eso es exactamente lo que prohíbe `CANON §5`.

| Identificador | Afirmación | Documento | Precedencia | Citas |
|---|---|---|---|---|
| `AF-DERIVADO-NO-SE-EDITA` | Regla: si un fichero se puede derivar, se deriva; si se deriva, no se edita; si no se edita, no se discute. | `marbella-os/CANON.md` | 100 |  |
| `AF-DUENO-UNICO` | **Cada hecho vive en exactamente un documento. Los demás enlazan, no copian.** | `marbella-os/CANON.md` | 100 | 4 |
| `AF-MODAL-NAV-NO-ES-LAYER` | - **Navegación padre→hijo ≠ layer ≠ z-index ≠ pila de Escape.** Relación explícita: `parentInstance` + `instance`. No se infiere por cima d… | `marbella-os/2-diseno/SISTEMA-DE-COMPONENTES.md` | 20 | 1 |
| `AF-NO-NORMATIVO-NO-AUTORIZA` | **Un documento con `normativo: false` no autoriza nada**, con independencia de lo que afirme su texto y de lo asertivo que suene. Todo `6-i… | `marbella-os/CANON.md` | 100 |  |
| `INV-$01` | `estimatedValue = priceWeekOvertime(...)` únicamente | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 | 6 |
| `INV-$02` | `weekly_snapshots.total_cost ≡ estimatedValue` tras persist Cost | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 | 3 |
| `INV-$03` | SQL **no** calcula dinero | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 | 1 |
| `INV-$04` | Determinismo de coste: mismo `LiquidationResult` + mismos overrides de tarifa + misma versión Cost Engine ⇒ mismo `estimatedValue` | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 | 2 |
| `INV-C01` | `carryIn(timelineStart) = 0` | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 | 7 |
| `INV-C02` | `carryIn(W+1) = carryOut(W)` | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 | 5 |
| `INV-C03` | `balanceFinal(W) = R(carryIn(W) + weeklyBalance(W))` | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 | 4 |
| `INV-C04` | `carryOut(W) = computeCarry(carryIn, parts, isPaid).carryOut` | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 |  |
| `INV-C05` | Si `balanceFinal ≤ 0` y no pagada: `carryOut = balanceFinal` | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 |  |
| `INV-C06` | Si `isPaid = true`: `carryOut = min(0, balanceFinal)` | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 |  |
| `INV-C07` | Si régimen **pago puro** y `balanceFinal > 0` y no pagada: `carryOut = 0` | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 |  |
| `INV-C08` | Si régimen **bolsa pura** y `balanceFinal > 0` y no pagada: `carryOut = balanceFinal` | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 |  |
| `INV-C09` | Deuda nunca se “paga”: `carryOut ≤ 0` cuando `balanceFinal ≤ 0` | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 |  |
| `INV-C10` | ≤ 1 tramo abierto por empleado; sin solapes en `hours_contract_terms` | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 | 3 |
| `INV-D01` | **Mismos hechos** + **mismos overrides** + **misma versión Hours Engine** + **misma versión Cost Engine** ⇒ **misma proyección de resultado… | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 | 13 |
| `INV-J01` | Tras writer: `pending_balance = carryIn` | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 | 7 |
| `INV-J02` | Tras writer: `final_balance = balanceFinal` | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 | 1 |
| `INV-J03` | Tras writer: `balance_hours = weeklyBalance` | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 | 1 |
| `INV-J04` | Tras writer: `ordinary_hours / extra_hours / total_hours / contracted_hours_snapshot` = campos HE | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 | 4 |
| `INV-J05` | Shadow post-cutover: vector HE ≡ proyección de resultados (identidad), no “dos motores” | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 | 1 |
| `INV-J06` | **Regenerabilidad:** los **resultados calculados** de la proyección son completamente regenerables a partir de: `time_logs` + `hours_contra… | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 | 7 |
| `INV-J07` | Los **overrides** (`is_paid`, `prefer_stock_hours_override`, `overtime_price_snapshot`) son **hechos de entrada**, no regenerables desde fi… | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 | 9 |
| `INV-J08` | La **metadata de generación** no participa en INV-D01 / INV-J06 como input de liquidación; puede cambiar en cada write sin alterar el domin… | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 | 2 |
| `INV-L01` | `hoursWorked = Σ horas computables de la semana (hechos)` | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 | 4 |
| `INV-L02` | `weeklyBalance = Σ weeklyBalancePart(segmentos)` | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 |  |
| `INV-L03` | `ordinaryHours + overtimeHours` coherente con régimen/contrato efectivo | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 |  |
| `INV-L04` | Días `pre_alta` / `gap` / `post_baja` no aportan jornada ordinaria de contrato | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 |  |
| `INV-L05` | Determinismo de liquidación: mismos hechos + mismos overrides ⇒ mismo `LiquidationResult` **para una versión dada del Hours Engine** | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 | 1 |
| `INV-P01` | `effectivePreferStock = override ?? (todos los segmentos bagMode)` | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 | 3 |
| `INV-P02` | `netPayable = f(LiquidationResult, effectivePreferStock)` (única función) | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 |  |
| `INV-P03` | Si `carryOut < 0` ⇒ `displayExtras = 0` | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 | 1 |
| `INV-P04` | Si `carryOut < 0` ⇒ `estimatedValue = 0` | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 | 2 |
| `INV-P05` | Si `effectivePreferStock` y `netPayable = 0` ⇒ `estimatedValue = 0` | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 |  |
| `INV-P06` | `displayPendientes = carryIn` | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 |  |
| `INV-P07` | `displayHoras = hoursWorked` | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | 80 | 1 |

La columna de citas mide cuánto se apoya el corpus en cada hecho. Un
identificador muy citado es un punto que no debería cambiar sin revisar quién
lo usa; uno sin citas todavía no le hace falta a nadie.
