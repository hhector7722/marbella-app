---
documento: ADR-0023
clase: inmutable
estado: vigente
capa: decisiones
normativo: true
precedencia: 80
responsable: propiedad del producto
decidido: 2026-10-04
depende_de: MODELO-DE-DATOS, SEGURIDAD
supersede: ADR-0014, ADR-0022, PERFILES-ALBARANES-PROVEEDORES
---

# ADR-0023 · Mistral único y relectura histórica segura

## Contexto

La ruta Docling convirtió cabeceras en artículos en el albarán de ABRIL del
02/10/2026. Una relectura Mistral de ese original identificó tres artículos
reales donde la materialización Docling mostraba nueve líneas. Propiedad del
producto decidió retirar Docling por completo del funcionamiento actual y
releer todos los originales desde el primer albarán de su etapa.

## Decisión

1. Mistral es el único extractor operativo de albaranes. La captura siempre
   encola Mistral; ante un fallo deja un error visible y reintentable.
2. El archivo original, la extracción y cada propuesta tienen hash y versión.
   Se reutiliza una extracción Mistral correcta del mismo archivo, hash y
   versión; ninguna evidencia histórica se reescribe.
3. La relectura histórica recorre el periodo desde el primer albarán sin una
   extracción Gemini correcta que fue procesado por Docling. Incluye todas
   sus hojas y registra los errores por archivo. Los trabajos históricos no
   cambian el estado operativo del albarán ni invocan K4.
4. Las líneas antiguas no se borran. Una nueva materialización Mistral puede
   marcarlas como sustituidas para la vista operativa solo si el albarán no
   tiene confirmaciones económicas. Una línea recibida nunca se sustituye.
5. K4 solo acepta una línea operativa con propuesta Mistral y evidencia
   correcta de todas las hojas. El delegado automático conserva el actor
   técnico auditado de ADR-0022 para capturas de supervisores; la revisión
   humana sigue reservada a manager y admin.
6. Se retiran las RPC, Edge Function, worker, servicios e interfaz capaces de
   iniciar Docling. Los registros previos conservan el nombre de su extractor
   como evidencia histórica. La memoria fiable sigue viniendo de mappings y
   presentaciones confirmadas y de K4, nunca de una hipótesis OCR.

## Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| Mantener Docling como contingencia | Permite volver a producir las líneas erróneas y mantiene infraestructura y rutas divergentes. |
| Borrar líneas o extracciones antiguas | Rompe auditoría, referencias económicas y la explicación de decisiones pasadas. |
| Reejecutar K4 durante el lote | Puede duplicar stock o precio y confunde relectura con recepción. |
| Convertir nuevas propuestas en mappings confirmados | No hay validación humana ni económica suficiente. |

## Consecuencias

- La extracción, la propuesta y la recepción conservan fronteras separadas.
- Un documento recibido o parcialmente recibido puede ganar evidencia Mistral
  nueva sin una segunda recepción.
- Los perfiles de interpretación Docling de ADR-0014 dejan de ser operativos;
  sus registros históricos permanecen trazables.
- Si el mini-PC no está accesible, la retirada de sus servicios queda abierta
  hasta verificarla allí; el cierre de código y base de datos no prueba por sí
  mismo que la infraestructura local esté apagada.
