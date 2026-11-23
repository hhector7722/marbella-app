# BDP Handy · cliente experimental de lectura

**Estado:** prototipo aislado, no conectado a Marbella App ni a PuenteBDP. No escribir ni registrar mesas/comandas desde este módulo.

## Hallazgos contrastados en TPV1 (23/11/2026)

- El puerto TCP 50000 acepta conexiones desde TPV1.
- La APK local `BDP_AndroidHandy.apk` contiene el cliente de comunicaciones y mensajes Protobuf; no se incluye la APK ni ninguna DLL del fabricante en este repositorio.
- El cliente construye las consultas de estado de mesas con un byte de correlación, el comando `CmdPpalConsultaEstadoMesas = 19`, el número de salón en ASCII y un byte nulo.
- La respuesta se correlaciona mediante el primer byte y la lista de mesas llega como Protobuf delimitado por longitud.
- `Config_Android` tiene cuatro posiciones con IP asignada, pero la IP del ordenador TPV1 no está registrada como Handy. La consulta real desde TPV1 aceptó la conexión TCP, pero expiró sin respuesta. La relación con la autorización de IP es probable, no demostrada.
- Solo se identificó una base de datos SQL Server, la de producción. No se han creado mesas, líneas, documentos ni cobros.

## Contenido

- `handy-client.cjs`: constructor de consultas, transportador TCP de una sola operación y validador básico Protobuf; no implementa operaciones de escritura.
- `handy-client.test.cjs`: pruebas de protocolo con servidor simulado; ninguna prueba se conecta a BDP.

## Pruebas sin conexión a BDP

```bash
node --test handy-client.test.cjs
node handy-client.cjs
```

El comando sin argumentos solamente muestra la trama que se enviaría. La ejecución real exige una activación explícita y un origen cuya IP esté autorizado en BDP, verificado antes de operar. No activar el modo en vivo en el TPV1 actual.

## Pendiente antes de conectar Marbella App

1. Disponer de un entorno de pruebas autorizado sin mesas ni operaciones fiscales reales.
2. Verificar inicio de sesión, permisos, identidad del dispositivo y posible límite de licencia Handy.
3. Verificar la respuesta Protobuf real, identificar el esquema de los estados y confirmar la lectura de mesas.
4. Implementar comandos mutadores únicamente después de contar con confirmaciones, deduplicación y pruebas sobre un entorno aislado.

**Sin cambios a la configuración, al servicio BDP ni al flujo de ventas.**