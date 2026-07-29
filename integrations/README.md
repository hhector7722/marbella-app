# Integraciones

Código que se ejecuta **fuera de la aplicación** y alimenta o consume datos de Marbella.

Estaba versionado como archivos de texto dentro de una carpeta de documentación, con despliegue por copiar y pegar. Era código de producción disfrazado de documento. Ahora es código.

## Contenido

| Carpeta | Qué es | Dónde se ejecuta |
|---|---|---|
| `tpv-bridge/` | Extractor que lee el ERP del punto de venta y envía el estado de sala | Máquina local del establecimiento |
| `gateway/` | Receptor HTTP que recibe del extractor y escribe en Supabase | Servicio expuesto a internet |
| `apps-script/` | Scripts de Google que procesan correo entrante: nóminas, albaranes y actividades del pabellón | Google Apps Script |

## Documentación

- Arquitectura y flujo de datos: [`marbella-os/3-ingenieria/integraciones/`](../marbella-os/3-ingenieria/integraciones/)
- Procedimiento de despliegue: [`marbella-os/3-ingenieria/operacion/RUNBOOK-BDP-VENTAS.md`](../marbella-os/3-ingenieria/operacion/RUNBOOK-BDP-VENTAS.md)

## Deuda conocida

**Ninguna de estas piezas tiene despliegue reproducible.** Se instalan copiando el archivo a su destino, sin versión desplegada conocida ni forma de volver atrás. Registrado como [D6](../marbella-os/5-estado/DEUDA.md).
