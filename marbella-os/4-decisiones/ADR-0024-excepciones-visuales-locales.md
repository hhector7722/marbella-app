---
documento: ADR-0024
clase: inmutable
estado: vigente
capa: decisiones
normativo: true
precedencia: 80
responsable: propiedad del producto
decidido: 2026-10-07
depende_de: ADR-0010, EXPERIENCIA, TOKENS, SISTEMA-DE-COMPONENTES
supersede: —
---

# ADR-0024 · Excepciones visuales locales y explícitas

## Contexto

Las reglas de diseño fijan valores por defecto para botones, espaciados, tamaños y composición. Algunos elementos tienen un diseño concreto que se aparta de esos valores. Las comprobaciones que buscaban una clase o una forma exacta de escribir el CSS también rechazaban diseños equivalentes, aunque compartiesen la misma regla visual.

Propiedad del producto decide que una excepción visual concreta se acepte sin un trámite de aprobación adicional. La regla general debe seguir aplicándose a los elementos que no declaran excepción.

## Decisión

1. Los tokens, componentes y patrones definen el **valor por defecto**. Una especificación local explícita puede apartarse de él solo en el elemento y la propiedad que identifica.
2. La excepción identifica el elemento, la propiedad o composición distinta y su motivo. Puede expresarse como una prop de componente o como `data-design-exception="regla:motivo"` en el elemento. La mera presencia de estilos locales no convierte automáticamente cualquier desviación en excepción.
3. Las comprobaciones verifican el resultado y aceptan esa excepción declarada. No deben depender de que una regla CSS esté escrita en un selector exclusivo si el mismo resultado se obtiene mediante un selector compartido.
4. Button mantiene texto XOR icono por defecto. La composición icono + texto exige `composition="icon-and-text"` y `exceptionReason`; el nombre accesible sigue siendo obligatorio cuando solo hay icono.
5. Un botón nativo de diseño propio puede declararlo con `data-design-exception="native-business-button:motivo"`. Un hijo raíz de Modal con un inset local deliberado puede usar `data-design-exception="modal-root-padding:motivo"`. El padding solo inferior no duplica el inset superior o lateral del Modal.
6. Un tamaño táctil, espaciado o tratamiento visual distinto puede ser excepción local expresa. No cambia el valor por defecto ni autoriza una exención de toda la pantalla.

## Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| Prohibir todas las desviaciones | Rechaza decisiones visuales concretas de producto. |
| Desactivar las comprobaciones de diseño | Perdería la protección del valor por defecto. |
| Considerar excepción cualquier clase local | Confundiría una decisión deliberada con una desviación accidental. |
| Mantener listas de rutas completas como única excepción | Oculta qué elemento y qué propiedad se apartan de la norma. |

## Consecuencias

- Las excepciones quedan cerca del elemento y son revisables junto a él.
- Las comprobaciones siguen fallando ante desviaciones sin declaración expresa.
- ADR-0010 conserva la jerarquía visual canónica; esta decisión precisa cómo se registran las excepciones locales a sus valores por defecto.
