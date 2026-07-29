---
documento: PRINCIPIOS
clase: constitucional
estado: vigente
capa: producto
responsable: propiedad del producto
revisado: 2026-07-29
caducidad: 12 meses
supersede: .cursor/rules/BAR-LA-MARBELLA-AI-OPERATING-PROTOCOL.mdc (como origen de norma de producto)
---

# PRINCIPIOS — Criterios de arbitraje

Diez principios. Su función no es inspirar, es **decidir**: cuando dos soluciones son técnicamente válidas, gana la que respeta el principio de orden más alto.

Un principio enuncia el criterio. La norma medible vive en el documento que lo aplica, y se cita en cada principio. Ningún principio repite la norma: eso lo prohíbe [CANON §5](../CANON.md#5-dueño-único-por-hecho).

Estos principios estuvieron durante años implícitos en la configuración de las herramientas de desarrollo. Escribirlos aquí los convierte en norma del producto, independiente de la herramienta que se use para construirlo.

---

## 1. La mano es el cursor

El puesto de trabajo real es un dedo sobre un cristal, de pie, con prisa y a veces con las manos mojadas. No hay ratón, no hay precisión y no hay segunda oportunidad para acertar en un objetivo pequeño.

**Implica:** todo lo que se pueda pulsar tiene tamaño de dedo; las zonas de acción no se desplazan ni se encogen cuando el contenido crece; nada crítico queda al alcance solo de un gesto.

Norma medible en [2-diseno/EXPERIENCIA.md](../2-diseno/EXPERIENCIA.md).

## 2. El sistema grita, no susurra

Un dato vital que falta, una conexión caída o un cálculo que no cuadra deben ser visibles de inmediato. Una pantalla que se queda en blanco, un total que aparece como cero cuando en realidad es «no lo sé», o un error registrado solo en la consola son fallos más graves que una caída completa: producen decisiones equivocadas con apariencia de normalidad.

**Implica:** prohibido silenciar la ausencia de datos vitales; ante la duda entre asustar y engañar, se asusta.

Norma medible en [2-diseno/EXPERIENCIA.md](../2-diseno/EXPERIENCIA.md) y [3-ingenieria/FRONTEND.md](../3-ingenieria/FRONTEND.md).

## 3. Una magnitud, un productor

Cada cifra del negocio tiene exactamente un componente que la calcula. Todo lo demás la lee. Dos productores de la misma magnitud significan, tarde o temprano, dos respuestas distintas a la misma pregunta, y entonces el sistema deja de ser fuente de verdad.

**Implica:** la interfaz nunca calcula negocio, lo pinta; una pantalla no ejecuta lógica de negocio al cargar; añadir un segundo camino de cálculo requiere una decisión registrada.

Consecuencia principal en [ADR-0001](../4-decisiones/ADR-0001-hours-engine-productor-unico.md).

## 4. El dinero no se estima

Precios, costes, horas y saldos son exactos hasta el último paso. No se redondea a mitad de un cálculo, no se aproxima «porque la diferencia es pequeña» y no se confunde nunca precio de venta con coste.

**Implica:** precisión completa en el cálculo y redondeo solo en la presentación; toda cifra de dinero es trazable hasta sus hechos de origen; un descuadre se muestra, no se ajusta.

Normas en [3-ingenieria/dominio/](../3-ingenieria/dominio/).

## 5. El tiempo es local

El negocio ocurre en un sitio, con un horario y un calendario concretos. Un día empieza cuando abre el bar, no a medianoche universal. Interpretar una fecha en la zona equivocada produce errores silenciosos de un día entero: una hora en la semana anterior, una venta en el turno de ayer.

**Implica:** las fechas se construyen y comparan siempre en el tiempo local del negocio; ningún dato horario procedente de un sistema externo se usa sin normalizar antes.

Normas en [3-ingenieria/FRONTEND.md](../3-ingenieria/FRONTEND.md) y [3-ingenieria/integraciones/](../3-ingenieria/integraciones/).

## 6. Un dato se introduce una vez

Si una persona teclea algo que el sistema ya sabe, o podría saber, el producto ha fallado. Cada reintroducción es tiempo perdido y una oportunidad de discrepancia.

**Implica:** preferir importar antes que pedir; aprender de lo que ya se corrigió una vez; nunca pedir confirmación de un dato que el sistema puede verificar solo.

## 7. La operación no se detiene

Fichar, cobrar y cerrar caja son funciones de las que depende que el negocio siga abierto. Su disponibilidad tiene prioridad absoluta sobre cualquier otra consideración, incluida la elegancia técnica y la coherencia visual.

**Implica:** la interfaz aparece antes que los datos; una sección lenta no bloquea la pantalla; un fallo en una capacidad no arrastra a las demás.

Norma medible en [2-diseno/EXPERIENCIA.md](../2-diseno/EXPERIENCIA.md).

## 8. Cada dato tiene un dueño y una cerradura

Quién puede ver y quién puede cambiar cada cosa es parte del diseño, no una capa que se añade después. En un sistema que contiene nóminas, horas y dinero, un permiso mal puesto es un incidente laboral.

**Implica:** la protección vive en el dato, no solo en la pantalla; toda tabla nueva nace protegida; toda acción de servidor verifica identidad y permiso por sí misma.

Normas en [SEGURIDAD](../3-ingenieria/SEGURIDAD.md).

## 9. Lo que se ve tiene un solo origen

Un color, un radio, una sombra o un espaciado se definen una vez con un nombre que explique su papel, y se consumen desde ahí. Un valor escrito directamente en un componente es un valor que nadie puede cambiar sin buscarlo por todo el producto.

**Implica:** el origen de todo valor visual es el contrato de tokens; una excepción visual se documenta o no existe.

Contrato en [2-diseno/TOKENS.md](../2-diseno/TOKENS.md).

## 10. La regla del negocio manda sobre la convención

Este negocio no funciona como el manual. La semana laboral, el tratamiento de las horas extras, el calendario de eventos y la relación entre coste y venta tienen reglas propias, a veces contraintuitivas y casi siempre heredadas de cómo se hacía antes.

**Implica:** prohibido asumir la regla estándar cuando existe una regla propia; ante una fórmula heredada, se replica su intención, no su sintaxis; una regla de negocio sin documentar es un riesgo, no un detalle.

Normas en [3-ingenieria/dominio/](../3-ingenieria/dominio/).

---

## Orden de prioridad

Cuando dos principios entran en conflicto, este es el orden:

```
7. La operación no se detiene
2. El sistema grita, no susurra
8. Cada dato tiene un dueño y una cerradura
3. Una magnitud, un productor
4. El dinero no se estima
5. El tiempo es local
10. La regla del negocio manda
1. La mano es el cursor
6. Un dato se introduce una vez
9. Lo que se ve tiene un solo origen
```

La lectura del orden: **primero que funcione, luego que sea honesto, luego que sea seguro, luego que sea correcto, y por último que sea cómodo y bonito.** No al contrario.

Este orden no autoriza a ignorar los últimos principios: autoriza a decidir cuando son incompatibles, lo cual es infrecuente. Un producto que sacrifica sistemáticamente los principios 1, 6 y 9 acaba siendo inusable, y entonces incumple también el 7.
