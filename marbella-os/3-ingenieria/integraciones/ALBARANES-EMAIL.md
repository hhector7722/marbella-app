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
