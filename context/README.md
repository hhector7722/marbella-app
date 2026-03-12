# Carpeta `context/` – Fuentes legacy y reglas de negocio

Esta carpeta es la **fuente de verdad** para migrar lógica y datos desde sistemas antiguos (AppSheet, Excel, CSV) al proyecto Bar La Marbella.

## Qué colocar aquí

- **CSV/Excel de referencia:** por ejemplo `Empleados.csv`, exportaciones de proveedores o productos, resúmenes de horas.
- **Documentación de fórmulas:** archivos de texto o capturas que describan cómo se calculaban campos en el sistema legacy (ej. `Recalcular-ResumenHoras.txt`, imágenes tipo `resumenhoras.png`).
- **Mapeos y glosarios:** tablas de equivalencia entre nombres legacy y columnas/tablas en Supabase.

## Uso por el agente

- Las habilidades **migrador-legacy-appsheet** y **auditor-horas-nominas** (y otras que lo indiquen) deben **leer esta carpeta** cuando necesiten replicar fórmulas o validar datos históricos.
- **Si la carpeta está vacía** o no contiene el archivo relevante, el agente no debe inventar datos ni fórmulas; debe indicar que faltan fuentes o preguntar al usuario.

## Estructura sugerida (opcional)

```
context/
├── README.md           (este archivo)
├── Empleados.csv       (ejemplo: datos legacy de empleados)
├── Recalcular-ResumenHoras.txt
├── resumenhoras.png    (capturas de referencia)
└── ...
```

Añade los ficheros que uses para migraciones o auditorías según vayas trabajando.
