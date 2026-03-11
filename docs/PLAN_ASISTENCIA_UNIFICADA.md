# Plan: Asistencia unificada (History + Registros) — Estética única

## Principio de estética única

**La página de asistencia tiene una sola estética desde el principio:** la de `/staff/history`. Tanto la vista general (plantilla) como la vista por empleado y la edición comparten el mismo diseño. No debe haber “cambio de look” al filtrar por empleado ni al abrir el modal de edición: todo es ya estilo history.

- Contenedor: tarjeta blanca `rounded-2xl shadow-xl` sobre fondo azul `#5B8FB9`.
- Cabecera: petróleo `#36606F`, misma altura y tipografía (mes/año, flechas, selector de personal).
- Contenido: bloques por semana con la misma estructura que [WeekCard](src/app/staff/history/WeekCard.tsx):
  - Cabecera de días LUN–DOM solo en la primera semana: `grid grid-cols-7`, `bg-gradient-to-b from-red-500 to-red-600`, misma altura y fuentes.
  - Celdas de día: mismo `min-h-[85px]`, bordes `border-r border-gray-100`, misma tipografía y espaciado.
  - Resumen semanal (cuando aplique): misma barra inferior con HORAS, PENDIENTES, EXTRAS, IMPORTE.

La única diferencia entre “plantilla” y “un empleado” es el **contenido de cada celda**, no el layout ni los estilos.

---

## Vista general para managers (plantilla) — Misma estructura que history

En la vista “Plantilla” (manager sin filtro de empleado):

- **Misma estructura visual que history:** lista de semanas; cada semana es un bloque con cabecera LUN–DOM (solo en la primera semana) y grid de 7 columnas. Mismos componentes de contenedor y cabecera de página.
- **Datos:** `time_logs` del mes + `profiles` (como hoy en registros), agrupados por semana y por día.
- **Contenido de cada celda:** en lugar de un solo usuario (H, Ex, entrada/salida), se muestra la **plantilla** ese día: varios fichajes en la misma celda, con la **misma estética de celdas** que WeekCard:
  - Misma altura mínima, mismos bordes, mismo fondo blanco/hover.
  - Por cada empleado con fichaje ese día: una línea compacta (iniciales + hora entrada – hora salida, o punto verde/rojo + texto) usando la misma paleta (emerald entrada, rose salida, eventos F/E/B/P con los mismos colores).
  - Si hay muchos empleados, scroll interno o truncar a N (ej. 4) y “+X más”, igual que en registros pero con el estilo visual de la celda de WeekCard (tipografía `text-[9px]`, mismos espaciados).
- **Resumen semanal:** en vista plantilla el pie de cada semana puede ser solo informativo (ej. “N trabajadores”) o omitirse; no hace falta HORAS/PENDIENTES/EXTRAS por ser multi-persona. La barra puede mantener la misma altura y estilo (fondo blanco, borde) para no romper el ritmo visual.
- **Interacción:** clic en un día abre DaySummaryModal → elegir empleado → AttendanceDetailModal. Sin cambio de “pantalla” ni de estilo.

Así, al entrar un manager a asistencia ve desde el primer momento la misma estética que verá al filtrar por empleado; solo cambia la densidad de información en las celdas (varios vs uno).

---

## Vista por empleado (manager con filtro) y staff

Sin cambios respecto al plan anterior:

- Manager con empleado seleccionado: `get_monthly_timesheet` de ese usuario, lista de WeekCards con resumen semanal y, para manager, controles de overrides (Bolsa/Pago, Contrato, Aplicar) en el pie de cada semana.
- Staff: siempre su propio mes con WeekCards.

Misma cabecera, mismo contenedor, mismos WeekCards; cero cambio de estética.

---

## Edición

- Modal de día (AttendanceDetailModal): ya usa cabecera roja y tarjetas alineadas con el sistema. Opcional: flechas anterior/siguiente día.
- Overrides de semana: en el pie del WeekCard (solo manager + empleado seleccionado), mismos colores y tipografía que el resumen (compacto, sin otro “modo” visual).

Todo sigue dentro de la misma estética history.

---

## Implementación técnica resumida

1. **Una sola página:** [src/app/staff/history/page.tsx](src/app/staff/history/page.tsx).
2. **Dos “modos” de contenido, misma UI:**
   - **Plantilla (manager, sin filtro):** fetch `time_logs` + `profiles`; construir semanas/días; renderizar **el mismo layout que WeekCard** (mismo grid 7 cols, misma cabecera roja LUN–DOM, mismas clases de celda), con un componente tipo `PlantillaWeekCard` o `WeekCard` con prop `variant="plantilla"` que en cada celda pinta una lista de logs (varios usuarios) con el mismo estilo que las celdas actuales (misma fuente, mismos colores, misma estructura de línea).
   - **Un empleado (staff o manager con filtro):** como ahora: `get_monthly_timesheet` + WeekCard actual.
3. **Reutilizar al máximo:** cabecera de días (LUN–DOM), contenedor de semana, estilos de celda de WeekCard; solo el contenido interno de la celda cambia (array de logs por día vs un solo DayData).
4. **Registros:** redirect a `/staff/history`; todas las referencias apuntan a `/staff/history`. No se usa la estética antigua de registros en ninguna vista.

Con esto se cumple que la página general para managers tenga desde el principio la estética de history, y que filtrar por empleado o entrar en edición no suponga ningún cambio de estética.
