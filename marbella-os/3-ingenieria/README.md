---
documento: INGENIERIA-INDICE
clase: vivo
estado: vigente
capa: ingenieria
responsable: propiedad del producto
revisado: 2026-07-29
caducidad: 12 meses
---

# Ingeniería

Cómo se construye Marbella. Esta capa responde **cómo**, nunca **qué** ni **por qué**: eso está en [1-producto](../1-producto/VISION.md) y en [4-decisiones](../4-decisiones/README.md).

## Documentos

| Documento | Qué gobierna |
|---|---|
| [ARQUITECTURA](./ARQUITECTURA.md) | Piezas del sistema, capas y por dónde circula un dato desde su origen hasta la pantalla |
| [MODELO-DE-DATOS](./MODELO-DE-DATOS.md) | Entidades, dominios y **quién es autoridad de cada magnitud** |
| [SEGURIDAD](./SEGURIDAD.md) | Identidad, autorización, políticas de acceso, secretos y archivos |
| [CALIDAD](./CALIDAD.md) | Qué se prueba, qué se comprueba a mano y qué no existe |
| [FRONTEND](./FRONTEND.md) | Reglas de construcción de la interfaz: servidor y cliente, estado, estilos, límites de complejidad |
| [dominio/](./dominio/README.md) | Fórmulas de negocio: coste laboral, jornada fija, precios y compras |
| [contratos/](./contratos/README.md) | Acuerdos formales entre piezas del sistema |
| [integraciones/](./integraciones/README.md) | Sistemas externos: punto de venta y nóminas |
| [operacion/](./operacion/README.md) | Despliegues, tareas programadas y recuperación |

## Por dónde entrar

- **Para situarse**, [ARQUITECTURA](./ARQUITECTURA.md).
- **Antes de leer o escribir un dato**, [MODELO-DE-DATOS](./MODELO-DE-DATOS.md). Es la única defensa contra un error de esquema: los tipos generados no se usan, ver [D19](../5-estado/DEUDA.md).
- **Antes de crear una tabla, una ruta de API o una acción**, [SEGURIDAD §10](./SEGURIDAD.md#10-al-escribir-código).
- **Antes de dar algo por bueno**, [CALIDAD §5](./CALIDAD.md#5-comprobación-a-mano).

## Naturaleza de esta capa

En materia descriptiva **manda el código**: si este documento y la implementación discrepan sobre qué existe, el documento está desactualizado. Lo que hace normativa a esta capa son sus reglas explícitas, no su descripción. Es la [jerarquía de autoridad](../CANON.md) del canon.

Cada documento indica en su cabecera cuándo se revisó y su caducidad. **SEGURIDAD caduca a los tres meses**, no a los seis, porque describe agujeros abiertos.

## Lo más urgente de esta capa

Cuatro agujeros de acceso verificados el 2026-07-29, cada uno reparable con una migración pequeña y sin rediseño:

1. **[D24](../5-estado/DEUDA.md)** — tres tablas con escritura anónima en producción.
2. **[D25](../5-estado/DEUDA.md)** — cinco funciones que exponen la facturación sin sesión.
3. **[D26](../5-estado/DEUDA.md)** — contenedor de fotos de recuentos de caja público.
4. **[D23](../5-estado/DEUDA.md)** — tareas programadas que fallan abiertas.

Después, dos deudas que producen errores silenciosos: **[D20](../5-estado/DEUDA.md)** (condiciones laborales leídas del sitio equivocado) y **[D19](../5-estado/DEUDA.md)** (acceso a datos sin tipos).

## Lo que falta escribir

Las especificaciones de capacidad concretas, que se escriben **bajo demanda** cuando se va a intervenir en ellas. Ver [1-producto/capacidades](../1-producto/capacidades/README.md).

No hay documentos de esta capa pendientes.
