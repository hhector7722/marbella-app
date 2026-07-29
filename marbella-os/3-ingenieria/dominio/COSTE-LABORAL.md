---
documento: DOMINIO-COSTE-LABORAL
clase: vivo
estado: vigente
capa: ingenieria
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-07-29
caducidad: 6 meses
supersede: docs/COSTE_LABORAL_DIARIO_SSOT.md
---

# DOMINIO · Coste laboral

Cómo se calcula lo que cuesta el personal. **Es el único lugar donde vive esta fórmula.** Antes estaba escrita en tres documentos distintos, con el riesgo evidente de que divergieran.

Términos en [GLOSARIO](../../GLOSARIO.md). Decisión que gobierna las horas: [ADR-0001](../../4-decisiones/ADR-0001-hours-engine-productor-unico.md).

---

## 1. Fórmula

```
coste total del día = coste ordinario del día + coste de extras del día
```

Dos sumandos con orígenes completamente distintos y ninguna tarifa inventada por medio.

---

## 2. Coste ordinario

**Origen único: el resumen mensual de nóminas de la gestoría**, en su campo de coste total de empresa. Ver [integración de nóminas](../integraciones/NOMINAS.md).

```
coste ordinario del día = coste total de empresa del periodo / días naturales del periodo
```

Reglas, todas ellas normativas:

- **El prorrateo es por días naturales** del periodo que declara el documento, de su fecha inicial a su fecha final, ambas incluidas.
- **No se divide entre días trabajados ni entre días con fichaje.** Es coste de empresa, y la empresa lo paga los siete días de la semana.
- La suma de los días del periodo es exactamente el coste total de empresa. El último día absorbe el residuo de céntimos.
- **Filtrar por persona no reduce el coste ordinario**, porque no es un coste por persona: es el coste de la empresa.
- Es la misma regla de prorrateo que usa el estado financiero, deliberadamente.

**Si falta el resumen del mes, el coste ordinario no es cero: es desconocido.** La pantalla lo declara con un error visible y no pinta un cero. Es una aplicación directa del principio 2.

**Lo que no se usa como origen del coste ordinario**, y no debe volver a usarse: las funciones de coste laboral heredadas, la tabla de condiciones de coste por perfil, el coste mensual almacenado en el perfil, y cualquier tarifa horaria.

---

## 3. Coste de las horas extras

**Origen único: el motor de horas**, a través de su valor estimado de liquidación.

- **No se recalculan tarifas ni se estiman importes** en ningún consumidor.
- El reparto entre los días de la semana usa los pesos de extras por día, la misma cadena que alimenta el historial de la persona y la pantalla de horas extras.
- Por construcción, el importe de una semana coincide en las tres pantallas que lo muestran. Una discrepancia es un defecto grave, no una diferencia de criterio.

---

## 4. Consumo en la interfaz

| Elemento | Contenido |
|---|---|
| Celda del calendario | Total del día: ordinario más extras |
| Indicador de ordinario | Suma del coste ordinario del periodo |
| Indicador de extras | Suma del coste de extras del periodo |
| Indicador de coste sobre ventas | Coste total dividido entre la venta neta |
| Detalle del día | Una fila de nómina de empresa para el ordinario, más una fila por persona solo con sus extras |

El detalle del día refleja la naturaleza de cada sumando: el ordinario es de la empresa y no se reparte entre personas; las extras sí son de cada persona.

---

## 5. Indicador de coste sobre ventas

El porcentaje de coste laboral sobre ventas es el indicador vigilado del negocio.

- Se calcula sobre venta **neta**, no bruta.
- **Un valor por encima del 35% se considera crítico** y debe destacarse visualmente, no solo mostrarse.
- Nunca se muestra sin acceso a las magnitudes que lo componen, según [PATRONES P12](../../2-diseno/PATRONES.md#p12--detalle-de-dato).

---

## 6. Invariantes

Comprobables, y su incumplimiento es un defecto:

1. La suma de costes ordinarios diarios de un periodo es igual al coste total de empresa de ese periodo.
2. El importe de extras de una semana es idéntico en el historial de la persona, en la pantalla de horas extras y en el coste laboral.
3. Filtrar por persona no cambia el coste ordinario del periodo.
4. Sin resumen mensual, el coste ordinario se declara desconocido, nunca cero.
5. Ninguna pantalla calcula ni una parte de estas magnitudes: las lee.
