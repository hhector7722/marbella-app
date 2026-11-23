# BDP Handy · cliente experimental de lectura

**Estado:** prototipo aislado, no conectado a Marbella App ni a PuenteBDP. No escribir ni registrar mesas/comandas desde este módulo.

## Hallazgos contrastados en TPV1 (23/11/2026)

- El puerto TCP 50000 acepta conexiones desde TPV1.
- La APK local `BDP_AndroidHandy.apk` contiene el cliente de comunicaciones y mensajes Protobuf; no se incluye la APK ni ninguna DLL del fabricante en este repositorio.
- El cliente construye las consultas de estado de mesas con un byte de correlación, el comando `CmdPpalConsultaEstadoMesas = 19`, el número de salón en ASCII y un byte nulo.
- La respuesta se correlaciona mediante el primer byte y la lista de mesas llega como Protobuf delimitado por longitud.
- `Config_Android` tiene cuatro posiciones originales de Handy con IP asignada. La quinta posición estaba inicialmente vacía.
- **Prueba temporal autorizada del 23/11/2026**: desde la configuración oficial de BDP en TPV1 se añadió `192.168.1.100` exclusivamente en `IP_Handy5`, sin alterar las IP existentes. Al estar BDP en su pantalla de ventas, el puerto TCP `50000` estaba escuchando; una única consulta de mesas del cliente experimental fue aceptada en TCP pero el servidor **cerró la conexión antes de entregar respuesta**. La consulta no demostró un protocolo de aplicación válido.
- Tras esa prueba se retiró `IP_Handy5`, se restauró la pantalla de ventas y se compararon **los 34 campos** de `Config_Android` con un respaldo previo: `changedFields: []`. La configuración quedó idéntica a la original.
- Marbella Server (`192.168.1.200`) y TPV1 (`192.168.1.100`) usan redes locales físicamente separadas pese a compartir rango de direcciones; no pueden conectarse directamente. La integración prevista continúa siendo Marbella App → Supabase → agente de TPV1 → BDP.
- **Inspección del 23/11/2026 a última hora**: el agente Remote Desktop Commander de TPV1 aparece **offline**. Por tanto, no se ha podido verificar una sesión real de uno de los Handy autorizados ni inspeccionar el cierre inmediato durante esa sesión.
- **Hipótesis pendientes**: identidad/licencia, protocolo de capa superior, codificación o framing, respuesta de error no interpretada por el cliente experimental. No elegir ninguna explicación sin capturar/interpretrar un intercambio válido.
- **Nueva inspección al reconectar TPV1 el 23/11/2026**: BDP estaba en menú general y por tanto los puertos Handy no escuchaban. Se reabrió el turno existente en `TPV Táctil`, sin generar otro turno ni operaciones de venta. Los puertos `50000` y `55000` volvieron a quedar en LISTEN.
- Las IP `192.168.1.109` y `192.168.1.110` respondieron a una comprobación de red; `.107` y `.108` no respondieron. **No se ha identificado el modelo ni confirmado que los dos dispositivos que responden estuvieran ejecutando Handy en ese momento**.
- Durante una observación pasiva de 12 segundos, **cero conexiones TCP establecidas** en los puertos Handy. No había tráfico que comparar y no se enviaron mensajes de prueba a BDP.
- La inspección de bytecode de `ConexionSocket` muestra que cada `Send` obtiene un socket TCP, escribe la trama y espera una respuesta; `IniciarComunicacionInternal` no envía un saludo por sí mismo. Esto **no descarta** identificación previa desde otra parte de la aplicación.
- Intentar consultar el estado de `pktmon` devolvió acceso denegado. No se elevaron privilegios ni se alteraron filtros, firewall, controladores o captura de red.

- Solo se identificó una base de datos SQL Server, la de producción. No se han creado mesas, líneas, documentos ni cobros.

## Contenido

- `handy-client.cjs`: constructor de consultas, transportador TCP de una sola operación, validación Protobuf y descodificación de los estados de mesa; no implementa operaciones de escritura.
- Esquema identificado en la APK: `ProtoSalonEstadoMesas.estadomesas = 1` (repetido); `ProtoMesaEstado`: mesa = 1, código de ocupación = 2, mesa principal = 3, juntada = 4 y reservada = 5. El código de ocupación se conserva como número sin interpretar etiquetas no verificadas.
- `handy-client.test.cjs`: nueve pruebas de protocolo y descodificación con servidor simulado; ninguna prueba se conecta a BDP.

## Pruebas sin conexión a BDP

```bash
node --test handy-client.test.cjs
node handy-client.cjs
```

El comando sin argumentos solamente muestra la trama que se enviaría. La ejecución real exige una activación explícita y un origen cuya IP esté autorizado en BDP, verificado antes de operar. No activar el modo en vivo en el TPV1 actual.

## Pendiente antes de conectar Marbella App

1. Recuperar la conectividad de TPV1 a través de Remote Desktop Commander. No se requiere cambiar configuración ni reiniciar BDP para este paso.
2. Con BDP operativo, comprobar **pasivamente** si los Handy existentes (`192.168.1.107` a `.110`) mantienen conexiones al puerto `50000`. No capturar contenido sensible ni interferir con pedidos o pagos.
3. Si se observa una sesión legítima, analizar solo su **inicio de conexión y framing**, con captura acotada de forma temporal y acceso restringido, para distinguir entre autenticación, handshake y errores de formato. Los datos reales de comandas no deben incorporarse al repositorio.
4. Comparar un mensaje real de consulta de mesas y su respuesta con la trama experimental `[token, 19, salón ASCII, 0]`, **sin asumir que sea correcta** hasta comprobarlo en tráfico real. Verificar que el decodificador Protobuf reproduce las mesas vistas en el TPV.
5. Mantener **bloqueados** los comandos mutadores y no desplegar el cliente a Marbella App hasta disponer de autorización/licencia válida, control de duplicados, confirmación de persistencia y un entorno de pruebas aislado.

**Sin cambios a la configuración, al servicio BDP ni al flujo de ventas.**