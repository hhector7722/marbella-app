---
documento: DOMINIO-JORNADA-FIJA
clase: vivo
estado: vigente
capa: ingenieria
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-07-29
caducidad: 6 meses
supersede: context/POLITICA_JORNADA_FIJA_HECTOR.md
---

# DOMINIO · Política de jornada fija

Política por la que una persona computa su jornada completa con independencia de sus fichajes, y todo fichaje suyo se clasifica como hora extra.

El documento anterior llevaba el nombre de una persona en el título. **Es una política que se aplica a un sujeto, no una política sobre un sujeto**: la distinción importa porque el sujeto puede cambiar y la política no.

---

## 1. Alcance

Se aplica **únicamente a los sujetos designados individualmente**. Hoy hay exactamente uno, identificado por su dirección de correo electrónico.

- **No es una regla de rol.** Ningún rol la hereda.
- **No es una regla de contrato fijo.** Ninguna persona la adquiere por tener jornada fija.
- Añadir un sujeto a esta política es una decisión de negocio explícita, nunca una consecuencia de un cambio de rol o de contrato.

---

## 2. Motivo de negocio

El sujeto tiene disponibilidad continua: varias franjas al día, tareas de gestión fuera del establecimiento y horarios que cambian a diario. Fichar cada entrada y cada salida no representaría su trabajo real, sino una fracción arbitraria de él.

Por decisión funcional, **no usa el sistema de fichajes como el resto del personal**.

---

## 3. Comportamiento normativo

| Unidad | Horas ordinarias automáticas |
|---|---|
| Día laborable | 8 horas |
| Semana completa | 40 horas |

```
total semanal = 40 horas ordinarias de base
              + todas las horas fichadas, clasificadas como extras
```

- **Las 40 horas de base no se sustituyen por los fichajes.** Se suman a ellos.
- **Todo fichaje es tiempo adicional** y se clasifica como hora extra.
- **Las horas de base son horas ordinarias reales**, no un valor informativo ni una etiqueta visual.

Esta es la referencia de comportamiento correcta. Cualquier implementación que la contradiga es la que está mal.

---

## 4. Alcance obligatorio de las horas de base

Las horas de base participan **exactamente igual que cualquier hora ordinaria** en todo lo que consuma horas ordinarias: coste laboral, coste por hora, coste de personal, indicadores, resúmenes, liquidaciones, la proyección semanal y cualquier cálculo semanal.

No hay ningún consumidor autorizado a excluirlas.

---

## 5. Relación con el reparto de propinas

El dominio de propinas fuerza una base equivalente para el mismo sujeto. Es **coherente en intención** con esta política, pero **no la define**.

Esta política laboral es independiente y prevalece. Nadie debe deducir su alcance leyendo el código de propinas.

---

## 6. Acoplamiento técnico: deuda conocida

El productor implementa hoy un comportamiento equivalente con una condición más amplia que la política: la aplica por rol o por marca de salario fijo, en lugar de por sujeto designado.

| Lo que dice la política | Lo que hace el código |
|---|---|
| Solo los sujetos designados individualmente | Condición por rol o por marca de salario fijo |
| 40 horas de base más fichajes como extras | 40 horas más la suma de fichajes; el balance de extras equivale a los fichajes |

**No se corrige ahora.** El comportamiento observado para el sujeto actual es la referencia y no debe alterarse. Restringir la condición al sujeto designado es trabajo futuro.

Consecuencia importante y contraintuitiva: **las 40 horas no son un defecto que haya que eliminar.** Se ha propuesto en el pasado «quitar las 40 horas del rol de gestión» tratándolo como error de implementación, y esa propuesta queda descartada salvo cambio explícito de criterio funcional.

---

## 7. Divergencia con el motor de horas

Para este sujeto existe una divergencia conocida entre el productor y un cálculo basado en tramos con jornada contratada de cero horas.

**No se resuelve forzando la alineación mediante la retirada de las 40 horas.** La divergencia se clasifica como regla de negocio, no como residuo a eliminar. Cualquier proceso de comparación entre productores debe declararla como esperada.

---

## 8. Evolución futura

Sustituir el acoplamiento por una política explícita del perfil, con la forma general de: modo de asistencia declarado, exigencia de fichaje declarada y horas semanales fijas declaradas.

La forma concreta se decidirá cuando se aborde. Hasta entonces, el comportamiento actual es la referencia y no se modifica.

---

## 9. Conclusión normativa

La asignación automática de 40 horas semanales al sujeto designado **no es un error del sistema**. Es una política funcional deliberada, y debe mantenerse con todos sus efectos sobre costes, horas ordinarias, liquidaciones e indicadores. Las horas fichadas son siempre adicionales a esa base y siempre horas extra.
