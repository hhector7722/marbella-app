---
documento: DOMINIO-TESORERIA
clase: vivo
estado: vigente
capa: ingenieria
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-09-17
caducidad: 6 meses
depende_de: PRINCIPIOS, GLOSARIO, RECORRIDOS
supersede: —
---

# DOMINIO · Tesorería (cierre de caja)

Qué número es cada magnitud del cierre diario y cómo se obtiene el esperado. Términos en [GLOSARIO](../../GLOSARIO.md). Recorrido en [RECORRIDOS R5](../../1-producto/RECORRIDOS.md).

---

## 1. Fórmulas

```
esperado = ventas − pendiente + cobros − tarjeta
descuadre = efectivo contado − esperado
```

Equivalente, con el mismo signo de descuadre que el histórico de cierres (positivo = sobra efectivo en el cajón):

```
(ventas − pendiente + cobros) − (tarjeta + efectivo contado) = − descuadre
```

El redondeo a céntimo es el último paso. No se clampa a cero.

---

## 2. Origen de cada magnitud

| Magnitud | Qué es | Qué entra | Qué no entra |
|---|---|---|---|
| **Ventas** | Importe facturado hoy | Tickets cuyo día contable es hoy | Cobros de deuda de otra fecha |
| **Tarjeta** | Cobrado con datáfonos hoy | Pagos con tarjeta de ventas de hoy **y** de cobros de otra fecha pagados hoy con tarjeta | Efectivo |
| **Efectivo** | Cobrado en efectivo hoy | Recuento del cajón (paso 2) | Tarjeta |
| **Pendiente** | Ventas de hoy que no se pagan hoy | `cobro_pendiente` de tickets facturados hoy | Deuda antigua que sigue abierta |
| **Cobros** | Ingresos de hoy que liquidan pendiente de otra fecha | Pagos (tarjeta o efectivo) de tickets facturados otro día, cobrados hoy | Ventas de hoy |

El productor de ventas, tarjeta, pendiente y cobros es `get_closing_sales_breakdown`. El productor del esperado y del descuadre, a partir de esas magnitudes (editables) y del recuento, es `computeCashClosingBalance`.

---

## 3. Reglas

- Un cobro de otra fecha pagado con datáfono **es tarjeta y es cobro**. Sube las dos líneas. No se imputa otra vez al efectivo esperado.
- Un cobro de otra fecha pagado en efectivo **es cobro y no es tarjeta**. Sube el esperado.
- Da igual si el cliente paga dos días después o cuatro meses después: entra el día en que se cobra, no hay tope de antigüedad.
- Pendiente de hoy vive en ventas. Al cobrarse el mismo día deja de ser pendiente y pasa a tarjeta o a efectivo según la forma de pago.
- El descuadre se muestra. No se ajusta solo. Un cierre confirmado no se edita en silencio: una corrección es un movimiento nuevo con motivo, salvo orden explícita de revertir el cálculo del día.
- `COMPROBANTE` no es venta ni pendiente.

---

## 4. Cuando falta un dato

- Sin tickets del día: ventas, tarjeta de venta y pendiente quedan a cero. No se finge un cero de «no lo sé»: el cierre puede seguir con cifras tecleadas a mano desde el papel y las fotos.
- Si el puente aún no ha reenviado el ticket antiguo cobrado hoy, los cobros pueden salir del concepto 107 de caja BDP. En ese caso la tarjeta auto-rellenada **no** incluye la parte de datáfono de esos cobros: hay que copiar el total de los datáfonos. Cuando el ticket sí llega, la tarjeta auto-rellenada ya los incluye.
- Prohibido sustituir el esperado por `cobro_efectivo` de los tickets del día cuando la resta queda negativa. Esa negativa es el caso normal si la tarjeta incluye cobros de otra fecha.

---

## 5. Invariantes

| ID | Afirmación |
|---|---|
| INV-T01 | `esperado = round(ventas − pendiente + cobros − tarjeta)` |
| INV-T02 | `descuadre = round(efectivo_contado − esperado)` |
| INV-T03 | La tarjeta de auto-relleno es al menos la suma de `cobro_tarjeta` de los tickets facturados hoy |
| INV-T04 | Los cobros no forman parte de ventas |
| INV-T05 | El pendiente del día es solo de tickets facturados ese día y aún no cobrados |
| INV-T06 | El esperado no se clampa a cero |
| INV-T07 | Un cobro de deuda no tiene tope de antigüedad: entra el día en que se cobra |
