---
documento: SEGURIDAD
clase: vivo
estado: vigente
capa: ingenieria
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-07-29
caducidad: 3 meses
supersede: —
---

# SEGURIDAD — Quién puede ver y hacer qué

Cómo se decide el acceso en Marbella, y **qué está mal decidido hoy**. Este documento nace de una revisión hecha el 2026-07-29 contra el código y las 290 migraciones; los hallazgos están al final, con su registro en [DEUDA](../5-estado/DEUDA.md).

Marbella no guarda datos de clientes, pero sí **nóminas, cuentas bancarias, documentos de identidad, fichajes y la facturación completa del negocio**. Ese es el material a proteger.

---

## 1. Las tres barreras, en orden de importancia

```
1. Políticas de acceso en la base de datos   ← la barrera real
2. Verificación en la acción de servidor     ← la que evita el daño
3. Guardián de rutas                          ← solo experiencia de uso
```

**El guardián de rutas no protege datos.** Decide a qué pantalla se manda a alguien; no impide que una petición directa a la base de datos devuelva información. Si mañana desapareciera el guardián, ningún dato quedaría más expuesto de lo que ya está.

Corolario práctico: **añadir una comprobación en el guardián no arregla un agujero.** El agujero se arregla en la política de acceso.

---

## 2. Identidad

- Autenticación por correo y contraseña, gestionada por Supabase.
- La sesión viaja en cookies y se renueva sola.
- Recuperación de contraseña con enlace de un solo uso, que aterriza en el perfil.

El guardián lee la sesión **de la cookie, sin ir al servidor de autenticación**. Es una decisión consciente y está comentada en el código: la comprobación completa tarda, llegó a colgar el guardián y, en un límite de peticiones, **borraba la sesión**. Se aceptó porque la barrera real es la base de datos, que sí valida el testigo en cada petición.

---

## 3. Autorización: tres mecanismos que conviven

| Mecanismo | Dónde | Problema |
|---|---|---|
| `profiles.role` | Guardián, acciones, políticas | Es el mecanismo bueno |
| Correo electrónico concreto | Acceso maestro, `/dashboard/uso`, `/dashboard/web`, `/profile/contrato` | Identidad codificada, no rol |
| Rol dentro del testigo | Cinco políticas de `manager_ledger` | Se desincroniza |

**Tres mecanismos es dos de más.** Que el acceso maestro dependa de un correo concreto significa que **el sistema tiene una persona escrita dentro**. Funciona porque hay una sola persona en ese papel, y dejará de funcionar el día que haya dos o que esa persona cambie de dirección.

Hay incluso una función de base de datos con un nombre propio dentro (`is_hector_consumption_order_editor`). Es el mismo problema, un nivel más abajo.

Registrado como [D9](../5-estado/DEUDA.md#d9--autorización-por-correo-electrónico-para-el-acceso-maestro).

### Los cinco roles

`admin`, `manager`, `supervisor`, `staff`, `user`. La columna es texto libre, sin restricción: **un error de escritura crea un rol nuevo en silencio** y su portador pierde acceso sin explicación. Registrado como [D10](../5-estado/DEUDA.md); la matriz fiable está en [ACTORES-Y-ROLES](../1-producto/ACTORES-Y-ROLES.md).

---

## 4. El guardián de rutas

Vive en `src/proxy.ts`. Su lógica exacta, en orden:

1. **Se aparta de `/api/*`.** Ninguna ruta de máquina pasa por él.
2. Deja pasar sin sesión: `carta`, `eventos`, `pedido`, `reporte`, `propuestas`.
3. Una petición con cabecera `Next-Action` no se redirige a HTML (login o home): Next espera el payload de la acción, no una página.
4. Sin sesión y ruta protegida → al acceso.
5. Con sesión, comprueba por correo: acceso maestro, uso, analítica web, contrato.
6. Solo si hace falta, consulta el rol en la base de datos. Se evita a propósito en la mayoría de navegaciones, porque cada consulta añade latencia.
7. Con rol `staff` o `supervisor` fuera de las cuatro rutas permitidas → al panel de personal.

**Falla hacia adentro, no hacia afuera.** Si la consulta del rol supera 1,2 segundos, asume `staff`. La consecuencia de un fallo de red es que un responsable acabe en la pantalla de personal, no que un miembro del personal entre en la de responsable. Es la dirección correcta.

Las cuatro rutas de panel abiertas al personal son propinas, albaranes, escáner y eventos.

---

## 5. Rutas de máquina

25 rutas de API. Se autentican de tres maneras:

| Tipo | Cómo | Cuáles |
|---|---|---|
| Secreto compartido | Cabecera con clave | 6 webhooks, 3 tareas programadas |
| Sesión | Identidad del usuario | Documentos, avatar, exportaciones, uso |
| Público | Nada | Comprobación de acceso a propuestas |

Sobre los secretos:

- **Los webhooks fallan cerrados.** Si falta la variable, la comparación no cuadra y devuelven 401.
- **Las tareas programadas fallan abiertas.** La comprobación es `si hay secreto y no coincide, rechaza`: **sin la variable configurada, la ruta queda abierta a cualquiera.** Una de ellas recalcula los balances de toda la plantilla. Registrado como [D23](../5-estado/DEUDA.md).
- **Los seis webhooks comparten un único secreto.** No se puede rotar el de una integración sin romper las otras cinco.

Las rutas que sirven documentos sensibles —nóminas, documento de identidad— usan la clave de servicio, pero **después de comprobar la identidad en el propio manejador**. Es el patrón correcto: el archivo no es accesible directamente y la aplicación media cada descarga.

---

## 6. Políticas de acceso en la base de datos

- **60 tablas** tienen políticas activas.
- De las 56 creadas por migración, **52 la activan en la misma migración**. Es la norma en la práctica.
- Los ayudantes `is_manager()` e `is_manager_or_admin()` consultan `profiles`, no el testigo. Es lo correcto: leen el estado actual, no una copia.

### Lo que no está cubierto

**Tres tablas sin políticas y con permiso total para quien no tiene sesión.** Creadas el 2026-04-08, nunca corregidas:

- `estado_sala` — la radiografía completa del local: mesas, tickets, importes
- `kds_orders`, `kds_order_lines` — comandas de cocina

Tienen `SELECT, INSERT, UPDATE, DELETE` concedido a `anon`. La clave pública viaja en el paquete del navegador, así que **cualquiera puede leerlas y escribirlas**.

La pasarela que alimenta esas tablas usa la clave de servicio, **no la pública**. Es decir: el permiso a `anon` no lo necesita nadie y puede retirarse sin romper nada. Registrado como [D24](../5-estado/DEUDA.md).

### Cinco funciones de venta abiertas

Estas funciones son de tipo definidor —ignoran las políticas— y tienen ejecución concedida a quien no tiene sesión:

`get_ticket_sales_summary`, `get_tickets_marbella_page`, `get_product_sales_ranking`, `get_daily_sales_chart`, `get_daily_sales_stats`

Con la clave pública se obtiene **la facturación del negocio y el listado de tickets**. Registrado como [D25](../5-estado/DEUDA.md).

### Un caso que parece agujero y no lo es

La tabla `events` tiene una política de lectura para `anon`, pero el permiso de tabla se le retiró en la misma migración. La política es inerte. **Conviene arreglarlo igualmente**, porque una política y un permiso que se contradicen invitan a un error futuro: basta que alguien conceda el permiso creyendo que la política ya filtraba.

### Una tabla con el mecanismo antiguo

Las cinco políticas de `manager_ledger` leen el rol **del testigo**, no de `profiles`. Existe un disparador que copia el rol al testigo, pero **el testigo no cambia hasta que la sesión se renueva**: cambiar el rol de alguien no surte efecto inmediato. Es la única tabla que quedó sin migrar al mecanismo actual. Registrado como [D11](../5-estado/DEUDA.md), cuya descripción se ha corregido: es una tabla, no cinco.

---

## 7. Archivos

Once contenedores de almacenamiento. Cinco son públicos:

| Contenedor | Público | Valoración |
|---|---|---|
| `avatars`, `carta_items`, `recipe_videos`, `suppliers` | Sí | Correcto: son imágenes que se muestran |
| `ai_assets` | **Sí** | Audio de conversaciones. Se borra a los siete días |
| `box_images` | **Sí** | **Fotos de recuentos de caja** |
| `nominas`, `employee-documents`, `albaranes`, `cash_closings`, `pavilion_activities` | No | Correcto |

`box_images` público es un error: son fotografías de dinero contado, con fecha. Registrado como [D26](../5-estado/DEUDA.md).

`ai_assets` público es discutible. El borrado a los siete días limita la ventana, pero no justifica que sea legible sin sesión.

---

## 8. Secretos

**Todo lo que empieza por `NEXT_PUBLIC_` viaja al navegador.** Vale para la dirección del proyecto y la clave pública, que están diseñadas para ser públicas; **no vale para nada más**.

Privadas: clave de servicio, secreto de webhook, secreto de tarea programada, clave de OpenAI, claves de notificación, credenciales del ERP.

Reglas:

1. **La clave de servicio nunca en un componente de cliente.** Ignora todas las políticas de acceso.
2. Ninguna credencial en el repositorio. Se configuran en el entorno de despliegue.
3. Un secreto que se ve una vez se considera comprometido y se rota.
4. Los mensajes de error no incluyen detalles internos.

---

## 9. El cliente sin cuenta

Un cliente edita su encargo **con un identificador en el enlace, sin sesión**. Es una decisión de producto: exigir cuenta para un encargo de treinta personas haría que nadie lo usara.

Lo que la hace aceptable:

- El identificador es aleatorio y solo abre **un** encargo.
- El responsable puede cerrar la edición.
- No hay datos de terceros detrás: el cliente ve lo suyo.

Lo que hay que respetar al ampliarla: **el identificador no puede dar acceso a nada que no sea ese encargo.** Una función que reciba el identificador y devuelva más de lo estrictamente necesario rompe la premisa.

---

## 10. Al escribir código

- **Toda acción de servidor verifica identidad y permiso.** Es un punto de acceso público; el guardián no la cubre.
- **Toda tabla nueva nace con política.** En la misma migración.
- **Ningún permiso a `anon`** salvo decisión explícita, escrita aquí y con razón.
- **Una función definidora es un agujero potencial.** Solo se concede a quien no tiene sesión si el dato es realmente público.
- **La clave de servicio, solo en servidor**, y siempre después de comprobar quién pide.
- **Nunca un endpoint de depuración.** Se han encontrado y eliminado dos, uno con la clave de servicio y sin autenticación.

---

## 11. Lo que no hay

- **No hay registro de auditoría** de quién vio una nómina o cambió un fichaje. `import_runs` audita importaciones; el resto, nada.
- **No hay límite de peticiones** en ninguna ruta.
- **No hay segundo factor.**
- **No hay alertas.** Un acceso anómalo no avisa a nadie.
- **No hay revisión periódica de permisos.**

Las cinco son omisiones, no decisiones. **La cuarta es la que más pesa**: los agujeros de este documento llevan meses abiertos y se han encontrado leyendo migraciones, no porque nada avisara.

---

## 12. Orden de reparación

Por consecuencia real, no por dificultad:

1. **[D24]** Retirar el permiso a `anon` y activar políticas en `estado_sala`, `kds_orders`, `kds_order_lines`. Escritura anónima en producción.
2. **[D25]** Retirar la ejecución anónima de las cinco funciones de venta. Facturación al descubierto.
3. **[D26]** Hacer privado `box_images`.
4. **[D23]** Hacer que las tareas programadas fallen cerradas.
5. **[D11]** Migrar `manager_ledger` a los ayudantes de rol.
6. **[D9]** Sustituir el acceso por correo por un rol.

Los cuatro primeros son cambios pequeños y verificables. **No dependen de ningún rediseño.**
