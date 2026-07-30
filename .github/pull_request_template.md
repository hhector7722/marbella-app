<!--
Plantilla de propuesta de cambio. Las preguntas de documentación cubren lo que
`npm run validate:corpus` no puede comprobar por sí solo: si un hecho tiene un
solo dueño y si el cambio de comportamiento dejó rastro. Borra lo que no aplique.
-->

## Qué cambia y por qué

<!-- Qué comportamiento es distinto después de esto, y qué problema resuelve. -->

## Cómo se ha comprobado

<!-- Qué se ha ejecutado o mirado para saber que funciona. -->

---

## Documentación

Marca solo lo que aplique. Si el cambio no toca comportamiento visible, norma de diseño ni regla de negocio, salta esta sección entera.

- [ ] **Puerta de cambio** (`CANON §9`): el documento que gobierna esto está actualizado en este mismo cambio, o abajo está escrito por qué no procede.
- [ ] **Dueño único** (`CANON §5`): no he copiado ningún hecho que ya estuviera escrito en otro documento. Donde lo necesitaba, he enlazado o he citado su identificador.
- [ ] **Compromiso a sabiendas**: si he aceptado uno, está en `5-estado/DEUDA.md` con su coste y su disparador.
- [ ] **Decisión estructural**: si he cerrado alternativas razonables, hay un ADR nuevo.

### Si este cambio toca dos o más documentos normativos

- [ ] He ejecutado `npm run report:overlap` y ninguna pareja nueva señala el mismo hecho escrito dos veces.
- [ ] Si un documento se apoya en otro, lo declara en `depende_de` (`ADR-0004`).

<!--
Por qué no procede actualizar documentación, si es el caso:

-->
