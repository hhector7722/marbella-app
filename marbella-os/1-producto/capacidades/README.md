---
documento: capacidades
clase: vivo
estado: vigente
capa: producto
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-07-29
caducidad: 6 meses
supersede: —
---

# Especificaciones de capacidad

Una especificación por capacidad del [MAPA-DE-CAPACIDADES](../MAPA-DE-CAPACIDADES.md). **Se escriben bajo demanda**, no en bloque: una capacidad se especifica cuando se va a intervenir en ella.

La razón es deliberada. Diecinueve especificaciones escritas de golpe serían diecinueve documentos sin verificar que caducarían juntos. Un catálogo con huecos declarados es honesto; un corpus de documentos vacíos, no.

## Cuándo escribir una

- Antes de rediseñar la capacidad.
- Antes de cambiar una regla de negocio visible.
- Cuando una discusión sobre la capacidad se repite por tercera vez.
- Cuando alguien nuevo tiene que trabajar en ella.

## Estructura obligatoria

```markdown
---
documento: CAPACIDAD-<NOMBRE>
clase: vivo
estado: borrador
capa: producto
responsable: ...
revisado: YYYY-MM-DD
caducidad: 6 meses
supersede: —
---

# <Capacidad>

## Propósito
Qué problema resuelve y qué pasaría si no existiera.

## Actores y contexto
Quién la usa, desde dónde y en qué condiciones.

## Superficies
Pantallas y documentos que la materializan.

## Reglas visibles
Reglas que la persona percibe. No implementación.

## Estados
Estados posibles de sus entidades y transiciones permitidas.

## Casos límite
Qué pasa cuando falta un dato, cuando hay conflicto, cuando se corrige el pasado.

## Fuera de alcance
Qué NO hace esta capacidad, para cerrar la frontera con las vecinas.

## Dependencias
Capacidades, contratos, integraciones y decisiones que la gobiernan.
```

## Qué no va aquí

- Detalles de implementación → [3-ingenieria](../../3-ingenieria/).
- Reglas de cálculo profundas → [3-ingenieria/dominio](../../3-ingenieria/dominio/).
- Aspecto y comportamiento de la interfaz → [2-diseno](../../2-diseno/).
- Estado de avance → [5-estado/ESTADO](../../5-estado/ESTADO.md).
