# Acceso transversal a datos de Marbella App desde el asistente

## Objetivo

El chat no debe improvisar importes ni preguntar identificadores internos. Todas las fuentes de lectura
autorizadas se anuncian mediante la herramienta común `consultar_datos_aplicacion`.
El modelo elige qué fuentes necesita; el servidor determina **tablas, columnas,
fechas, roles, filtrado y tamaño**.

No significa acceso SQL libre: eso eludiría controles y expondría DNI, datos bancarios,
ubicaciones de fichajes o teléfonos. La lista de fuentes se mantiene explícita y ampliable.

## Fuentes conectadas

Plantilla, horas extras y su liquidación oficial, contratos y tarifas históricas,
costes laborales, nóminas individuales y agregados mensuales, fichajes, horas previstas,
cierres de caja, albaranes, líneas de albaranes, pedidos de compra, recetas,
ingredientes, proveedores, reservas, inventario y movimientos de stock.
Las ventas por artículo y las recetas con composición completa mantienen sus herramientas
especializadas. Otras fuentes preexistentes incluyen pedidos de sala y manuales.

La llamada acepta de una a cuatro fuentes simultáneas, opcionalmente empleado por nombre,
texto de búsqueda, fechas y límite de filas. Los contratos se resuelven por **vigencia
que se solapa**, no solo por fecha de alta del tramo.

## Permisos

- Sólo `manager/admin`: nóminas, contratos y tarifas, liquidación monetaria de extras,
  costes laborales, fichajes de terceros, caja, albaranes y movimientos de stock.
- Personal operativo: recetas, reservas y stock según rol; responsables operativos pueden
  consultar plantilla, compras, ingredientes y proveedores.
- Nadie accede a columnas de DNI, teléfono personal, dirección, banco o coordenadas por esta herramienta.
- Cada herramienta se ofrece filtrada por el rol obtenido de `profiles`, se vuelve a
  autorizar en servidor y se ejecuta con el cliente Supabase de la **sesión real**:
  los RLS vigentes aplican además del control de aplicación.
- El catálogo es de **solo lectura** y nunca usa `service_role` ni acepta SQL/campos libres.
- Una tabla nueva debe mapearse explícitamente para hacerla accesible sin riesgo.
  No se alteran políticas RLS, grants ni permisos de otros módulos.

## Ejemplo real

Consulta «¿cuánto tiene que cobrar extra Mamadou la semana pasada?».
Fuente de verdad: `weekly_snapshots` (proyección persistida por Hours Engine).
Para semana 19–25/10/2026: 54,5 h trabajadas, 40 h ordinarias,
14,5 h extras, 8 €/h, **116 € de extras**, sin registrar como pagadas.
El resultado muestra estado real de liquidación; no confundir coste de nómina
con el coste de horas extras.

La consulta reutiliza el contexto del periodo en seguimientos; el motor no
debe multiplicar todas las horas trabajadas por una tarifa por defecto.

## Limitaciones

Existen áreas no mapeadas en esta primera versión (cámaras, adjuntos privados,
OCR no indexado, registros sensibles ajenos y determinados datos de interfaz).
El chat debe indicarlo cuando no exista una fuente, no inventar información.
Los resultados acotados por filas avisan de truncamiento. Los datos recuperados
que se envían a Groq deben limitarse a lo necesario y respetar el tratamiento de datos.
