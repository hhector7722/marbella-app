# Referencia del sistema heredado

Material de consulta sobre sistemas que **no son Marbella**: el ERP del punto de venta, hojas de cálculo antiguas y albaranes reales de proveedores.

**Esto no es documentación de producto.** Es material de origen que se consulta al replicar una fórmula heredada o al interpretar un formato ajeno. La documentación de Marbella vive en [`marbella-os/`](../../marbella-os/README.md).

## Contenido

| Archivo | Qué es |
|---|---|
| `mapa-tablas.txt` | Esquema de tablas del ERP del punto de venta |
| `columnas.txt`, `columnas-lineas.txt` | Columnas de las tablas de venta y de sus líneas |
| `estructura-tablas-menus.txt` | Estructura de menús en el sistema del punto de venta |
| `ejemplos-albaranes/` | Albaranes reales de los proveedores habituales |
| `ejemplos-escandallos/` | Escandallos del sistema anterior |

## Reglas de uso

- **Es material congelado.** No se actualiza y no describe el estado actual de nada.
- Se consulta para **replicar la intención de una fórmula heredada**, nunca para deducir cómo funciona Marbella hoy.
- **Si aquí falta el dato que necesitas, falta el dato.** No se inventa ni se deduce: se pide.
- La regla de negocio resultante se escribe en [`marbella-os/3-ingenieria/dominio/`](../../marbella-os/3-ingenieria/dominio/README.md), no aquí.
