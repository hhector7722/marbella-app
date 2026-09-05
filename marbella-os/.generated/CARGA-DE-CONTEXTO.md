<!-- Generado desde 55 documentos de marbella-os/.
     Huella del origen: 4031ef660635ff60
     NO EDITAR A MANO: se regenera con `npm run generate:corpus`, y
     `npm run validate:corpus` compara este fichero con lo que produce
     el generador. Cualquier edición manual se detecta. -->

# Carga de contexto

Derivado de `marbella-os/README.md`. **No es fuente de nada**: si contradice al
corpus, gana el corpus.

| Vas a tocar | Lee |
|---|---|
| Cualquier cosa, para situarte | `marbella-os/3-ingenieria/ARQUITECTURA.md` |
| Cualquier cosa, para saber cómo está | `marbella-os/5-estado/ESTADO.md`, `marbella-os/5-estado/DEUDA.md` |
| Una pantalla o un componente | `marbella-os/2-diseno/EXPERIENCIA.md`, `marbella-os/2-diseno/LENGUAJE-VISUAL.md`, `marbella-os/2-diseno/TOKENS.md`, `marbella-os/2-diseno/PATRONES.md`, `marbella-os/2-diseno/SISTEMA-DE-COMPONENTES.md` |
| Una pantalla de gestión, cabecera de página o plantilla de pantalla | `marbella-os/2-diseno/SISTEMA-DE-COMPONENTES.md#5-estado-real-del-sistema`, `marbella-os/2-diseno/PATRONES.md#p13--pantalla-de-gestión`, `marbella-os/4-decisiones/ADR-0010-jerarquia-visual-canonica.md` |
| Un overlay, modal o capa superpuesta | `marbella-os/2-diseno/EXPERIENCIA.md#8-modales`, `marbella-os/2-diseno/PATRONES.md#p2--modal`, `marbella-os/2-diseno/SISTEMA-DE-COMPONENTES.md#modal`, `marbella-os/4-decisiones/ADR-0007-modal-superficie-derivada.md`, `marbella-os/4-decisiones/ADR-0008-modal-backdrop-capas.md`, `marbella-os/4-decisiones/ADR-0009-modal-subordinacion.md` |
| Código de interfaz | `marbella-os/3-ingenieria/FRONTEND.md` |
| Textos, etiquetas, formatos numéricos | `marbella-os/2-diseno/CONTENIDO-Y-TONO.md` |
| Un documento impreso | `marbella-os/2-diseno/DOCUMENTOS-IMPRESOS.md` |
| Datos: leer, escribir, migrar | `marbella-os/3-ingenieria/MODELO-DE-DATOS.md` |
| Permisos, políticas de acceso, secretos, archivos | `marbella-os/3-ingenieria/SEGURIDAD.md` |
| Roles o quién puede hacer qué | `marbella-os/1-producto/ACTORES-Y-ROLES.md` |
| Pruebas o verificación de un cambio | `marbella-os/3-ingenieria/CALIDAD.md` |
| Una fórmula de negocio | `marbella-os/3-ingenieria/dominio/README.md`, `marbella-os/4-decisiones/README.md` |
| Horas, nóminas o coste laboral | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md`, `marbella-os/3-ingenieria/dominio/HORAS.md`, `marbella-os/3-ingenieria/dominio/COSTE-LABORAL.md`, `marbella-os/3-ingenieria/dominio/JORNADA-FIJA.md` |
| Precios de ingredientes o albaranes | `marbella-os/3-ingenieria/dominio/PRECIOS-Y-COMPRAS.md` |
| Un sistema externo | `marbella-os/3-ingenieria/integraciones/README.md` |
| Un despliegue o una tarea programada | `marbella-os/3-ingenieria/operacion/README.md` |
| La propia documentación | `marbella-os/CANON.md` |

# Autoridad ante conflicto

Cuando dos documentos vigentes se contradigan, gana el de precedencia mayor. Si
empatan, no elijas: hay una duplicación que resolver, y la regla que la prohíbe
es `CANON §5`.

| Precedencia | Documento |
|---|---|
| 100 | `marbella-os/CANON.md` |
| 80 | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` |
| 80 | `marbella-os/4-decisiones/ADR-0002-metadatos-operables-y-validador.md` |
| 80 | `marbella-os/4-decisiones/ADR-0003-identidad-de-afirmacion.md` |
| 80 | `marbella-os/4-decisiones/ADR-0004-grafo-de-dependencias.md` |
| 80 | `marbella-os/4-decisiones/ADR-0005-protocolo-operativo-de-agentes.md` |
| 80 | `marbella-os/4-decisiones/ADR-0006-pipeline-nominas-y-dashboard.md` |
| 80 | `marbella-os/4-decisiones/ADR-0007-modal-superficie-derivada.md` |
| 80 | `marbella-os/4-decisiones/ADR-0008-modal-backdrop-capas.md` |
| 80 | `marbella-os/4-decisiones/ADR-0009-modal-subordinacion.md` |
| 80 | `marbella-os/4-decisiones/ADR-0010-jerarquia-visual-canonica.md` |
| 60 | `marbella-os/1-producto/PRINCIPIOS.md` |
| 60 | `marbella-os/1-producto/VISION.md` |
| 60 | `marbella-os/2-diseno/EXPERIENCIA.md` |
| 60 | `marbella-os/2-diseno/LENGUAJE-VISUAL.md` |
| 40 | `marbella-os/3-ingenieria/contratos/PROYECCION-v1.md` |
| 20 | `marbella-os/1-producto/ACTORES-Y-ROLES.md` |
| 20 | `marbella-os/1-producto/MAPA-DE-CAPACIDADES.md` |
| 20 | `marbella-os/1-producto/RECORRIDOS.md` |
| 20 | `marbella-os/2-diseno/CONTENIDO-Y-TONO.md` |
| 20 | `marbella-os/2-diseno/DOCUMENTOS-IMPRESOS.md` |
| 20 | `marbella-os/2-diseno/PATRONES.md` |
| 20 | `marbella-os/2-diseno/SISTEMA-DE-COMPONENTES.md` |
| 20 | `marbella-os/2-diseno/TOKENS.md` |
| 20 | `marbella-os/3-ingenieria/ARQUITECTURA.md` |
| 20 | `marbella-os/3-ingenieria/CALIDAD.md` |
| 20 | `marbella-os/3-ingenieria/dominio/COSTE-LABORAL.md` |
| 20 | `marbella-os/3-ingenieria/dominio/HORAS.md` |
| 20 | `marbella-os/3-ingenieria/dominio/JORNADA-FIJA.md` |
| 20 | `marbella-os/3-ingenieria/dominio/PRECIOS-Y-COMPRAS.md` |
| 20 | `marbella-os/3-ingenieria/FRONTEND.md` |
| 20 | `marbella-os/3-ingenieria/integraciones/BDP-TPV.md` |
| 20 | `marbella-os/3-ingenieria/integraciones/NOMINAS.md` |
| 20 | `marbella-os/3-ingenieria/MODELO-DE-DATOS.md` |
| 20 | `marbella-os/3-ingenieria/operacion/RUNBOOK-BDP-VENTAS.md` |
| 20 | `marbella-os/3-ingenieria/PROTOCOLO-AGENTES.md` |
| 20 | `marbella-os/3-ingenieria/SEGURIDAD.md` |
| 20 | `marbella-os/5-estado/CHANGELOG.md` |
| 20 | `marbella-os/5-estado/DEUDA.md` |
| 20 | `marbella-os/5-estado/ESTADO.md` |
| 20 | `marbella-os/5-estado/ROADMAP.md` |
| 20 | `marbella-os/GLOSARIO.md` |

Todo lo que no aparece en esta tabla **no es normativo** y no autoriza ninguna
decisión, empezando por los 47 documentos de `marbella-os/6-investigacion/`.
