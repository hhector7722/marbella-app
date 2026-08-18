---
documento: SISTEMA-DE-COMPONENTES
clase: vivo
estado: vigente
capa: diseno
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-08-19
caducidad: 6 meses
supersede: —
---

# SISTEMA DE COMPONENTES — Contrato

Inventario canónico de los componentes de Marbella y el contrato de cada uno. **Es contrato, no implementación**: describe qué debe hacer un componente y qué no, no cómo está escrito hoy.

Un componente que exista en el código y no esté aquí es una pieza local, no del sistema. Un componente que esté aquí y no exista en el código es una carencia declarada, y hay varias.

Las tres capas del inventario tienen contratos de rigor distinto:

- **Base** — los ladrillos. Contrato estricto y sin variantes improvisadas.
- **Sistema** — piezas transversales con comportamiento propio. Contrato estricto.
- **Dominio** — piezas de una capacidad concreta. Su contrato lo fija la capacidad; aquí solo se declara la frontera.

---

## 1. Componentes base

Los que sostienen toda pantalla. **Button ya existe** (piloto de footers). Campo, tarjeta, insignia y vacío siguen reconstruyéndose pantalla a pantalla, y esa sigue siendo una causa de deriva visual.

### Botón

**Propósito**: ejecutar una acción.

**Anatomía**: un único `<button>`. Icono opcional a la izquierda. Etiqueta de texto. Icon-only (48×48) sin etiqueta, con `aria-label` obligatorio.

```text
Button
 ├── icon?
 └── label?
```

**Variantes** (cerradas; nombres de código): `primary`, `secondary`, `tertiary`, `destructive`. No existe `success`, `positive`, `emerald`, `ghost`, `danger` ni quinta variante. Layout `hug` / `fill` no son variantes semánticas: el default visual es **`hug`** (ancho = contenido + padding horizontal). `fill` / ancho completo solo cuando el consumidor lo declara. El host táctil mide `tactil.minimo` (48 px): área de toque transparente; no obliga al fondo visual. El fondo visual compacto es independiente: 12 px de tipo + `espacio.2` arriba y abajo = 28 px. Padding horizontal compacto: `espacio.2`. Radio contractual del Button: 8 px (`espacio.2`), estrictamente menor que la mitad del alto visual (14 px) para dejar tramo recto, no píldora. No usa `radio.superficie` (16 px), que permanece en Modal. Icon-only conserva superficie visual 48×48. La prop `icon` existe; el Footer de Modal no la usa.

**Estados**: reposo, hover (sin scale-up), pulsado (`scale(0.95)`), foco visible (anillo de marca), en curso (equivale a deshabilitado + spinner a la izquierda), deshabilitado (opacity 50). El estado visual de error no se implementa en v1: el error vive en el campo o el aviso.

**Identidad**: `data-component="Button"`, `data-variant`, `data-instance` (id de negocio). El aspecto lo bloquea CSS por atributo; `className` solo admite composición externa (`flex-1`, `shrink-0`, `self-*`, posicionamiento).

**Reglas**:
- En curso, deshabilita su propia pulsación. Nunca dos efectos por dos toques.
- La variante destructiva no comparte aspecto con la principal ni se coloca junto a ella.
- Un botón sin etiqueta necesita nombre accesible.
- El icono no va a la derecha.
- No se usa para navegar. Navegar es un enlace, aunque parezca un botón.
- El chrome close/back de Modal y Navbar no es este componente. Tampoco `DashboardShortcut`.
- El Footer de Modal no convierte los botones en `fill`; el consumidor decide.
- El Footer de Modal usa Button solo con texto, sin `icon`. Icon-only sigue permitido fuera de ese pie.
- El radio contractual es 8 px (`espacio.2`). No píldora: el radio es menor que la mitad del alto visual. Distinto de `radio.superficie` del Modal. El consumidor no puede sobrescribirlo.

**Código**: `src/components/ui/button.tsx`, `src/lib/design-system/button-contract.ts`.

**Estado**: existe. Piloto: footers de Modal en Albaranes y Caja/Tesorería. `fill` retenido solo donde hay jerarquía explícita de pie (avance de cierre de caja; canje single-box). El resto de la aplicación sigue con recetas locales. `ActionButton` se retiró.

### Campo de entrada

**Propósito**: recoger un dato.

**Anatomía**: etiqueta, campo, texto de ayuda o de error.

**Estados**: vacío, con contenido, con foco, deshabilitado, con error.

**Reglas**:
- Tamaño de texto suficiente para no provocar zoom automático en el móvil.
- El error se muestra junto al campo y describe qué falta, no que «hay un error».
- Los campos numéricos no muestran los controles nativos de incremento.
- Nada de lo escrito se pierde por navegar o por un fallo de red.

**Estado**: sin componente.

### Tarjeta

**Propósito**: agrupar información con una responsabilidad única.

**Anatomía**: superficie con radio de control, borde de un píxel, elevación mínima, relleno estándar.

**Variantes**: informativa, pulsable, con cifra protagonista.

**Reglas**:
- Una tarjeta, una pregunta.
- Si es pulsable, toda su superficie lo es.
- No anida tarjetas: dentro de una tarjeta se usan zonas hundidas, no tarjetas.

**Estado**: sin componente. Es el patrón visual más repetido del producto y el que más se ha desviado.

### Insignia de estado

**Propósito**: comunicar un estado con una palabra.

**Reglas**:
- Color **y** texto. Nunca solo color.
- Vocabulario cerrado por capacidad; no se inventan estados nuevos en la pantalla.

**Estado**: sin componente.

### Estado vacío

**Propósito**: explicar por qué no hay nada y qué hacer.

**Variantes**: nada todavía, nada que coincida, no se pudo cargar.

**Reglas**: las tres variantes son obligatoriamente distinguibles, según [EXPERIENCIA §7](EXPERIENCIA.md#7-vacío). La tercera se comporta como un error.

**Estado**: sin componente. Es la carencia más peligrosa del inventario: sin pieza común, la variante de fallo se confunde sistemáticamente con la de ausencia.

### Aviso

**Propósito**: comunicar el resultado de una acción o una condición del sistema.

**Variantes**: positivo, negativo, advertencia, informativo, crítico.

**Reglas**:
- El positivo desaparece solo; el negativo permanece hasta que se atiende.
- No tapa el dato necesario para el paso siguiente.
- No expone detalle técnico.

**Estado**: parcial. Existe una biblioteca de avisos flotantes; no existe el aviso embebido.

---

## 2. Componentes de sistema

Piezas transversales con comportamiento propio y contrato estricto. **Estas sí existen.**

### Modal

**Propósito**: abrir una capa de trabajo o de confirmación sobre la pantalla actual.

**Anatomía**: capa de oscurecimiento, panel con cabecera fija, cuerpo desplazable, pie fijo de acciones (`footer`).

**Variantes**: `compact`, `standard`, `work`, `day`, `amplify`. Catálogo y anchos en [PATRONES P2](PATRONES.md#p2--modal).

**Reglas**:
- Respeta el área segura del dispositivo y usa el alto visible real, nunca el teórico.
- Atenúa y desactiva las barras fijas de la aplicación mientras está abierto.
- Cabecera fija (`estructura.cabecera-modal` = 36px) y pie no se desplazan; el pie no se encoge. El contenido de cabecera (título, iconos, acciones) se adapta tipográficamente; no se trunca el título por la altura. Botones de cabecera (chrome) independientes de Button, cuadrados al alto de la cabecera.
- **Inset horizontal único de cabecera:** `espacio.4` (16 px, ref. Albaranes). Título, subtítulo y texto de cabecera empiezan en el mismo punto. El chrome de la derecha no reserva un hueco simétrico a la izquierda. `headerCompact` y `headerTitleAlign` no cambian ese inicio.
- **Título y subtítulo van en la misma fila.** El título lleva la jerarquía principal (`font-black`). El subtítulo es menor y de peso medio, nunca negrita pesada. Si el texto no cabe, se recorta en esa fila; la cabecera no crece por encima de 36 px.
- **Separación Header → Body:** exactamente 12 px (`espacio.3` / `estructura.modal-cuerpo-inicio`) como `padding-top` del Body. No es padding completo del Body. El consumidor no decide ni elimina esa distancia (`pt-0` en hijos no la anula).
- Radio único del panel: `radio.superficie` (16 px). El consumidor no puede sobrescribirlo con `className`.
- **Nesting:** máximo una superficie derivada sobre el modal base ([ADR-0007](../4-decisiones/ADR-0007-modal-superficie-derivada.md)). Backdrop por capa sin blur acumulado ([ADR-0008](../4-decisiones/ADR-0008-modal-backdrop-capas.md)).
- Cero scroll horizontal en Modal, Header, Body, Footer y tablas internas.
- Cerrar con cambios sin guardar pide confirmación. El consumidor usa `layer="system"`, no un segundo modal de tarea.
- **Declara identidad estable** (`data-component="Modal"`, `data-variant`, `data-instance`, `data-layer`). `data-instance` es el id de negocio; la prop `instance` lo emite. `usageId` es un alias de implementación para telemetría, no una vía para overlays propios.
- **Portal, Escape, bloqueo de desplazamiento y backdrop los posee este componente.** El consumidor no monta otro `createPortal` de overlay, no pinta `fixed inset-0` de modal, no elige z-index numérico y no inventa un fondo.
- Si el contrato no cubre el comportamiento pedido, se para y se pregunta. No se abre un overlay paralelo.

**Excepción**: `ConsumptionBottomSheet` — hoja inferior de consumo; comparte portal/capas/Escape/scroll; no es Modal centrado ni vía libre de overlays nuevos.

**Código**: `src/components/ui/modal.tsx`, `src/components/ui/ConsumptionBottomSheet.tsx`, `src/lib/design-system/modal-*.ts`.

**Estado**: contrato oficial + ampliación visual/capas implementados en infra; consumidores legacy pendientes de migración (piloto previsto: Albaranes). El contrato puede evolucionar; el cambio pasa por este documento, las ADR si la decisión es estructural, y después el código.

### Estructura de pantalla de detalle

**Propósito**: dar a toda pantalla de gestión la misma cabecera, el mismo ancho máximo y el mismo comportamiento de desplazamiento.

**Reglas**:
- Título y subtítulo son obligatorios; el subtítulo explica el alcance de la pantalla, no la felicita.
- El ancho máximo se elige entre valores predefinidos; no se escribe uno nuevo.
- El filtro temporal, si existe, vive en esta cabecera.

**Estado**: existe, con adopción parcial: una parte de las pantallas de gestión la usa y otra no.

### Navegación inferior

**Propósito**: navegación principal en la aplicación instalada.

**Reglas**: en [PATRONES P8](PATRONES.md#p8--navegación-inferior).

**Estado**: existe, con implementaciones separadas por rol. La duplicación es deuda registrada.

### Barra superior

**Propósito**: identidad, notificaciones y acceso al perfil.

**Reglas**:
- Alto fijo más área segura superior.
- Se atenúa con modal abierto.
- Los avisadores de notificación muestran cantidad, no solo presencia.

**Estado**: existe.

### Indicador de espera

**Propósito**: comunicar que algo está en curso.

**Reglas**: atenuación cíclica, nunca a pantalla completa por un dato secundario. Preferir el armazón de contenido antes que el indicador.

**Estado**: existe.

### Reloj y cronómetro de jornada

**Propósito**: mostrar la hora actual y el tiempo trabajado en curso.

**Reglas**:
- El cronómetro cuenta desde el fichaje de entrada real, no desde que se abrió la pantalla.
- Ambos se actualizan sin provocar redibujado de la pantalla que los contiene.
- La hora es la del negocio.

**Estado**: existen como dos piezas.

### Cifra animada

**Propósito**: dar peso perceptivo a una cifra protagonista al aparecer.

**Reglas**:
- Solo en cifras protagonistas de tarjeta. Nunca en tablas ni en listas.
- La animación no retrasa la lectura: el valor final se alcanza en menos de un segundo.
- Se respeta la preferencia de movimiento reducido.

**Estado**: existe.

### Celda que se ajusta

**Propósito**: encajar texto en un espacio fijo reduciendo su tamaño antes que truncarlo.

**Reglas**: **nunca corta una cifra**. Tiene un tamaño mínimo por debajo del cual deja de reducir y el contenedor debe crecer o el diseño está mal.

**Estado**: existe. Es la pieza que hace posible la densidad del calendario mensual.

### Avatar

**Propósito**: identificar a una persona.

**Reglas**: sustituto con iniciales cuando no hay imagen. Nunca un hueco roto. Forma circular siempre.

**Estado**: existe.

### Visor con acercamiento y ampliación de imagen

**Propósito**: leer un documento o una imagen en detalle.

**Reglas**: superficie propia, no imagen grande en el flujo. Salida siempre visible. Gesto acompañado de control.

**Estado**: existen como dos piezas.

### Recarga por gesto

**Propósito**: refrescar una lista tirando hacia abajo.

**Reglas**: es un atajo, no el único mecanismo. Un panel en vivo se actualiza solo.

**Estado**: existe.

### Ampliación de recuento y calculadora rápida

**Propósito**: apoyar el recuento de efectivo y el cálculo puntual sin salir de la tarea.

**Reglas**: cifras grandes, legibles a distancia de brazo, con teclado de tamaño de dedo.

**Estado**: existen.

---

## 3. Componentes de dominio

Cada capacidad tiene sus piezas propias: cierre de caja, albaranes, carta, cocina, propinas, recetas, reservas, pabellón, horarios, consumo, tesorería, encargos, analítica.

**Frontera**: una pieza de dominio puede usar componentes base y de sistema; **nunca al revés**. Un componente de sistema que conozca una regla de negocio está mal ubicado.

Su contrato lo fija la [especificación de su capacidad](../1-producto/capacidades/). Este documento solo gobierna que respeten los tokens, los patrones y las leyes de experiencia.

### Atajo de dashboard (`DashboardShortcut`)

**Propósito**: acceso táctil a una capacidad desde los dashboards (rejilla de iconos).

**Anatomía**: host → iconBox → asset; text como pieza hermana. Badge y `children` métricos son accesorios de instancia, no variantes.

**Variantes** (cerradas, estructurales): `icon-text`, `icon-card-text-outside`, `separated`, `icon-only`, `text-only`. Se resuelven a propiedades independientes de composición; no existe el enum legacy `composition`.

**Identidad**: `data-component="DashboardShortcut"`, `data-variant`, `data-instance` (id de negocio, p. ej. `asistencia`). El label visible no forma parte de la identidad. `data-studio-target` (`bg` / `asset` / `text`) se conserva para compatibilidad con Marbella Studio.

**Estado**: existe. Primer consumidor: rejilla Master. Staff (`IOSIconBoxed`) y Admin (`renderQuickActionSquare`) aún no migrados.

**Código**: `src/components/dashboards/DashboardShortcut.tsx`.

---

## 4. Reglas del sistema

1. **Antes de crear un componente, se busca.** El producto tiene piezas casi duplicadas porque este paso se ha omitido repetidamente.
2. **Un componente de sistema no conoce el negocio.** Si necesita saber qué es una semana o un albarán, es de dominio.
3. **Los valores vienen de [TOKENS](TOKENS.md).** Un valor literal dentro de un componente es un defecto.
4. **Las variantes son cerradas.** Se eligen de una lista; no se abren pasando estilos desde fuera.
5. **Nada de proliferación de interruptores.** Un componente con cinco parámetros booleanos son treinta y dos estados que nadie ha probado. Se resuelve componiendo o creando una variante explícita.
6. **Toda pieza pulsable cumple el mínimo táctil** y toda zona de acción es indeformable.
7. **Un componente que se usa en una sola pantalla no es del sistema.** Vive junto a su pantalla hasta que aparezca el segundo uso.
8. **Si el inventario no cubre la necesidad, se para.** Inventar una pieza de sistema, una variante nueva o un overlay paralelo exige confirmación explícita. Una composición local de una sola pantalla sigue siendo local (punto 7) y no se declara de sistema.

---

## 5. Estado real del sistema

Hay que decirlo con claridad: **Marbella aún no tiene un sistema de componentes completo**. Tiene piezas transversales, una estructura de pantalla de adopción parcial, el piloto `DashboardShortcut`, el **contrato oficial de Modal** (Albaranes y Caja/Tesorería) y el **contrato oficial de Button** (piloto: footers de esos mismos modales). El resto se resuelve pantalla a pantalla. En Caja/Tesorería, `QuickCalculatorModal` y `DenominationZoomModal` permanecen legacy a propósito: el contrato no admite un tercer nivel sobre `base → derived`.

Consecuencias observables:
- Existen Button y Modal de sistema, con adopción parcial. Siguen sin componente de sistema el campo, la tarjeta, la insignia y el estado vacío.
- El mismo bloque visual está reescrito decenas de veces con variaciones no intencionadas (incluidos atajos Staff/Admin aún no unificados, y botones fuera del piloto).
- El mismo bloque visual está reescrito decenas de veces con variaciones no intencionadas (incluidos atajos Staff/Admin aún no unificados).
- La navegación inferior está implementada dos veces.
- Las piezas de dominio, muy numerosas, se apoyan directamente en utilidades y no en base.

Este documento es el contrato al que debe converger el código. La secuencia de convergencia y su coste están en [DEUDA](../5-estado/DEUDA.md); **construir los componentes base antes de tener [TOKENS](TOKENS.md) adoptados sería repetir el problema con otra sintaxis.**
