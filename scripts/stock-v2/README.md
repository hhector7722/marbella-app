# Stock 2.0 — reconstrucción en paralelo (piloto 2026-10-09)

## Estado

**Simulación implantada en Supabase. No sustituye `public.stock_current`.**
Esquema `stock_v2`, no expuesto a usuarios `anon` ni `authenticated`. Primer `run_id`: `3a0e2663-dabd-4849-a893-17b3b4c20289`, periodo 2026-03-08 a 2026-10-09 (primera carga de albarán registrada; no confundir con `invoice_date`, que contiene documentos mucho más antiguos).

### Archivos y ejecución

- `00-private-shadow-schema.sql`: creación del esquema privado con RLS sin políticas públicas.
- `01-shadow-replay-2026-03-to-10.sql`: snapshot único con el `run_id` anterior; ventas desde líneas originales del TPV combinadas con `map_tpv_receta` y recetas ACTUALES. Compras solo desde el ledger ya existente. **No ejecutar de nuevo contra otra fecha sin nuevo run y auditoría.**
- `02-waste-and-diagnostics.sql`: simulación de mermas, ajustes de fuentes separados, incidencias y vistas administrativas.
- `03-verify-shadow.sql`: pruebas SQL de lectura; no cambia los datos.

El contenido histórico de recetas **no está versionado**: no utilizar las salidas de `sale_recipe_estimate` para cobrar, comprar automáticamente o fijar stock físico sin conciliación.

## Hallazgos iniciales

- 111.920 líneas originales de tickets TPV (desde 2024), de las cuales 111.793 vinculadas a receta en el conjunto completo.
- Desde 08/03/2026, 5.855 líneas de tickets enlazadas a 23 recetas **sin ingredientes**. Principales casos: Lomo (1.159), Longaniza (933), Plato Marbella (718), Mediterráneo (619), Pollo bocadillo (495), Tortilla patatas (450). Son ausencias de ficha técnica, no productos OCR.
- 2.008 impactos de ingredientes con conversión de unidad no justificada, que se han **excluido** del balance simulado.
- 118 líneas de ticket sin correspondencia con receta.
- 62 albaranes capturados sin movimientos PURCHASE trazados: **no incorporar sus compras hasta conciliación individual y autorización K4, con protección contra duplicados**.
- 61 líneas de inventarios físicos registradas en dos inventarios pendientes, solo 37 ingredientes distintos. **No se ha certificado ningún inventario ni aplicado un stock inicial falso.**
- Compras legales/económicas de `public.stock_movements` y `public.stock_current` no se modifican ni se resetean.

## Regla de cálculo

El saldo de `stock_v2.relative_balance` representa `compras conocidas - consumos por tickets con receta actual - mermas declaradas` y **supone apertura cero solo a efectos de simulación**. Puede ser negativo, sin significar existencias negativas físicas.

Los inventarios se comparan en `stock_v2.inventory_comparison` como evidencias sin certificar. Dado que los consumos históricos usan la receta actual y podrían faltar compras e inventarios iniciales, su discrepancia no debe interpretarse como merma real.

## Siguiente puerta para producción

1. Versionar los enlaces TPV–receta y cantidades de ingredientes por periodo, para reconstruir 2026 sin aplicar recetas de octubre a meses anteriores.
2. Resolver las 23 recetas vacías y conversiones no verificadas, empezando por los artículos de mayor volumen de venta. No inventar ingredientes ni formatos.
3. Completar la conciliación de albaranes de Mistral y K4 con el ledger histórico, excluyendo documentos y hojas duplicadas.
4. Certificar un inventario **completo** (no únicamente 37 ingredientes), fecha y unidades como ancla.
5. Correr una nueva simulación, validar diferencias por ingrediente y permitir corte a Stock 2.0 **solo en una operación explícita y reversible**.
