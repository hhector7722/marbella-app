---
documento: PROTOCOLO-AGENTES
clase: vivo
estado: vigente
capa: ingenieria
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-08-05
caducidad: 12 meses
depende_de: CANON
supersede: —
---

# PROTOCOLO-AGENTES — Protocolo Operativo de Agentes de IA

Arquitectura completa del sistema que gobierna el comportamiento de cualquier agente de inteligencia artificial que trabaje sobre Marbella App. Este documento operacionaliza las reglas de `CANON §12`.

## Tres principios fundacionales

### P1. El conocimiento precede a la acción

Un agente no tiene permiso para modificar código hasta que demuestre —a sí mismo, al usuario y al sistema de validación— que comprende qué gobierna lo que va a tocar. La comprensión no se supone: se construye y se exhibe.

### P2. La documentación es la especificación, no el código

En materia normativa (reglas de negocio, principios de producto, contratos de diseño, decisiones de arquitectura), Marbella OS manda. El código describe qué existe hoy; Marbella OS describe qué debe ser. Si discrepan, es el código el que tiene un defecto, no la documentación.

### P3. El agente deja el corpus mejor de como lo encontró

Cada tarea es una oportunidad para que Marbella OS y el código diverjan un poco más o un poco menos. Un agente que modifica comportamiento visible sin actualizar el documento que lo gobierna está creando deuda documental. Un agente que detecta una discrepancia entre código y documentación y la señala —sin que nadie se lo pida— está cumpliendo su función.

---

## Responsabilidades del agente

| Responsabilidad | Descripción |
|---|---|
| **Orientación** | Antes de hacer cualquier cosa, determinar qué partes de Marbella OS gobiernan la tarea. |
| **Comprensión** | Leer y entender los documentos relevantes, incluidas sus dependencias y sus afirmaciones citables. |
| **Verificación previa** | Confirmar que la tarea propuesta no contradice ninguna norma vigente. |
| **Ejecución informada** | Implementar el cambio respetando las reglas descubiertas. |
| **Actualización documental** | Mantener el corpus sincronizado con el cambio realizado. |
| **Verificación posterior** | Confirmar que el resultado es correcto tanto en código como en documentación. |
| **Transparencia** | Comunicar al usuario qué consultó, qué restricciones encontró y qué decisiones tomó. |

---

## Ciclo de vida de una tarea

El ciclo de vida tiene **siete fases**. Las cuatro primeras ocurren **antes de que se modifique una sola línea de código**.

### Fase ①: Recepción

1. Registrar la petición tal cual fue formulada.
2. Clasificar la petición (modificación de comportamiento, corrección de defecto, cambio visual, tarea operativa, consulta, infraestructura pura).
3. Determinar la gravedad de impacto.

### Fase ②: Orientación

1. Leer `marbella-os/README.md` como punto de entrada único.
2. Consultar `marbella-os/.generated/CARGA-DE-CONTEXTO.md` para determinar qué leer.
3. Consultar `marbella-os/.generated/GRAFO.md` para encontrar dependencias arrastradas.
4. Leer `INDEXACION.md` antes de indexar el repositorio.
5. Producir la lista explícita de documentos a consultar ordenada por precedencia.

### Fase ③: Comprensión

1. Leer cada documento de la lista en orden de precedencia.
2. Verificar metadatos (`estado: vigente` y `normativo: true`).
3. Identificar afirmaciones citables (`.generated/AFIRMACIONES.md`).
4. Consultar `GLOSARIO.md` para el vocabulario de dominio.
5. Leer las ADR relevantes, en particular alternativas descartadas y consecuencias aceptadas.
6. Consultar `5-estado/DEUDA.md` para contexto de deuda en la zona.
7. Consultar `1-producto/VISION.md` para descartar direcciones prohibidas.
8. **Construir el Modelo de Contexto**: la síntesis que prueba que se ha entendido la restricción del dominio.

### Fase ④: Verificación previa

Verificar compatibilidad con normas vigentes, decisiones previas (ADR), la visión y la completitud de Marbella OS.

**Puntos de decisión:**
*   Compatible con todo: Continuar a la fase 5.
*   **Bloqueo blando (escala al usuario):** Contradice una ADR vigente. No se puede proceder sin confirmación explícita.
*   **Bloqueo duro (rechazo automático):** Contradice `CANON`. No procede bajo ningún concepto.
*   **Advertencia:** Trabaja en zona sin documentación.
*   **Señalización:** Detecta discrepancia código/documentación.

### Fase ⑤: Planificación

1. Producir lista de ficheros de código a modificar.
2. Producir lista de documentos de Marbella OS a actualizar (`CANON §9`).
3. Evaluar el impacto en los documentos dependientes (`GRAFO.md`).
4. Declarar riesgos y supuestos.

### Fase ⑥: Ejecución

1. Código y documentación se modifican en el mismo cambio.
2. Registrar términos nuevos en `GLOSARIO.md`.
3. No citar documentos con `normativo: false`.
4. Citar afirmaciones por identificador (`AF-*`, `INV-*`), no duplicar su texto (`CANON §5`).
5. No inventar reglas ausentes (`CANON §12.5`).
6. Respetar normas operativas inmediatas.

### Fase ⑦: Cierre

1. Verificar que pruebas de código pasen y los invariantes no presenten regresiones.
2. Verificar documentación: actualización de la puerta de cambio, unicidad de hechos, registro de decisiones y deuda.
3. Ejecutar `npm run validate:corpus` si se tocó documentación.
4. Entregar el informe de cierre al usuario.

---

## Interacción con Marbella OS

### Identificación de documentos a modificar (Puerta de cambio)

| El agente cambia... | Actualiza... |
|---|---|
| Una regla de negocio | El documento de `3-ingenieria/dominio/` correspondiente |
| Un color, radio, sombra, espaciado | `2-diseno/TOKENS.md` |
| El contrato de un componente | `2-diseno/SISTEMA-DE-COMPONENTES.md` |
| Presencia de pantalla/capacidad | `1-producto/MAPA-DE-CAPACIDADES.md` |
| Se toma una decisión estructural | Una ADR nueva |
| Se asume compromiso a sabiendas | `5-estado/DEUDA.md` |
| Relevante para negocio | `5-estado/CHANGELOG.md` |

### Resolución de conflictos

Si dos documentos vigentes de la misma precedencia discrepan, hay una duplicación prohibida por `CANON §5`. El agente no elige, informa.

Si el código implementa una regla distinta a la normativa en Marbella OS, el código tiene el defecto. Si Marbella OS describe (de forma descriptiva) algo que el código ya no hace, la documentación está caduca y debe ser reparada.
