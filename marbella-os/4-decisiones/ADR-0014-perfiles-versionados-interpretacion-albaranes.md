---
documento: ADR-0014
clase: inmutable
estado: vigente
capa: decisiones
normativo: true
precedencia: 80
responsable: propiedad del producto
decidido: 2026-09-15
depende_de: ADR-0012, ADR-0013
supersede: —
---

# ADR-0014 · Perfiles versionados para interpretación de albaranes

## Contexto

Docling conserva texto, tablas, celdas y layout como evidencia, pero un mismo
encabezado puede tener semántica distinta por proveedor. Esa semántica estable
no puede mezclarse con la evidencia de un documento ni con el mapeo de un
artículo a un ingrediente. Además, una modificación futura de la regla de un
proveedor no debe cambiar qué significó una propuesta o recepción previa.

## Decisión

1. Cada proveedor con formato conocido tiene un perfil JSON versionado en Git,
   con su ID real, aliases documentales, referencia visual con SHA-256,
   encabezados, semántica, conversiones finitas, exclusiones y condiciones de
   `needs_review`.
2. El perfil se ejecuta como normalizador determinista y puro sobre evidencia
   estructurada. No contiene coordenadas, no usa LLM, no es evidencia y no
   identifica ingredientes.
3. Toda propuesta futura generada desde un perfil debe conservar `id` y
   `version` del perfil. Una modificación de significado crea versión nueva;
   nunca reinterpreta automáticamente hechos históricos.
4. K3 sigue persistiendo evidencia sin interpretar y K4 sigue siendo el único
   productor de efectos económicos. Esta decisión no modifica sus tablas,
   funciones, permisos ni confirmaciones.
5. Sin perfil aplicable, sin mapeo seguro o ante contradicción, la salida es
   `needs_review`; nunca una conversión por defecto.

## Alternativas descartadas

| Alternativa | Motivo de descarte |
|---|---|
| Incluir las reglas en la evidencia Docling | Mezcla observación de un documento con conocimiento estable y reescribe la trazabilidad. |
| Mapeo de artículo que además describe columnas | Una referencia concreta no puede gobernar todo el formato del proveedor. |
| Reglas en un prompt o en un LLM | No es determinista, no queda versionado como contrato y puede inventar equivalencias. |
| Coordenadas de las fotografías | El layout varía y pertenece a la evidencia, no al significado semántico. |
| Añadir una infraestructura de tablas/versiones ahora | K3 y K4 aún no consumen propuestas de perfil; añade persistencia sin productor autorizado. |

## Consecuencias

- Los 16 formatos actuales son auditables y tienen fixtures independientes del
  OCR.
- `Zander` conserva su histórico sin perfil nuevo; `Otros` no gana una regla
  ficticia de proveedor.
- Una futura integración debe llevar versión de perfil hasta la propuesta y no
  puede cruzar la frontera de revisión humana/K4.
