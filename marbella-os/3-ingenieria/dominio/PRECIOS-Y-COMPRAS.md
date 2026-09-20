---
documento: DOMINIO-PRECIOS-Y-COMPRAS
clase: vivo
estado: vigente
capa: ingenieria
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-09-20
caducidad: 6 meses
supersede: context/INGREDIENTS_PRECIOS_Y_ALBARANES.md
---

# DOMINIO · Precios de ingrediente y compras

Qué número es el precio de un ingrediente, cómo se llega a él desde cualquier forma de facturar de un proveedor, y cuándo un albarán lo cambia.

Términos en [GLOSARIO](../../GLOSARIO.md). Capacidades relacionadas: [compras y albaranes, inventario, recetas](../../1-producto/MAPA-DE-CAPACIDADES.md).

---

## 1. El precio es uno

**Solo existe un precio de ingrediente: el precio actual, expresado en euros por unidad de compra del ingrediente.** Típicamente euros por kilo, por litro o por unidad.

No hay dos precios en paralelo. No hay precio de catálogo y precio de albarán. Todo lo que consume coste —recetas, mermas, consumo personal, escandallos— lee ese único valor.

**Un proveedor puede cobrar por kilo, por litro, por unidad suelta o por caja. El sistema normaliza todo a un solo coste unitario.** De ahí la aparente complejidad: hay muchas entradas y un único destino.

---

## 2. Precio y presentación son conceptos distintos

`ingredients.current_price` y `ingredients.purchase_unit` forman la única
autoridad económica viva. El precio puede llegar por dos operaciones y ambas
persisten exactamente la misma magnitud:

| Operación | Entrada | Resultado |
|---|---|---|
| Confirmación K4 | Precio observado y presentación versionada del proveedor | Normaliza, confirma y escribe el precio canónico con origen `receipt_confirmation` |
| Cambio manual | Nuevo importe positivo | Conserva `purchase_unit` y escribe el precio canónico con origen `manual` |

Una caja, botella o pieza facturada es una **presentación del proveedor**, no
un segundo precio del ingrediente. Sus datos viven en la versión de mapeo de
compra. Los campos legacy `supplier_pricing_mode` y `pack_*` pueden conservarse
temporalmente como puente físico para conversiones antiguas, pero no producen
ni sobrescriben `current_price`.

La base de datos rechaza cualquier tercer writer. El cambio manual exige
`manager` o `admin`, registra actor e histórico, no modifica stock y tampoco
cambia unidades. `price_locked` solo impide el cambio automático desde un
albarán; nunca bloquea un cambio manual explícito.

### Unidad homogénea

Si el proveedor cobra por unidad pero el contenido de cada pieza es volumen o masa, **la unidad de compra que se guarda es litro o kilo, no unidad**. Ejemplo: precio por botella con 740 mililitros de contenido se guarda como euros por litro.

El motivo es que el coste debe ser homogéneo para el cálculo de recetas. Un escandallo pide gramos o mililitros, no botellas.

---

## 3. Cuándo un albarán cambia el precio

```
precio nuevo = precio unitario de la línea / factor de conversión del mapeo
```

El resultado debe ser euros por unidad de compra del ingrediente. Si no lo es, el factor está mal.

**Un albarán no cambia el precio de un ingrediente hasta que existen tres cosas: un mapeo versionado entre el nombre del proveedor y el ingrediente, un factor de conversión válido y una confirmación económica explícita de `manager` o `admin`.** Sin una de ellas no se actualiza nada.

Capturar una línea, extraerla con visión artificial o proponer un mapeo nunca actualiza el precio. `apply_receipt_line(...)` aplica la fórmula solo después de una vista previa y una confirmación autorizada; registra el histórico con actor, documento, línea, movimiento y versión de mapeo. Los disparadores heredados que cambiaban precio al insertar o mapear una línea están retirados de este flujo.

### Precio fijo

Un ingrediente puede marcarse como **precio fijo**, y entonces ningún albarán lo cambia. En ese caso el sistema sigue registrando el último precio conocido del proveedor —información útil para negociar— pero **no toca el precio del ingrediente ni su historial**.

Sin precio fijo, **manda el último proceso que escriba**, sea manual o desde albarán. No hay jerarquía entre ellos.

### Lo que un albarán nunca cambia

La actualización automática **solo cambia el importe**. No modifica la unidad de compra, ni la unidad de receta, ni el modo de precio, ni la composición del pack.

Esto protege una configuración que ha costado establecer. Un escáner o un mapeo automático no debe deshacer el trabajo de quien configuró el ingrediente.

La configuración de unidades pertenece al asistente de ingredientes, con aplicación explícita. La pantalla histórica de precios desde albarán no aplica cambios en K4; una recepción solo cambia el importe canónico sin reconfigurar la unidad ni el pack.

Además, el precio solo se escribe **si el valor calculado difiere del actual**, con una tolerancia mínima. Evita historial de ruido.

### Interpretación antes del mapeo

La semántica del formato documental de cada proveedor vive en los
[perfiles versionados de albarán](../albaranes-proveedores/README.md). El
perfil interpreta evidencia estructurada y entrega una propuesta o
`needs_review`; no es un mapeo de artículo a ingrediente ni puede cambiar una
magnitud económica. La propuesta conserva la versión de perfil y solo puede
seguir hacia un mapeo seguro, revisión humana y la confirmación K4.

---

## 4. Matriz de patrones de facturación

Los patrones observados en albaranes reales de los proveedores habituales. Los ejemplos están en `reference/legacy-bdp/ejemplos-albaranes`.

| Patrón en el papel | Ejemplo | Cantidad en la línea | Precio unitario | Ingrediente | Factor |
|---|---|---|---|---|---|
| Precio por caja, unidades y volumen en la descripción | Leche 1,5 L, 6 por caja, 4 cajas | Cajas | Por caja | Por pack | Normalmente 1 |
| Precio por unidad con tamaño en el texto | Refresco de 33 cl, salsa de 740 ml | Unidades entregadas | Por unidad | Por pack con unidad homogénea | 1 |
| Precio por kilo | Patata, cebolla | Kilos | Por kilo | Por unidad de compra en kilos | 1 |
| Peso variable: piezas y kilos facturados | 2 piezas, 7,60 kg, precio por kilo | **Kilos totales**, no piezas | Por kilo | Kilos | 1 |
| Peso variable con bultos | 3 bultos, 16,05 kg | Kilos de la línea | Por kilo | Kilos | 1 |
| Caja de unidades pequeñas | 20 unidades de 70 ml por caja | Cajas | Por caja | Por pack | Ajustar si la unidad de stock difiere |

**Regla práctica:** el precio unitario dividido entre el factor tiene que dar euros por unidad de compra del ingrediente. Si el proveedor factura en kilos y el ingrediente está en kilos, la cantidad es kilos y el factor es 1, salvo que una unidad de línea represente varios kilos de catálogo.

**El error más frecuente** es introducir piezas donde el proveedor factura peso. En una línea de peso variable, la cantidad es el peso, no el número de piezas.

---

## 5. Conversión en recetas

Una línea de receta se expresa en gramos, kilos, mililitros, centilitros, litros o unidades. El coste convierte esa cantidad a la unidad de compra del ingrediente.

Cuando existe una equivalencia física declarada, el sistema **puede enlazar una receta expresada en unidades con una compra expresada en kilos o litros**, y a la inversa. Esa equivalencia convierte cantidades; nunca produce el precio actual. Es la misma lógica que usa el consumo personal.

La conversión existe en dos sitios, cliente y base de datos, y **deben dar el mismo resultado**. Una divergencia entre ambos es un defecto grave, no una diferencia de precisión.

---

## 6. Pedido a proveedor tramitado

Un pedido a proveedor se considera **tramitado** cuando, en el último paso, se pulsa Descargar, Enviar o Proveedor. Generar el PDF o abrir el resumen no basta.

El día es el civil en `Europe/Madrid`. Si ese día ya hay un pedido tramitado para el mismo proveedor, la pantalla de pedido avisa: «Hoy ya se ha tramitado un pedido para este proveedor (Nombre).» El nombre es `profiles.first_name` de quien lo tramitó. El aviso no impide hacer otro.

El hecho se guarda en `purchase_orders.dispatched_at`. Lo produce `mark_purchase_order_dispatched`; la pantalla solo pregunta con `supplier_has_dispatched_order_today`.

---

## 7. Invariantes

1. El precio de un ingrediente siempre está expresado en euros por su unidad de compra.
2. Una presentación o equivalencia física nunca escribe el precio actual.
3. Un albarán sin mapeo y sin factor válido no cambia ningún precio.
4. Un ingrediente con precio fijo no cambia nunca desde un albarán.
5. Una actualización desde albarán no altera unidades ni modo de precio.
6. El coste de una receta calculado en cliente y en base de datos coincide.
7. Ninguna extracción automática ni captura de albarán cambia un precio o un saldo de stock.
8. Un cambio confirmado conserva el documento, la evidencia y la versión de mapeo que lo justifican.
9. Un pedido a proveedor no está tramitado hasta Descargar, Enviar o Proveedor.
10. Solo K4 y la operación manual canónica pueden escribir el precio actual; ambas registran origen y actor.
