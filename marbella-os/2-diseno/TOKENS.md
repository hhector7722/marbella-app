---
documento: TOKENS
clase: vivo
estado: vigente
capa: diseno
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-09-02
caducidad: 6 meses
supersede: —
---

# TOKENS — Contrato de valores visuales

**Este documento es el origen de todo valor visual de Marbella.** Un color, un radio, una sombra, un espaciado o una duración salen de aquí. Un valor escrito directamente en un componente es un defecto, no un atajo.

La dirección del contrato es la del [CANON §6](../CANON.md#6-jerarquía-de-autoridad-ante-conflicto): **el código deriva de este documento, no al revés**. Cuando difieren, el código tiene un defecto.

## Estado de adopción

Cada token declara su estado:

- **Adoptado** — el valor está centralizado y los componentes lo consumen por su nombre.
- **Declarado** — el valor es normativo aquí, pero el código lo repite literalmente en cada uso.

Hoy **la práctica totalidad de los tokens está en estado declarado**. La configuración de estilos del proyecto tiene su tema vacío, así que el color, el radio y la sombra viven repetidos en cientos de componentes. Este documento es el paso previo indispensable para corregirlo: sin nombres acordados no hay nada que centralizar. La migración está en [DEUDA](../5-estado/DEUDA.md).

Los valores recogidos aquí **son los que el producto usa hoy**, no una propuesta nueva. Normalizar primero, cambiar después.

---

## 1. Color de marca

| Token | Valor | Papel | Estado |
|---|---|---|---|
| `color.marca` | `#36606F` | Identidad del producto en pantalla. Elementos activos, Button tertiary. **No** pinta cabeceras ni PetroleumSegmented | adoptado (Button tertiary; resto del producto aún literal) |
| `color.marca.intenso` | `#2F5D6A` | Estado pulsado y variantes de mayor contraste de la marca | adoptado (variable `--color-marca-intenso`; Button primary ya no la usa) |
| `color.marca.profundo` | `#2A4A56` | Fondos de marca de máxima intensidad | declarado |
| `color.marca.suave` | `#407080` | Marca sobre fondo oscuro, bordes de elementos de marca | declarado |
| `color.marca.impresa` | `#1F5FAF` | Identidad en documentos impresos. **No es el mismo azul** que en pantalla | adoptado |
| `color.marca.impresa.clara` | `#4F8EDC` | Variante clara en documentos impresos | adoptado |

La divergencia entre `color.marca` y `color.marca.impresa` es un conflicto real declarado en [LENGUAJE-VISUAL §2](LENGUAJE-VISUAL.md#2-color). Se documenta en lugar de ocultarse; resolverlo requiere una decisión explícita.

## 2. Envolvente de la aplicación

El fondo sobre el que flotan las superficies de trabajo. **No contiene contenido nunca.**

| Token | Valor | Papel | Estado |
|---|---|---|---|
| `color.envolvente` | `#15345C` | Color base del lienzo. Marino con degradado, el mismo en todas las páginas | adoptado |
| `color.envolvente.alto` | `#2A5A96` | Extremo superior del degradado | adoptado |
| `color.envolvente.bajo` | `#0B1C36` | Extremo inferior del degradado | adoptado |

Es el único token con implementación centralizada real: existe como utilidad única y todos los contenedores de aplicación la consumen.

## 3. Superficies

| Token | Valor | Papel | Estado |
|---|---|---|---|
| `color.superficie` | `#FFFFFF` | Superficie de trabajo. Tarjetas, modales, paneles | adoptado (piloto `DashboardShortcut` vía `--color-superficie`) |
| `color.superficie.hundida` | `#FAFAFA` | Fondo de zonas agrupadas dentro de una superficie | declarado |
| `color.superficie.inactiva` | `#F4F4F5` | Elementos deshabilitados, cabeceras de tabla | adoptado (piloto Button vía `--color-superficie-inactiva`) |

`color.superficie` no pinta el cuerpo del widget de HomeScreen. Ese hueco es material de sistema (`--home-widget-fill` + blur del `--color-envolvente`). Claro u oscuro según la luminancia del wallpaper. PageScreen, Modal y Surface fuera del mosaico siguen blancos, salvo la excepción documentada en [SISTEMA-DE-COMPONENTES](SISTEMA-DE-COMPONENTES.md) Tarjeta: en `/staff/propinas` los `Surface` `block` usan el relleno secundario del mosaico (`--home-widget-fill-secondary`, el mismo que sáb/dom del widget de horario).

## 4. Texto

| Token | Valor | Papel | Estado |
|---|---|---|---|
| `color.texto` | `#18181B` | Texto principal y cifras | adoptado (piloto Field / KpiStat vía `--color-texto`) |
| `color.texto.fuerte` | `#27272A` | Títulos y énfasis | adoptado (piloto `DashboardShortcut` vía `--color-texto-fuerte`) |
| `color.texto.medio` | `#52525B` | Texto de apoyo, descripciones | declarado |
| `color.texto.suave` | `#71717A` | Etiquetas, metadatos | declarado |
| `color.texto.tenue` | `#A1A1AA` | Texto de mínima jerarquía, marcas de posición | adoptado (piloto `DocumentListRow` vía `--color-texto-tenue`) |
| `color.texto.invertido` | `#FFFFFF` | Texto sobre marca, positivo, negativo o envolvente | adoptado (piloto Button vía `--color-texto-invertido`) |

## 5. Bordes y separadores

| Token | Valor | Papel | Estado |
|---|---|---|---|
| `color.borde` | `#F4F4F5` | Borde por defecto de superficies de trabajo | adoptado (piloto `DashboardShortcut` vía `--color-borde`) |
| `color.borde.marcado` | `#E4E4E7` | Separadores y bordes de campos de entrada | adoptado (piloto Field vía `--color-borde-marcado`) |
| `color.borde.impreso` | `#D9E2EC` | Filetes y separadores en documentos impresos | adoptado |

## 6. Semánticos

**Solo se usan cuando significan algo.** Cada uno tiene tres intensidades: fondo suave, color pleno y texto.

| Token | Valor | Significado | Estado |
|---|---|---|---|
| `color.positivo` | `#059669` | Cuadrado, cobrado, a favor, completado. Button primary (acción afirmativa) | adoptado (piloto Button vía `--color-positivo`) |
| `color.positivo.fondo` | `#ECFDF5` | Fondo de aviso positivo | adoptado (piloto Notice vía `--color-positivo-fondo`) |
| `color.negativo` | `#E11D48` | Descuadre, deuda, pérdida, error de negocio | adoptado (piloto Button vía `--color-negativo`) |
| `color.negativo.fondo` | `#FFF1F2` | Fondo de aviso negativo | adoptado (variable `--color-negativo-fondo`; Notice) |
| `color.aviso` | `#B45309` | Advertencia que requiere atención pero no bloquea | adoptado (piloto Notice vía `--color-aviso`) |
| `color.aviso.fondo` | `#FFF6E5` | Fondo de advertencia | adoptado (piloto Notice vía `--color-aviso-fondo`) |
| `color.informativo` | `#1F5FAF` | Información neutra, contexto | adoptado (piloto Notice / KpiStat vía `--color-informativo`) |
| `color.informativo.fondo` | `#EFF6FF` | Fondo informativo | adoptado (piloto Notice vía `--color-informativo-fondo`) |
| `color.critico` | `#B91C1C` | Fallo del sistema, no del negocio | adoptado (piloto Notice vía `--color-critico`) |

Los tokens semánticos de documentos impresos usan los mismos nombres con valores propios ya centralizados: positivo `#1B7A4E`, negativo `#B91C1C`, aviso `#B45309`, informativo `#1F5FAF`, con sus fondos correspondientes.

## 7. Tipografía en pantalla

| Token | Valor | Papel | Estado |
|---|---|---|---|
| `tipo.familia` | Inter | Única familia del producto | adoptado |
| `tipo.familia.cocina` | Teko | Número de mesa en pantalla de cocina. Legible a tres metros | adoptado |
| `tipo.cifra` | 30 px / peso 700 | Cifra protagonista de una tarjeta | declarado |
| `tipo.titulo` | 20 px / peso 700 | Título de pantalla o de modal | declarado |
| `tipo.subtitulo` | 16 px / peso 600 | Título de bloque | declarado |
| `tipo.cuerpo` | 14 px / peso 400 | Texto general | declarado |
| `tipo.apoyo` | 12 px / peso 400 | Metadatos, etiquetas | declarado |
| `tipo.minimo` | 11 px | Suelo de lo que hay que **leer**: cifras, nombres, acciones, etiquetas de dato. Un importe o un nombre no baja de aquí | adoptado (piloto `DocumentListRow` título; subtítulo de esa familia conserva 10 px documentado) |
| `tipo.anotacion` | 8 px | Nota, cromo menor, texto que no es el dato («Ver más», pie de un atajo). Por debajo de esto, no | declarado |
| `tipo.entrada` | 16 px | Mínimo en campos de entrada para evitar el zoom automático del móvil | declarado |

## 8. Espaciado

Escala de cuatro píxeles. **No existen valores intermedios.**

| Token | Valor | Uso típico |
|---|---|---|
| `espacio.1` | 4 px | Separación entre elementos pegados. **También** padding del relleno visual de Button (abraza el texto/icono) |
| `espacio.2` | 8 px | Separación interna mínima. **También** radio contractual del Button (8 px; no es `radio.superficie`) |
| `espacio.3` | 12 px | Relleno de controles compactos. **También** separación contractual Header → Body del Modal (ref. detalle Albaranes; solo `padding-top` del Body vía `--modal-body-start-gap`) |
| `espacio.4` | 16 px | Relleno estándar de tarjeta, separación entre bloques. **También** inset horizontal único de cabecera Modal |
| `espacio.6` | 24 px | Separación entre secciones |
| `espacio.8` | 32 px | Separación mayor y márgenes de página |
| `espacio.12` | 48 px | Separación de zonas independientes |

Estado: `espacio.1`–`espacio.4` adoptados en Design System (`--espacio-*`, clases `*-ds-*`) vía pilotos `DashboardShortcut` y Modal. `espacio.6` adoptado (`--espacio-6`, piloto márgenes inferiores de menús de acceso en modal). `espacio.8` adoptado (`--espacio-8`, piloto EmptyState). `espacio.12` permanece en la escala documental, sin variable CSS todavía.

## 9. Forma

| Token | Valor | Papel | Estado |
|---|---|---|---|
| `radio.control` | 12 px | Campos, tarjetas de contenido. **Radio dominante de bloques de contenido** | adoptado (piloto `DashboardShortcut` vía `--radio-control`) |
| `radio.superficie` | 16 px | Modales, paneles, superficies contenedoras. **No** es el radio del Button de sistema | adoptado (piloto `DashboardShortcut` vía `--radio-superficie`; contrato Modal vía `--radio-superficie`) |
| `radio.amplio` | 24 px | Superficies destacadas de cliente | declarado |
| `radio.circular` | pleno | Avatares, indicadores, botones circulares de acción | declarado |

Prohibido mezclar radios dentro de un mismo bloque, según [LENGUAJE-VISUAL §5](LENGUAJE-VISUAL.md#5-forma).

## 10. Elevación

| Token | Valor | Papel | Estado |
|---|---|---|---|
| `elevacion.superficie` | sombra mínima | Separa tiles y bloques interiores. **Elevación de `Surface` `block`** | adoptado (piloto `DashboardShortcut` vía `--elevacion-superficie`) |
| `elevacion.flotante` | sombra media | Elementos que se despegan: menús, elementos arrastrados | declarado |
| `elevacion.modal` | sombra amplia | Modales y capas superpuestas | adoptado (contrato Modal vía `--elevacion-modal`) |
| `elevacion.pagina` | misma cifra que `elevacion.modal` (`shadow-2xl`) | Superficie de trabajo `page` sobre el envolvente. Ref. PageScreen / Labor. **No** es un overlay | adoptado (`--elevacion-pagina`) |
| `elevacion.ninguna` | sin sombra | Elementos embebidos y filas de tabla | declarado |

## 11. Táctil

| Token | Valor | Papel | Estado |
|---|---|---|---|
| `tactil.minimo` | 48 px | Alto mínimo de todo objetivo pulsable. **No negociable** | adoptado (piloto `DashboardShortcut` vía `--tactil-minimo`) |
| `tactil.reducido` | 44 px | Únicamente elementos secundarios en escritorio. Es un compromiso | declarado |
| `tactil.separacion` | 8 px | Separación mínima entre objetivos pulsables adyacentes | declarado |

Norma en [EXPERIENCIA §1](EXPERIENCIA.md#1-táctil).

## 12. Estructura de la aplicación

| Token | Valor | Papel | Estado |
|---|---|---|---|
| `estructura.cabecera` | 48 px + área segura superior | Hueco reservado desde el borde superior hasta el contenido. La barra visible mide 40 px (`--app-navbar-height`); la diferencia (8 px) es separación vacía | adoptado (`--estructura-cabecera`) |
| `estructura.barra-inferior` | 46 px + área segura inferior | Pista del tab bar iOS (icono 22 px + etiqueta 9 pt). El material sigue bajo el home indicator | adoptado (`--estructura-barra-inferior`) |
| `estructura.fin-de-lista` | 96 px + área segura | Hueco al final de listas táctiles | adoptado |
| `estructura.fin-de-lista.tarjetas` | 240 px + área segura | Hueco al final de listas con barra de cantidad | adoptado |
| `estructura.alto-modal` | `min(68dvh, 100dvh − safe − 2.5rem)` en contrato Modal (ref. Albaranes); otros shells pueden conservar 94% documentado históricamente | Alto máximo de un modal de tarea | adoptado (`--modal-max-height`) |
| `estructura.cabecera-modal` | 36 px | Alto fijo de cabecera de Modal y de PageScreen (norma global; el contenido se escala para caber) | adoptado (`--modal-header-height`) |
| `estructura.modal-cabecera-inset` | 16 px (= `espacio.4`) | Inset horizontal único de cabecera Modal (ref. Albaranes). Título y subtítulo empiezan aquí | adoptado (`--modal-header-inset`) |
| `estructura.modal-cuerpo-inicio` | 12 px (= `espacio.3`) | Separación vertical mínima Header → primer contenido del Body. No es inset completo del Body | adoptado (`--modal-body-start-gap`) |
| `estructura.modal-subordinado-blur` | 4 px | Blur del panel Modal cubierto bajo `derived`/`system` ([ADR-0009](../4-decisiones/ADR-0009-modal-subordinacion.md)) | adoptado (`--modal-subordinate-blur`) |
| `estructura.modal-subordinado-saturate` | 72 % | Saturación del panel subordinado (acompaña al blur) | adoptado (`--modal-subordinate-saturate`) |
| `estructura.modal-subordinado-opacity` | 0.58 | Opacidad del panel subordinado | adoptado (`--modal-subordinate-opacity`) |
| `estructura.ancho-lectura` | 1400 px | Ancho máximo de contenido en escritorio | declarado |

Se usa la medida de alto visible real del dispositivo, no la teórica: es la causa histórica de modales cortados en la aplicación instalada.

## 13. Movimiento

| Token | Valor | Papel | Estado |
|---|---|---|---|
| `movimiento.inmediato` | 120 ms | Cambio de estado de un control | declarado |
| `movimiento.transicion` | 200 ms | Entrada y salida de elementos | declarado |
| `movimiento.espera` | 1.200 ms cíclico | Atenuación del indicador de carga | adoptado |

---

## 14. Cómo se cambia un token

1. Se cambia **aquí** primero, con el motivo.
2. Si el token es constitucional por su papel (marca, envolvente, semánticos), el cambio requiere ADR.
3. Se propaga al código en el mismo cambio o se registra en [DEUDA](../5-estado/DEUDA.md) con fecha límite.
4. Se comprueba en documentos impresos si el token tiene contraparte impresa.

Añadir un token nuevo exige justificar por qué ninguno de los existentes sirve. **El catálogo debe permanecer pequeño**: un sistema con doscientos tokens no es un sistema, es un diccionario de valores sueltos con nombres bonitos.

## 15. Deuda de tokens conocida

- **Dos escalas de neutros en uso.** Conviven la escala de grises fría y otra escala de grises distinta, con cientos de usos cada una. La canónica es la fría; la otra es deuda de migración.
- **La marca y la mayoría de colores de pantalla siguen sin centralizar fuera de las primitivas.** PageScreen, Surface, Field, Notice y KpiStat adoptan tokens. El color de marca sigue literal en pantallas no migradas ([D28](../5-estado/DEUDA.md)).
- **El azul de marca difiere entre pantalla y documento impreso.**
- **Una tipografía ajena** se introdujo en una superficie pública sin declararse como excepción.
