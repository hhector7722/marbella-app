---
documento: PERFILES-ALBARANES-PROVEEDORES
clase: vivo
estado: vigente
capa: ingenieria
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-09-15
caducidad: 6 meses
depende_de: DOMINIO-PRECIOS-Y-COMPRAS, ADR-0012, ADR-0013, ADR-0014
supersede: —
---

# Perfiles de interpretación de albaranes por proveedor

Contrato canónico para interpretar, de forma determinista, las evidencias que
produce Docling. No es evidencia documental, no identifica ingredientes y no
escribe ningún hecho económico.

## 1. Límites y precedencia

Las seis capas tienen responsabilidades no intercambiables:

```
documento original
  → Docling / evidencia documental observada
  → perfil de proveedor
  → mapeo de artículo de proveedor a ingrediente
  → revisión humana
  → apply_receipt_line (K4)
```

| Capa | Autoridad sobre | No puede hacer |
|---|---|---|
| Documento original | El soporte físico recibido | Convertirse en dato económico por sí solo |
| Evidencia documental K3 | Texto, tabla, fila, celda y layout observados | Aplicar una regla de negocio o un mapeo |
| Perfil de proveedor | Semántica estable de encabezados, formatos y conversiones documentales | Ser evidencia o elegir un ingrediente |
| Mapeo de artículo | Relación de una referencia/presentación concreta con un ingrediente | Alterar semántica del documento |
| Revisión humana | Validación de una propuesta y de sus excepciones | Reescribir evidencia o perfiles históricos |
| K4 | Confirmación económica atómica | Recibir datos sin evidencia, mapeo y revisión |

El perfil no contiene coordenadas ni depende de la posición de una columna en
una fotografía. Reconoce encabezados, aliases y relaciones estructurales. La
geometría pertenece exclusivamente a la evidencia de Docling.

## 2. Formato canónico y versionado

Cada perfil vive en [`profiles/`](./profiles/) como JSON legible por personas y
máquinas. El contrato tipado y el normalizador puro viven en
`src/lib/albaranes/supplier-profiles/`.

Campos comunes:

| Campo | Finalidad |
|---|---|
| `schema_version` | Versión del formato de perfil, hoy `1` |
| `id`, `version` | Identidad estable y versión semántica del perfil |
| `supplier.id`, `canonical_name` | Referencia al proveedor real, sin renombrarlo |
| `aliases`, `observed_document_identities` | Nombres alternativos que permiten reconocer el emisor documental |
| `reference.file`, `reference.sha256` | Imagen canónica y huella que impide una sustitución silenciosa |
| `document_formats`, `fields` | Formatos conocidos, aliases de encabezados y su significado |
| `interpretation` | Tipo finito de interpretación y magnitudes permitidas; no es un DSL |
| `exclusions`, `needs_review`, `examples` | Excepciones explícitas, condiciones de parada y casos comprobables |

El resultado de una interpretación porta siempre `supplier_profile_id` y
`supplier_profile_version`. Cuando esta etapa se conecte a una propuesta
persistida, ambos valores deben conservarse con ella. Cambiar un perfil exige
una nueva versión de archivo; nunca se reinterpreta una propuesta o recepción
histórica con la versión nueva. K3 guarda evidencia sin perfil y K4 conserva la
versión de mapeo: esta fase no altera sus esquemas ni sus funciones.

## 3. Matriz de inventario verificada

Los 16 PNG se inspeccionaron y sus SHA-256 se verifican en la prueba de
regresión. Los nombres de negocio de `suppliers` se conservan aunque el emisor
documental sea distinto.

| Archivo | `supplier.name` | ID | Marca o razón social observada | Campos relevantes | Peculiaridad / regla | Duda o parada |
|---|---:|---:|---|---|---|---|
| `Abril.png` | Abril | 5 | Abril Distribucions Alimentaries | `QUILOS`, `PREU`, `IMPORT` | kg, EUR/kg, importe sin IVA | Si no concilia, revisión |
| `Ametller.png` | Ametller | 1 | Ametller Origen S.L. | Cantidad UNI/KG, precio, descuento, importe, IVA | Unidad varía por línea | Descuento no conciliado → revisión |
| `Carnicas Pijuan.png` | Carnicas Pijuan | 6 | Carnicas Pijuan S.L. | `CAIXA`, `PREU`, `IMPORT` | En este formato `CAIXA` es kg facturados | Cambio de semántica → revisión |
| `Cava.png` | Cava | 18 | Llopart Güell SL | Cantidad, precio, IVA, importe | Botellas; importe sin IVA | Volumen solo con dato/mapping |
| `Fritz Ravich.png` | Fritz Ravich | 12 | Frit Ravich | `ENV.`, `UNID.`, precio, `DTO.`, neto | Precio por unidad; neto sin IVA | DTO no conciliable → revisión |
| `Hielo Fenix.png` | Hielo Fenix | 13 | Hielo Fenix | bolsas, producto, total | Bolsa de 2 kg; total con IVA 10% | Sin kg de bolsa → revisión |
| `Meritem.png` | Meritem | 16 | Meritem / IFS Food | Cant., precio unitario, total, IVA | Total de línea sin IVA; SCRAP separado | SCRAP no es precio de línea |
| `Nestle.png` | Nestle | 10 | Nestlé | CJ, unidades/caja, contenido, precio, `%Dto`, neto | Precio por caja antes de descuento | Falta de pack/descuento → revisión |
| `Panabad.png` | Panabad | 2 | Panabad / IFS Food | cajas, Uds., `Preu`, `%`, `Import` | Precio por caja antes de descuento | Sin Uds./caja → revisión |
| `Sanilec.png` | Sanilec | 9 | Sanilec | presentación, cantidad, precio, importe | `3×5 L` son 15 L | Presentación incompatible → revisión |
| `Sant Aniol.png` | Sant Aniol | 11 | Prat Munne SL / Sant Aniol | cajas, unidades, descripción | PET 50 cl: 0,28 EUR/botella interno | PET 1 L excluido de stock/escandallo |
| `Santa Teresa.png` | Santa Teresa | 7 | Grup Santa Teresa | unidades, cajas, precio, importe, `PretIva` | Precio/importe sin IVA; `PretIva` unitario con IVA | Nunca tratar `PretIva` como total |
| `Shers.png` | Shers | 8 | SERHS Distribució i Logística | `TIP`, `PREU`, `DTO`, `P.UN`, importe | `P.UN` neto/acordado solo si concilia | `DTO` no se presupone porcentaje |
| `Vermut.png` | Vermut | 17 | Vins Pons | Unitats, `PREU BASE`, `TOTAL BASE` | 8 bombonas × 10 L = 80 L; EUR/L | Sin presentación completa → revisión |
| `Videla.png` | Videla | 3 | Pescados Videla S.A. | tara, piezas/bultos/kg, precio, importe | Conserva dimensiones independientes | Siempre revisión si relación ambigua |
| `Vino.png` | Vino | 14 | Celler de Capçanes | cajas, unidades, precio, Dto, importe | Unidades son botellas; cajas informativas | No usar cajas como cantidad económica |

## 4. `needs_review` es una salida, no un valor por defecto

La normalización devuelve `needs_review` sin proponer una aproximación si falta
un dato necesario, la unidad es desconocida, la presentación cambia, cantidad ×
precio no explica el importe, el descuento no es interpretable, la dimensión
física es incompatible, el proveedor no se reconoce, el artículo carece de
mapeo seguro, o no se puede normalizar precio o cantidad.

Están prohibidos los atajos: `NULL → 0`, factor de conversión `1`, conversión
silenciosa entre kg/l/unidad o una inferencia de LLM como hecho económico.
`ready_for_review` tampoco aplica nada: indica únicamente que la propuesta es
estructuralmente completa y está lista para una persona autorizada.

## 5. Excepciones de proveedor

### Sant Aniol

El documento no aporta un precio económico utilizable. El PET de 50 cl se
propone, por regla de negocio explícita, a 0,28 EUR por botella y es el único
elegible para stock y escandallos. El PET de 1 L es una compra personal pagada
posteriormente: se marca `excluded`, no cambia stock ni escandallos y no recibe
un precio propuesto.

### Zander

`Zander` (ID 4) es histórico y no tiene perfil nuevo. No se borra, modifica ni
impide auditar documentos existentes. La ausencia de guía no bloquea esta fase
ni una fase posterior.

### Otros

`Otros` (ID 21) no es un proveedor concreto sino una compra puntual de
emergencia. No tiene perfil semántico fijo ni reutiliza reglas de otro comercio.
Una interpretación económica no inequívoca devuelve `needs_review`; si un
comercio se vuelve recurrente, se da de alta como proveedor real con su perfil.

## 6. Pruebas y fixtures

[`src/lib/albaranes/supplier-profiles/fixtures/canonical-guides.v1.json`](../../../src/lib/albaranes/supplier-profiles/fixtures/canonical-guides.v1.json)
modela evidencia tabular que podría producir Docling. No usa PNG como input,
por lo que separa la calidad de extracción de la interpretación semántica.
`npm run test:supplier-profiles` comprueba los 16 perfiles, su correspondencia,
la huella de las imágenes, conversiones y las paradas de revisión. Estas
pruebas no importan ni invocan stock, precio, histórico, RPC ni K4.

## 7. Invariantes

1. La evidencia original y la evidencia Docling no se reescriben por un perfil.
2. Un perfil no contiene ni crea un mapeo de artículo a ingrediente.
3. Toda propuesta futura conserva la identidad y versión del perfil que la produjo.
4. Una ambigüedad se conserva como `needs_review`; nunca se completa por defecto.
5. Solo `apply_receipt_line(...)`, tras revisión y mapeo, puede producir el hecho económico.
