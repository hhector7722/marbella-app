---
documento: DOMINIO-PRECIOS-Y-COMPRAS
clase: vivo
estado: vigente
capa: ingenieria
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-07-29
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

## 2. Los dos modos de llegar al precio

| Modo | Qué se declara | Cómo se obtiene el precio actual |
|---|---|---|
| Por unidad de compra | El precio y la unidad | Se introduce directamente |
| Por pack | El precio del pack, cuántas unidades trae y el contenido de cada unidad | **Lo deriva la base de datos**: precio del pack entre unidades por contenido de cada unidad, expresado en la unidad de compra |

En el modo por pack **el precio actual es un valor derivado y no se escribe a mano**. La interfaz puede previsualizarlo, pero la fuente del cálculo es la base de datos. Es una aplicación del principio 3: un solo productor por magnitud.

El modo por pack no se activa hasta que están declarados todos los campos que necesita el cálculo. Activarlo antes provocaría un fallo del cálculo.

### Unidad homogénea

Si el proveedor cobra por unidad pero el contenido de cada pieza es volumen o masa, **la unidad de compra que se guarda es litro o kilo, no unidad**. Ejemplo: precio por botella con 740 mililitros de contenido se guarda como euros por litro.

El motivo es que el coste debe ser homogéneo para el cálculo de recetas. Un escandallo pide gramos o mililitros, no botellas.

---

## 3. Cuándo un albarán cambia el precio

```
precio nuevo = precio unitario de la línea / factor de conversión del mapeo
```

El resultado debe ser euros por unidad de compra del ingrediente. Si no lo es, el factor está mal.

**Un albarán no cambia el precio de un ingrediente hasta que existen dos cosas: un mapeo entre el nombre del proveedor y el ingrediente, y un factor de conversión válido.** Sin factor válido no se actualiza nada y el sistema lo avisa.

El precio se actualiza al insertar una línea de albarán y al editar una línea ya mapeada. Los dos caminos aplican la misma fórmula y registran el mismo historial. Es deliberado: dos caminos, una regla.

### Precio fijo

Un ingrediente puede marcarse como **precio fijo**, y entonces ningún albarán lo cambia. En ese caso el sistema sigue registrando el último precio conocido del proveedor —información útil para negociar— pero **no toca el precio del ingrediente ni su historial**.

Sin precio fijo, **manda el último proceso que escriba**, sea manual o desde albarán. No hay jerarquía entre ellos.

### Lo que un albarán nunca cambia

La actualización automática **solo cambia el importe**. No modifica la unidad de compra, ni la unidad de receta, ni el modo de precio, ni la composición del pack.

Esto protege una configuración que ha costado establecer. Un escáner o un mapeo automático no debe deshacer el trabajo de quien configuró el ingrediente.

La pantalla de revisión de precios sí puede reconfigurar unidades, pero solo cuando una persona completa el asistente y lo aplica de forma explícita.

Además, el precio solo se escribe **si el valor calculado difiere del actual**, con una tolerancia mínima. Evita historial de ruido.

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

Cuando el ingrediente es por pack con contenido declarado por unidad, el sistema **puede enlazar una receta expresada en unidades con una compra expresada en kilos o litros**, y a la inversa. Es la misma lógica que usa el consumo personal.

La conversión existe en dos sitios, cliente y base de datos, y **deben dar el mismo resultado**. Una divergencia entre ambos es un defecto grave, no una diferencia de precisión.

---

## 6. Invariantes

1. El precio de un ingrediente siempre está expresado en euros por su unidad de compra.
2. En modo por pack, el precio actual es derivado y nunca se escribe directamente.
3. Un albarán sin mapeo y sin factor válido no cambia ningún precio.
4. Un ingrediente con precio fijo no cambia nunca desde un albarán.
5. Una actualización desde albarán no altera unidades ni modo de precio.
6. El coste de una receta calculado en cliente y en base de datos coincide.
