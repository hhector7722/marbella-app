# Política de jornada fija — usuario específico

**Estado:** Aprobada (referencia funcional)  
**Fecha:** 2026-07-24  
**Ámbito:** Horas laborales / liquidación / costes / KPIs  
**Código:** sin cambios — este documento fija la interpretación correcta.

---

## Sujeto

Aplica **únicamente** al usuario:

`hhector7722@gmail.com`

- **No** es una regla del rol `manager`.
- **No** debe heredarse automáticamente por otros usuarios.
- Cualquier otro empleado manager/fijo **no** hereda esta política por el solo hecho del rol.

---

## Motivo de negocio

Este usuario tiene disponibilidad continua (24/7). Su jornada real no se representa bien con fichajes normales:

- múltiples franjas en el día;
- tareas de gestión fuera del establecimiento;
- horarios que cambian de forma continua;
- fichar todas las entradas/salidas no refleja el trabajo real.

Por decisión funcional, **no utiliza el sistema de fichajes como el resto del personal**.

---

## Comportamiento de referencia (debe mantenerse)

| Unidad | Horas ordinarias automáticas |
|--------|------------------------------|
| Día laborable | **8 h** ordinarias |
| Semana completa | **40 h** ordinarias |

Estas horas son **horas ordinarias reales** a efectos del sistema. No son un dato meramente visual ni informativo.

### Fórmula semanal

```text
total_semanal = 40 h base (ordinarias)
              + todas las horas fichadas (extras)
```

- Las **40 h base** no se sustituyen por fichajes.
- Todo fichaje es **tiempo adicional** y se clasifica como **horas extra**.
- Este comportamiento (base + fichajes = total; fichajes = extras) es el correcto y debe preservarse.

---

## Impacto obligatorio

Las 40 h (y las 8 h/día laborable) participan **exactamente igual** que cualquier hora ordinaria en:

- costes laborales;
- coste por hora;
- coste de personal;
- KPIs;
- dashboards;
- resúmenes;
- liquidaciones;
- snapshots;
- cálculos semanales;
- cualquier proceso que use horas ordinarias.

---

## Relación con tip-pool

Existe lógica de tip-pool que también fuerza base 40 h para el mismo email (`hhector7722@gmail.com`).  
Ese dominio (propinas) es **coherente en intención** con esta política, pero **no la define**.  
La política laboral aquí documentada es independiente y prevalece sobre lecturas del tipo «solo tip-pool».

---

## Acoplamiento técnico actual (deuda conocida)

Hoy el productor SQL materializa un comportamiento equivalente vía:

`role = 'manager' OR is_fixed_salary → total_hours := 40 + fichajes`

Eso es un **acoplamiento de implementación**, no la definición funcional.

| Qué dice la política | Qué hace el código hoy |
|----------------------|-------------------------|
| Solo `hhector7722@gmail.com` | Condición por rol/fijo (más amplia) |
| Jornada fija 40 + fichajes = extras | `40 + v_logs_sum`; balance de extras = fichajes |

**No modificar** esa rama ahora: el comportamiento observado para este usuario es la referencia.  
Corregir el acoplamiento (restringir a email / flag de empleado) es trabajo **futuro**, no una “eliminación del bug 40 h”.

---

## Evolución futura (no implementar aún)

Sustituir el acoplamiento por una política explícita de empleado, por ejemplo:

- `attendance_mode = FIXED_WEEK`
- `clocking_required = false`
- `fixed_weekly_hours = 40`

La forma concreta se decidirá más adelante. Hasta entonces, el comportamiento funcional actual es la **referencia** y **no debe modificarse**.

---

## Implicaciones para Shadow / Hours Engine / Iteraciones

| Tema | Decisión |
|------|----------|
| ¿Es un bug SQL a eliminar (antigua Iteración C)? | **No.** |
| Clasificación residual Héctor | **Regla de negocio** (no corregir SQL para “igualar” HE a 0). |
| Hours Engine / tramos con `weekly_hours = 0` | Divergencia conocida vs productor SQL para este usuario; **no** forzar alineación quitando las 40 h SQL. |
| Iteración C (“quitar manager=40”) | **Descartada** salvo cambio explícito de criterio funcional. |
| Tip-pool / dashboards / costes | Seguir consumiendo las horas como ordinarias reales. |

---

## Conclusión

La asignación automática de **40 horas semanales** para `hhector7722@gmail.com` **no es un error del sistema**.

Es una **política funcional deliberada**.

Debe mantenerse exactamente igual, incluidos todos sus efectos sobre costes, horas ordinarias, liquidaciones, métricas y cálculos de negocio.

Las horas registradas mediante fichajes son **siempre adicionales** a esa jornada base y deben seguir tratándose como **horas extra**.
