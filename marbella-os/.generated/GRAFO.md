<!-- Generado desde 5 documentos de marbella-os/.
     Huella del origen: b8d83f8c49971bd0
     NO EDITAR A MANO: se regenera con `npm run generate:corpus`, y
     `npm run validate:corpus` compara este fichero con lo que produce
     el generador. Cualquier edición manual se detecta. -->

# Grafo de impacto

Qué documentos hay que revisar cuando otro cambia. Derivado del campo
`depende_de`. **No es norma**: es una ayuda para no dejarse nada.

Las aristas se declaran al revés de como se leen aquí. Cada documento declara
en qué se apoya, porque eso lo sabe quien lo escribe; esta tabla lo invierte
para responder a la pregunta que surge al cambiar algo.

| Si cambia | Documento | Hay que revisar |
|---|---|---|
| `ADR-0001` | `marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md` | `CONTRATO-PROYECCION-v1` |
| `ADR-0002` | `marbella-os/4-decisiones/ADR-0002-metadatos-operables-y-validador.md` | `ADR-0003`, `ADR-0004` |
| `CANON` | `marbella-os/CANON.md` | `ADR-0003`, `ADR-0004` |

Que un documento no aparezca aquí no significa que nadie dependa de él:
significa que nadie lo ha declarado. La adopción es incremental, y la decisión
que la gobierna es `ADR-0004`.
