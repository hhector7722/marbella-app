---
documento: ADR-0015
clase: inmutable
estado: vigente
capa: decisiones
normativo: true
precedencia: 80
responsable: propiedad del producto
decidido: 2026-09-18
depende_de: —
supersede: —
---

# ADR-0015 · Alta laboral por token de un solo uso

## Contexto

El alta de un trabajador nuevo ocurría fuera del producto: un documento para que el candidato rellenara, otro para el gestor y una ficha en el perfil que se copiaba a mano. El candidato no tiene sesión. Los datos incluyen documento de identidad, afiliación a la Seguridad Social e IBAN.

Ya existe un enlace con identificador para que un cliente edite **un** encargo. Esa premisa no cubre datos personales de un trabajador.

## Decisión

1. El alta laboral es **un expediente** (`employment_intakes`). El candidato rellena, el maestro completa el contrato, de ahí sale el PDF al gestor y, al crear o vincular la cuenta, la ficha.
2. El candidato accede con un **token aleatorio de un solo uso**, caducable. En base de datos se guarda el **hash**, nunca el token en claro. Quien tiene el enlace ve solo ese expediente: vacío o ya enviado.
3. **No hay permiso a `anon`** sobre el expediente, `profiles` ni el almacenamiento. La escritura pública entra por el servidor, con clave de servicio, **después** de comprobar el token.
4. Las imágenes del documento van al contenedor privado `employee-documents`, nunca a `/public/personal/`.
5. Categoría profesional y tipo de contrato viven en el expediente (y en el PDF). No entran en `hours_contract_terms`. Las horas semanales y las fechas sí se copian al tramo de contrato al aplicar.

## Alternativas descartadas

| Alternativa | Motivo de descarte |
|---|---|
| Dos documentos (candidato / gestor) | El mismo dato se escribe dos veces y diverge. Viola el principio de introducir una vez. |
| Crear la cuenta en el momento en que el candidato envía | El contrato lo completa el maestro; la cuenta no puede nacer a medias. |
| Conceder `anon` a la tabla del expediente | Abre PII a quien tenga la clave pública. El token se valida en servidor. |
| Reutilizar el token de encargo (`client_edit_token`) | Ese identificador abre un pedido, no una persona. Mezclarlos rompería la premisa de [SEGURIDAD §9](../3-ingenieria/SEGURIDAD.md). |
| Guardar el DNI en `/public/personal/` | Ampliaría [D29](../5-estado/DEUDA.md). El disparador de pago de esa deuda es el almacenamiento privado. |

## Consecuencias

- La superficie pública gana un formulario de alta. Hay que declararlo en actores y en el guardián.
- Crear un usuario desde el expediente usa la API de administración de autenticación, solo tras comprobar al maestro.
- El legado de fotos en `/public/personal/` permanece; las altas nuevas no lo usan.
