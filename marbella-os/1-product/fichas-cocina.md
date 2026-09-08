---
class: product
state: adopted
---

# Fichas de elaboración de cocina

Herramienta interna para convertir recetas existentes de `public.recipes` en fichas operativas A3 con una plantilla visual fija.

## Principio

`RECETA EXISTENTE → DATOS VISUALES → PLANTILLA FIJA → A3/PDF`

No existe editor libre ni diseño por receta.

## Datos

- Receta existente: nombre, categoría, ración, tiempo, foto y elaboración.
- Imagen opcional por paso.
- Puntos clave manuales.
- Puntos de “No hacer” manuales.

## Acceso

La herramienta vive inicialmente en `/playground/fichas-cocina`, protegida por el layout master de Playground.

## Persistencia

`public.recipe_kitchen_sheets` guarda únicamente la información específica de la ficha; no duplica la receta.
