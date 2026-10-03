---
documento: ADR-0021
clase: inmutable
estado: vigente
capa: decisiones
normativo: true
precedencia: 80
responsable: propiedad del producto
decidido: 2026-10-03
depende_de: ADR-0013, ADR-0014, MODELO-DE-DATOS, SEGURIDAD
supersede: ADR-0012
---

# ADR-0021 · Extracción canónica y recepción automática de albaranes

## Contexto

La separación entre evidencia, propuesta y efecto económico de ADR-0012 sigue siendo necesaria, pero su prohibición general de recepción automática deja la revisión humana como camino normal. En una muestra de 12 albaranes históricos y 80 líneas entregadas, Mistral recuperó las 80 líneas; Docling acertó el número de líneas de un documento. La memoria histórica identifica muchos productos, aunque las presentaciones verificadas todavía son insuficientes para la autonomía deseada.

## Decisión

1. Mistral OCR es el extractor principal del escáner. Su respuesta original y una observación canónica tipada se guardan como evidencia inmutable junto al archivo, hash, modelo, versión, fecha y métricas. Una nueva interpretación crea una versión nueva; jamás reescribe Docling, Gemini ni una extracción anterior.
2. Extracción, identidad de producto, presentación, matemáticas, propuesta y aplicación son responsabilidades separadas. La observación no decide el ingrediente. El matching aprovecha código, nombre histórico, alias y similitud, pero una colisión entre ingredientes es una excepción. Las conversiones requieren presentación verificable; no se inventan densidades ni unidades.
3. Una cola durable en Supabase asigna leases por extractor, limita Mistral a tres intentos con espera creciente y conserva eventos. Un servidor Vercel con clave de servicio procesa Mistral; Supabase `pg_cron` lo despierta con un secreto de Vault. El worker local Docling no recibe la clave de servicio ni puede adquirir jobs Mistral.
4. La recepción automática solo puede partir de una propuesta Mistral sin incidencias documentales ni de línea, con identidad y presentación confiables, aritmética reconciliada, precio dentro de la banda admitida y sin pedido pendiente que requiera asignación. El delegado de servicio exige actor original `manager` o `admin` y pasa por la vista previa y el comando atómico K4 de ADR-0013. Un alias derivado debe conservar el nombre observado, copiar exactamente una presentación histórica confiable y guardar la relación con su versión fuente. K4 confirma la versión por copia; la corrección se aprende sin alterar la evidencia anterior.
5. Un documento descartado, recibido, duplicado o con líneas de otro extractor no gana una segunda materialización automática. Los bloqueos dejan una propuesta visible para resolver; no se convierten en ceros ni en recepciones parciales silenciosas. El despliegue se controla por configuración de servidor para separar extracción principal de recepción automática.
6. Los perfiles versionados de ADR-0014 permanecen para el camino Docling y para formatos que requieran reglas deterministas. La observación canónica Mistral usa un normalizador general versionado; K4 no conoce el extractor. Docling queda como contingencia y evidencia, sin ser condición del camino principal.

## Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| Mantener Docling como extractor principal y añadir excepciones por proveedor | Conserva los errores de tablas y multiplica reglas específicas sin mejorar la cobertura de líneas. |
| Aplicar stock directamente desde la respuesta OCR | Omite matching, presentación, matemáticas, idempotencia y la frontera K4. |
| Confiar en una puntuación OCR aislada | No detecta ambigüedad de producto, formato o precio. |
| Copiar un alias a un mapeo confirmado antes de K4 | Convierte una hipótesis en memoria definitiva sin vista previa económica. |
| Ejecutar el worker local con `service_role` | Amplía privilegios fuera del servidor y contradice el aislamiento de la cola. |

## Consecuencias

- La intervención humana se concentra en líneas con información insuficiente, producto nuevo, ambigüedad, presentación no verificada, importes incoherentes, posible duplicado o precio anómalo.
- El porcentaje de líneas recibidas sin intervención es el KPI principal. La cobertura de extracción y la de memoria se miden por separado; una mejora de OCR no equivale a una recepción segura.
- La memoria histórica de presentaciones condiciona el porcentaje inicial. Se amplía solo con correcciones verificadas y recepciones K4, nunca por inferencia de densidad o formato.
- El ledger, las confirmaciones, la conciliación y el historial de precio de ADR-0013 conservan su autoridad y trazabilidad.
