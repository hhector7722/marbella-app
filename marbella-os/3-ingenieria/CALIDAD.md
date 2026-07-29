---
documento: CALIDAD
clase: vivo
estado: vigente
capa: ingenieria
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-07-29
caducidad: 6 meses
supersede: —
---

# CALIDAD — Qué se comprueba antes de dar algo por bueno

Qué se prueba, qué no, y cómo se decide si un cambio puede salir. Verificado el 2026-07-29.

---

## 1. La premisa

Marbella la desarrolla una persona y la usa un equipo pequeño en un negocio real. **No hay entorno de pruebas: se trabaja contra la base de datos de producción.**

Eso descarta las estrategias que suponen un entorno donde equivocarse. La estrategia viable es distinta:

> **Probar exhaustivamente lo que se traduce en dinero. Comprobar a mano lo que se ve. Aceptar que el resto se detecta usándolo.**

No es un ideal. Es lo que se sostiene con los recursos que hay. Documentarlo evita dos errores: creer que hay más red de la que hay, y pretender una cobertura que nadie va a mantener.

---

## 2. Lo que se prueba

**26 ficheros de prueba**, con el ejecutor nativo de Node y tipos borrados al vuelo. Se concentran en tres sitios:

| Zona | Ficheros | Por qué |
|---|---|---|
| Motor de horas | 16 | Un error paga mal a alguien |
| Sistema de sombra | 9 | Valida la migración del motor |
| Lector de nóminas | 1 | Un error importa un coste falso |

**El criterio es explícito: se prueba lo que produce dinero.** Horas, coste, nómina. Nada más tiene pruebas, y es coherente con la premisa: un fallo de interfaz se ve; un balance mal calculado no.

Las pruebas del motor son **de tabla**: entradas conocidas, resultado esperado. No tocan la base de datos, porque el motor no la toca. Es lo que las hace rápidas y fiables, y la razón por la que ese diseño se protege en [ARQUITECTURA](./ARQUITECTURA.md).

---

## 3. Tres agujeros en el propio andamiaje

Verificado, no supuesto:

**Los ficheros de prueba se enumeran a mano.** Trece guiones distintos, cada uno con su lista de ficheros. **No hay un guion que lo ejecute todo.** Añadir una prueba y no editar el `package.json` significa que la prueba no se ejecuta nunca.

**Tres pruebas ya están así**, escritas y sin ejecutar por ningún guion:

- `src/lib/staff/build-employee-weeks-from-logs.test.ts`
- `src/lib/read-models/week-display-from-engine.test.ts`
- `src/lib/hours-engine/persist-overtime-cost.test.ts`

Una prueba escrita que no se ejecuta es peor que no tenerla: **da confianza sin darla**.

**No hay comprobación de tipos como paso propio.** `tsconfig.json` tiene el modo estricto activado, pero no existe un guion que valide el proyecto entero. Los errores de tipo aparecen al construir o en el editor, no antes.

Registrado como [D22](../5-estado/DEUDA.md).

---

## 4. Lo que no existe

- **No hay pruebas de interfaz.** Ni de componentes ni de extremo a extremo. Ningún marco instalado.
- **No hay integración continua.** No existe `.github/`. Nada se ejecuta automáticamente al subir código.
- **No hay pruebas contra la base de datos.** Ni las políticas de acceso ni las funciones tienen comprobación automática.
- **No hay medición de cobertura.**

**La ausencia de integración continua es la que más pesa**, porque hace opcionales las otras tres: aunque hubiera pruebas, nada garantizaría que se ejecutasen.

Consecuencia directa: **los agujeros de [SEGURIDAD](./SEGURIDAD.md) llevaban meses abiertos y aparecieron leyendo migraciones**, no porque nada avisara. Una comprobación automática de permisos a `anon` los habría detectado el mismo día.

---

## 5. Comprobación a mano

Es la que de verdad se usa. Para que sirva tiene que ser explícita.

### Cualquier cambio visible

- Se ve en un móvil real, no solo en el navegador de escritorio reducido.
- Las zonas de interacción siguen alcanzables con el pulgar, ver [EXPERIENCIA](../2-diseno/EXPERIENCIA.md).
- Los ceros aparecen en blanco, ver [CONTENIDO-Y-TONO](../2-diseno/CONTENIDO-Y-TONO.md).
- Se comprueba con datos vacíos y con datos abundantes.

### Cualquier cambio en horas o coste

- Las pruebas del motor pasan.
- Se compara una semana conocida antes y después.
- Se comprueba una semana a caballo entre dos meses. **Es donde aparecen los errores de prorrateo.**
- Se comprueba una semana con cambio de hora. **Es donde aparecen los errores de zona horaria.**
- Si hay cambio de contrato de por medio, se verifica que el pasado no se ha reescrito.

### Cualquier migración

- Se lee entera antes de aplicarla, buscando lo destructivo.
- Si crea tablas, incluye su política de acceso.
- No concede permisos a quien no tiene sesión.
- Se aplica sabiendo que **no hay vuelta atrás**: no hay entorno donde ensayarla.

### Cualquier integración

- Se prueba con una entrada real, no inventada.
- Se comprueba qué pasa con una entrada mal formada. **Debe quedar registro del fallo, no silencio.**
- Se verifica que el secreto de acceso es obligatorio.

---

## 6. Reglas de escritura que sostienen la calidad

Complementan a [FRONTEND](./FRONTEND.md); aquí están por su efecto sobre lo comprobable.

1. **Un cálculo de dinero vive en una función pura**, sin base de datos dentro. Es la única forma de probarlo.
2. **Un fallo se registra, no se descarta.** Prohibido el retorno silencioso ante la falta de un dato vital.
3. **Un dato ausente se distingue de un cero.** Confundirlos produce informes plausibles y falsos.
4. **Una fecha local se construye componiendo año, mes y día.** Nunca interpretando una cadena, que desplaza el día.
5. **Un importe es decimal exacto**, nunca coma flotante.

Las reglas 3, 4 y 5 son las que han producido errores reales en este proyecto. No son teóricas.

---

## 7. Complejidad

Referencia, no norma. Los ficheros más largos:

| Fichero | Líneas |
|---|---|
| `src/types/supabase.ts` | 4 412 |
| `src/app/dashboard/history/page.tsx` | 2 894 |
| `src/app/dashboard/albaranes/actions.ts` | 2 409 |
| `src/app/dashboard/albaranes/AlbaranesHistoricoClient.tsx` | 2 139 |
| `src/components/staff/MenuAccordion.tsx` | 1 860 |

El primero es generado y, además, **nadie lo importa** (ver [MODELO-DE-DATOS](./MODELO-DE-DATOS.md)). Los demás están escritos a mano.

Un fichero de 2 000 líneas no es un error por sí mismo, pero **sí es una zona donde nadie puede afirmar que un cambio no rompe nada**. Al tocarlos: extraer lo que se toca, no reescribir el conjunto.

---

## 8. Qué haría falta primero

Por relación entre coste y beneficio:

1. **Un guion que ejecute todas las pruebas** descubriendo los ficheros, no enumerándolos. Coste: minutos. Recupera tres pruebas hoy inertes.
2. **Un guion de comprobación de tipos.**
3. **Integración continua con esos dos pasos.** Convierte lo anterior en garantía.
4. **Una comprobación automática de permisos a `anon`.** Habría evitado [D24](../5-estado/DEUDA.md) y [D25](../5-estado/DEUDA.md).
5. **Pruebas de las funciones de base de datos que duplican el motor**, para garantizar la paridad que hoy solo es intención.

Los tres primeros cuestan una tarde entre los tres y cambian la naturaleza del proyecto: **de "nada se comprueba solo" a "algo se comprueba siempre"**. Registrado en [ROADMAP](../5-estado/ROADMAP.md).
