# Recepción de documentos por Gmail — La Marbella

## Estado
Implementado en Marbella App y Supabase. **El transporte desde Gmail necesita instalar/actualizar el script en la cuenta real**; un commit de GitHub NO modifica un proyecto de Google Apps Script instalado.

Cuenta de recepción: `marbellaremote@gmail.com`.

## Instalación
1. Abrir Google Apps Script **desde la cuenta marbellaremote@gmail.com**. Crear un proyecto independiente (no sustituir los scripts de nóminas ni actividades).
2. Pegar el contenido de `integrations/apps-script/albaranes.gs`.
3. En *Configuración del proyecto > Propiedades del script*: establecer `WEBHOOK_SECRET` con el mismo valor existente en Vercel `WEBHOOK_SECRET`, o usar `ALBARANES_WEBHOOK_SECRET` en ambos. No pegar las claves en el código ni en GitHub.
4. Crear un activador temporal de `procesarAlbaranesEntrantes` **cada 5 minutos**.
5. Desactivar/borrar el activador de `procesarAlbaranesEntrantes` del proyecto antiguo si existiera, para evitar que sigan ejecutándose dos versiones.
6. Ajustar `FECHA_INICIO` de la configuración del script a la fecha de puesta en marcha. Por defecto comienza el 27 de octubre de 2026 para no importar por sorpresa el histórico.
7. Enviar a la cuenta un **PDF de prueba real** con asunto «Albarán de prueba», desde un remitente de proveedor o reconocido por el filtro. Ejecutar el script una vez manualmente para autorizar Gmail. Comprobar `/dashboard/albaranes/email` y registros de ejecución.

## Controles
- La cuenta de nóminas y las actividades se excluyen por remitente. El script no marca como leído ni cambia etiquetas.
- El servidor recibe `gmailMessageId`, `attachmentIndex`, remitente, asunto, fecha y documento binario original.
- Se rechazan adjuntos no PDF/JPEG/PNG, vacíos, mayores a 10 MB y peticiones sin token.
- El servidor conserva el original en el bucket privado `albaranes` bajo `email-inbox` y guarda un registro por mensaje/adjunto y por hash. Reenvíos idénticos se etiquetan como duplicados; no crean albaranes.
- Un manager elige proveedor y **tipo documental**. `delivery_note` = entrega; `monthly_invoice` = factura recapitulativa; `other` = documento no identificado.
- Solo después de esa decisión se crea una cabecera `purchase_invoices` con `source='email'`, se encola Mistral K3 y se conserva el enlace al original.
- Un email nunca confirma stock por sí solo: K5 auto-apply lo omite. En facturas mensuales además hay una salvaguarda en base de datos contra `PURCHASE` y `purchase_receipt_confirmations`. La conciliación con entregas anteriores es manual; las facturas mensuales NO deben generar una segunda recepción.
- Las fotografías de compras imprevistas siguen funcionando con `ScannerClient`, normalmente seleccionando proveedor «Otros».
- Don Hielo se registra en `/dashboard/albaranes/hielo`: cantidad física en kg, convertida a gramos de ingrediente Hielo, como ajuste manual auditado, sin registrar importe económico hasta que exista evidencia. El proveedor Don Hielo se mantiene separado del proveedor Hielo Fenix.

## Verificación
- Reenviar el mismo PDF en otro mensaje y confirmar un único registro original, el reenvío en `duplicate`.
- Dos adjuntos distintos del mismo mensaje generan dos registros independientes.
- Volver a pulsar «Guardar y leer»: la función de promoción debe devolver el mismo ID sin duplicar factura.
- Clasificar una factura mensual y comprobar que el trigger rechaza cualquier intento de incrementar stock desde sus líneas.
- Repetir una solicitud de Don Hielo con el mismo UUID: no debe duplicar el movimiento.
- Verificar que nóminas y actividades siguen funcionando y que no hay efectos económicos por recibir un simple correo.

## Limitaciones deliberadas
- No se clasifican proveedores por coincidencias probabilísticas de dominio. Las direcciones de proveedores en base de datos carecen de listas de dominios verificadas. El manager elige proveedor en la bandeja; con el tiempo se puede crear una lista verificada de remitentes.
- La recepción de mercancía y la conciliación fiscal son estados diferentes. El pipeline K3 extrae, pero ninguna factura mensual se contabiliza como un segundo suministro; vincular facturas mensuales con entregas sigue necesitando revisión explícita.
- No se importa automáticamente ningún correo histórico anterior a `FECHA_INICIO`.
- El webhook requiere tener un secreto configurado; no se ha cambiado ni revelado el secreto de producción.


## Remitentes verificados (27 octubre 2026)
La tabla `purchase_supplier_sender_addresses` vincula **18 direcciones completas a 14 proveedores**:
Sanilec, Ametller, Shers (2), Fritz Ravich, Carnicas Pijuan,
Sant Aniol (2), Nestle, Abril, Videla, Vino, Santa Teresa,
Meritem, Panabad (3), Zander.

La lista completa está versionada en
`supabase/migrations/20261027094000_purchase_supplier_sender_addresses.sql`
y en `integrations/apps-script/albaranes.gs`.
El webhook usa una coincidencia de dirección exacta para sugerir proveedor;
**no asume que un dominio compartido identifique inequívocamente al proveedor**.
La clasificación del tipo de documento y la confirmación de entrega
permanecen separadas. No se realiza OCR/stock automáticamente al recibir email.

La dirección `otificaciones@spairal.com` se ha mantenido exactamente como
la facilitó el responsable. Confirmar ortografía si dejan de llegar documentos.

**Excepciones sin email:** `/dashboard/albaranes/hielo` (Don Hielo, kg)
y `/dashboard/albaranes/vermut` (Vermut (proveedor), Vermut (producto), litros).
Ambas producen entradas de stock idempotentes con coste pendiente de
factura/justificante. Los originales recibidos posteriormente pueden
fotografiarse, pero los documentos de Don Hielo o Pons no pueden generar
otra recepción de stock: salvaguarda de base de datos + control K5.



## Automatización de producción revisada (27/10/2026, mediodía)
- Activador GAS `procesarAlbaranesEntrantes`: **cada hora** es suficiente; a cada ejecución transporta hasta 8 adjuntos nuevos. El procesamiento Mistral está programado en Supabase (job `marbella-mistral-process`, cada dos minutos).
- Los remitentes previamente confirmados se validan por dirección completa; el webhook llama `auto_import_purchase_email_document` y registra de forma idempotente factura + cola Mistral. Ninguna confirmación humana es necesaria para poner en marcha el OCR.
- Proveedores/desconocidos o suplantaciones quedan para revisión; nunca entran al stock por el mero hecho de enviar correo.
- Los albaranes identificados inequívocamente como **delivery_note** pueden pasar K5 automático después de OCR si el proveedor, número de documento, no-duplicación contra escáner y todas las equivalencias/costos superan K4/K5. No se rebajan controles de precio, reconciliación ni confianza por venir por Gmail.
- Facturas mensuales, anexos ambiguos, recibos de Don Hielo y Vermut y **todos los documentos del proveedor Otros** quedan excluidos del stock por trigger DB además del guard K5.
- `Otros`: cuando Mistral extrae un total positivo se guarda en `purchase_invoices.total_amount/base_amount` y se marca `mapped` **sin crear stock**. Si no existe IVA validado, se conserva el importe bruto como gasto y no se inventa un porcentaje. Históricamente, se recuperaron seis importes de OCR que figuraban como cero; hay un registro de auditoría `otros_expense_backfill_audit`.
- Antes de la nueva regla se habían creado cinco recepciones para `Otros`; se han dejado intactas para no modificar el inventario sin conciliación de mercancía.
- Las futuras compras de `Otros` escaneadas también pasan por el OCR automático y contabilizan su gasto; no necesitan mapearse a ingredientes.
- El código de la app debe desplegarse en Vercel tras el commit de `src/app/api/internal/albaranes/mistral-process/route.ts` y `src/app/api/internal/albaranes/k5/auto-apply/route.ts`. Las migraciones de Supabase por sí solas no activan la nueva lógica de la API.
- Excepciones OCR ambiguas quedan pendientes de revisión. Nunca se crean nuevos ingredientes por simple coincidencia de nombre o se convierten unidades arbitrariamente.


## UX unificada: Albaranes (27/10/2026)
- **No hay nuevas páginas para trabajar.** `/dashboard/albaranes` es la única lista: documentos Gmail verificados crean filas `purchase_invoices.source='email'` automáticamente; remitentes por validar también generan una fila visible, sin stock ni extracción hasta confirmar origen.
- La barra de Albaranes solo muestra los botones existentes (filtro, refrescar, Escanear). Se han eliminado los tres accesos a Email/Hielo/Vermut.
- **Escanear → Don Hielo:** modal oscuro compacto con número entero de **sacos**. Cada saco contiene 5 bolsas de 2 kg: **10 kg/saco**. `Guardar entrega` registra +10.000 g por saco en el ingrediente Hielo, y una fila normal de albarán con una línea descriptiva y sin importe ficticio.
- **Escanear → Vermut:** modal idéntico con número entero de **garrafas**. Cada garrafa son **10 litros**. `Guardar entrega` registra +10.000 ml por garrafa en el ingrediente Vermut y una fila normal de albarán, sin coste supuesto.
- Ambos modales ofrecen **Escanear un albarán o justificante**, la vía documental existente. Esta alternativa no debe contabilizar de nuevo el stock. El flujo rápido contabiliza mercancía física; la foto aporta evidencia separada.
- El registro físico y la fila de Albaranes se crean en **una transacción** por `public.record_manual_package_invoice`, protegida por UUID idempotente. Los usuarios manager/admin autorizados pueden guardar; no se registran dos entradas al reintentar el mismo UUID.
- Las filas manuales no tienen imagen obligatoria. El detalle muestra un mensaje «Entrega registrada sin justificante adjunto» y las trata como recibidas, sin avisos de OCR pendientes. Se han ocultado acciones destructivas; triggers de BD impiden que futuras ediciones las desincronicen del stock sin rectificación auditada.
- Enlaces antiguos `/dashboard/albaranes/email` redirigen al listado; `/hielo` y `/vermut` redirigen al mismo listado abriendo Escanear.
- El sistema no ha sufrido pruebas con entregas físicas de cliente; para validar usar una entrega real autorizada, nunca introducir cantidades ficticias.
