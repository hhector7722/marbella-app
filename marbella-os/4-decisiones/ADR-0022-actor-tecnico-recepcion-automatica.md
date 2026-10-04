---
documento: ADR-0022
clase: inmutable
estado: superado
capa: decisiones
normativo: false
precedencia: 0
responsable: propiedad del producto
decidido: 2026-10-03
depende_de: ADR-0013, MODELO-DE-DATOS, SEGURIDAD
supersede: ADR-0021
---

# ADR-0022 · Actor técnico auditado para la recepción automática

## Contexto

ADR-0021 estableció Mistral como extractor principal y K4 como único escritor económico, pero exigía que la persona que capturó el documento tuviera rol `manager` o `admin` para el delegado automático. De 233 capturas históricas, 118 fueron de supervisores: esa condición bloquea recepciones seguras por la identidad del capturador. Propiedad del producto autorizó expresamente un actor técnico `manager`/`admin` auditado para esos casos, conservando la identidad de quien capturó el papel. La muestra de 12 albaranes y 80 líneas sigue siendo la base conservadora; solo 7 líneas son candidatas antes de K4.

## Decisión

1. Mistral OCR es el extractor principal del escáner. Su respuesta original y una observación canónica tipada se guardan como evidencia inmutable junto al archivo, hash, modelo, versión, fecha y métricas. Una nueva interpretación crea una versión nueva; jamás reescribe Docling, Gemini ni una extracción anterior.
2. Extracción, identidad de producto, presentación, matemáticas, propuesta y aplicación son responsabilidades separadas. La observación no decide el ingrediente. El matching aprovecha código, nombre histórico, alias y similitud, pero una colisión entre ingredientes es una excepción. Las conversiones requieren presentación verificable; no se inventan densidades ni unidades.
3. Una cola durable en Supabase asigna leases por extractor, limita Mistral a tres intentos con espera creciente y conserva eventos. Un servidor Vercel con clave de servicio procesa Mistral; Supabase `pg_cron` lo despierta con un secreto de Vault. El worker local Docling no recibe la clave de servicio ni puede adquirir jobs Mistral.
4. La recepción automática solo puede partir de una propuesta Mistral sin incidencias documentales ni de línea, con identidad y presentación confiables, aritmética reconciliada, precio dentro de la banda admitida y sin pedido pendiente que requiera asignación. El delegado de servicio exige actor original `manager` o `admin`, o bien un capturador `supervisor` con actor técnico dedicado `manager`/`admin`, y pasa por la vista previa y el comando atómico K4 de ADR-0013. Un alias derivado debe conservar el nombre observado, copiar exactamente una presentación histórica confiable y guardar la relación con su versión fuente. K4 confirma la versión por copia; la corrección se aprende sin alterar la evidencia anterior.
5. Un documento descartado, recibido, duplicado o con líneas de otro extractor no gana una segunda materialización automática. Los bloqueos dejan una propuesta visible para resolver; no se convierten en ceros ni en recepciones parciales silenciosas. El despliegue se controla por configuración de servidor para separar extracción principal de recepción automática.
6. La persona capturadora y la propuesta deben coincidir. Para una captura de `supervisor` con evidencia Mistral, el delegado interno usa exclusivamente la identidad técnica registrada en esquema privado, marcada en Auth y sin acceso por correo verificado. Cada confirmación automática escribe en la misma transacción un registro privado append-only con propuesta, confirmación, actor económico y capturador. El perfil técnico queda oculto en las vistas operativas. Una captura de `staff` no recibe esta excepción. La confirmación humana sigue reservada a `manager`/`admin`.
7. Los perfiles versionados de ADR-0014 permanecen para el camino Docling y para formatos que requieran reglas deterministas. La observación canónica Mistral usa un normalizador general versionado; K4 no conoce el extractor. Docling queda como contingencia y evidencia, sin ser condición del camino principal.

## Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| Mantener Docling como extractor principal y añadir excepciones por proveedor | Conserva los errores de tablas y multiplica reglas específicas sin mejorar la cobertura de líneas. |
| Aplicar stock directamente desde la respuesta OCR | Omite matching, presentación, matemáticas, idempotencia y la frontera K4. |
| Confiar en una puntuación OCR aislada | No detecta ambigüedad de producto, formato o precio. |
| Copiar un alias a un mapeo confirmado antes de K4 | Convierte una hipótesis en memoria definitiva sin vista previa económica. |
| Ejecutar el worker local con `service_role` | Amplía privilegios fuera del servidor y contradice el aislamiento de la cola. |
| Dar a `supervisor` permiso económico directo | Amplía todas las confirmaciones humanas, no solo las propuestas automáticas verificadas. |
| Atribuir la recepción al manager humano que figure de turno | falsea la auditoría: esa persona no inició la confirmación automática. |

## Consecuencias

- La intervención humana se concentra en líneas con información insuficiente, producto nuevo, ambigüedad, presentación no verificada, importes incoherentes, posible duplicado o precio anómalo.
- El porcentaje de líneas recibidas sin intervención es el KPI principal. La cobertura de extracción y la de memoria se miden por separado; una mejora de OCR no equivale a una recepción segura.
- La memoria histórica de presentaciones condiciona el porcentaje inicial. Se amplía solo con correcciones verificadas y recepciones K4, nunca por inferencia de densidad o formato.
- El ledger, las confirmaciones, la conciliación y el historial de precio de ADR-0013 conservan su autoridad y trazabilidad.

- El actor técnico depende de una cuenta Auth sin correo entregable y un perfil manager oculto; si falta, cambia de rol o pierde el marcador, el delegado falla cerrado.
