---
documento: FICHAS-COCINA
clase: vivo
estado: vigente
capa: producto
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-09-29
caducidad: 12 meses
depende_de: —
---

# Fichas de elaboración de cocina

Herramienta interna para convertir recetas existentes de public.recipes en fichas operativas A3 con una plantilla visual fija.

## Principio

RECETA EXISTENTE → DATOS VISUALES → PLANTILLA FIJA → A3/PDF

No existe editor libre ni diseño por receta. La misma plantilla se adapta a A3 horizontal y A3 vertical; horizontal es la orientación por defecto.

## Datos

La fuente de verdad de nombre, categoría, ración, tiempo y elaboración sigue siendo public.recipes.

La configuración específica de la ficha contiene:

- imagen opcional por paso;
- imagen principal opcional que sustituye solo dentro de la ficha a recipes.photo_url;
- puntos clave manuales;
- puntos de “No hacer” manuales;
- orientación A3 horizontal o vertical.

La plantilla no genera ni altera fotografías automáticamente. Las presenta con ratios y recorte coherentes.

## Editor

En escritorio, edición y vista previa conviven en dos zonas de trabajo.

En smartphone, edición y vista previa son modos separados de la misma herramienta. Todos los campos, imágenes, pasos y acciones de guardado deben poder completarse desde móvil sin desbordes horizontales.

## Salidas

Vista previa, PDF e impresión usan la misma composición visual y respetan la orientación elegida.

La ficha incluye identidad Marbella, nombre de receta, metadata, imagen principal, pasos con número, imagen y texto, además de puntos clave y no hacer.

## Acceso

La herramienta vive inicialmente en /playground/fichas-cocina, protegida por el layout master de Playground.

## Persistencia

public.recipe_kitchen_sheets guarda únicamente la información específica de la ficha; no duplica la receta. La orientación y la imagen principal específica de la ficha se persisten ahí.
