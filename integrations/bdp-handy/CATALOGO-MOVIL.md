# Catálogo visual del comandero móvil

Implementación de la clasificación independiente de Marbella App. El punto de venta BDP sigue siendo la autoridad de la transacción y del precio. No se cambia su configuración ni el ejecutor Handy.

- `bdp_mobile_catalog`: única configuración versionada del catálogo móvil, con categorías de dos niveles, visibilidad y PLU ordenados. La semilla importa la organización existente de la carta una sola vez; `sourceId` solo referencia sus recursos visuales.
- Los nombres y fotos del producto se resuelven por PLU contra la carta, con el nombre BDP como respaldo. Los precios base provienen de `bdp_articulos`, y no se guardan en la clasificación.
- `GET /api/staff/bdp` compone la clasificación y el catálogo actual. `PUT /api/staff/bdp/catalog` solo permite guardar la configuración a Master, valida referencias y jerarquía y exige la revisión actual para evitar sobreescrituras concurrentes. La tabla no concede permisos a anon ni authenticated.
- `/staff/mesas/catalogo`: administración desde Otros → Catálogo BDP. Borrar una categoría elimina sus asignaciones, no los artículos de BDP. Los artículos sin ninguna asignación se muestran en Sin clasificar; las categorías ocultas no se muestran en la barra, pero el buscador sigue accediendo a todos los PLU.
- `BdpOrderView`: selección horizontal de categorías y subcategorías y cuadrícula adaptativa (hasta cuatro columnas en móvil y seis en pantallas anchas, según las dimensiones reales y el número de productos); prioriza filas completas y conserva scroll si no caben todos los artículos. Los artículos seleccionados se identifican únicamente por PLU y proporción, nunca por categoría.
- Contrato de envío existente: `POST /api/staff/bdp` valida PLU y precios, mantiene la cola serial y la idempotencia. Esta clasificación no modifica el contrato. Las medias raciones siguen bloqueadas para envío hasta comprobar la proporción en Handy; los artículos con precio cero son visibles para clasificación pero no comandables con el ejecutor actual. Los precios de media ración del catálogo siguen siendo la instantánea verificada de BDP del 28/11/2026, no una sincronización en vivo. No se implementan nuevas operaciones de suplementos asociados ni modificadores.

Prueba unitaria: `node --experimental-strip-types --test src/lib/staff/bdp-mobile-catalog.test.ts`.
