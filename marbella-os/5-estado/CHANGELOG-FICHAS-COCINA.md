---
documento: CHANGELOG-FICHAS-COCINA
clase: inmutable
estado: vigente
capa: estado
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-09-29
caducidad: no aplica
---

# Fichas de elaboración · 2026-09-08

- Añadido generador interno de fichas de elaboración en /playground/fichas-cocina.
- Reutiliza las recetas existentes de public.recipes.
- Añade persistencia específica para imágenes por paso y puntos operativos.
- Incluye plantilla A3 fija y generación de PDF.

## 2026-09-29

- El editor pasa a una composición específica de escritorio y smartphone.
- La ficha fija incorpora imagen principal, identidad Marbella y jerarquía visual unificada.
- Se añade orientación A3 horizontal o vertical, con horizontal como valor por defecto.
- Vista previa, PDF e impresión comparten la misma plantilla visual.
- Categoría, raciones y elaboración siguen teniendo su fuente de verdad en public.recipes.
- Orientación, imagen principal específica, imágenes por paso y puntos operativos se guardan en public.recipe_kitchen_sheets.

- La ficha final elimina rótulos auxiliares, Puntos clave y No hacer; los pasos quedan sin cards ni contornos y las imágenes se muestran completas sin recorte.
