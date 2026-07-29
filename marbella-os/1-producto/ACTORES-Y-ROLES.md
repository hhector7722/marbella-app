---
documento: ACTORES-Y-ROLES
clase: vivo
estado: vigente
capa: producto
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-07-29
caducidad: 6 meses
supersede: —
---

# ACTORES Y ROLES

Quién usa Marbella, con qué permisos y en qué condiciones físicas. Este documento es la **única definición fiable del modelo de roles**, porque la base de datos no lo enumera: `profiles.role` admite cualquier cadena de texto.

Los términos están definidos en [GLOSARIO](../GLOSARIO.md). Las consecuencias técnicas de esta matriz están en [SEGURIDAD](../3-ingenieria/SEGURIDAD.md).

---

## 1. Actores

### Persona en turno

Trabaja en barra, cocina o sala. Su interacción con Marbella ocurre entre dos tareas reales.

- **Dispositivo**: móvil propio o tableta compartida, aplicación instalada.
- **Condiciones**: de pie, poca luz, prisa, manos ocupadas o mojadas, red irregular.
- **Sesión típica**: menos de treinta segundos.
- **Necesita**: fichar, ver sus horas, consultar la carta, ver su horario, registrar propinas y consumo.
- **Le hace daño**: cualquier paso adicional, cualquier objetivo pequeño, cualquier espera.

### Responsable de operación

Dirige el servicio y cuadra el día.

- **Dispositivo**: tableta en barra, móvil, ocasionalmente ordenador.
- **Condiciones**: de pie durante el servicio, sentado al cierre.
- **Sesión típica**: minutos, con interrupciones constantes.
- **Necesita**: cerrar caja, gestionar horarios y fichajes del equipo, recibir mercancía, preparar eventos, revisar precios.
- **Le hace daño**: perder el trabajo a medias por una interrupción; no poder corregir un error propio.

### Responsable del negocio

Decide sobre dinero, personal y estrategia.

- **Dispositivo**: cualquiera, con preferencia por pantalla grande para análisis.
- **Sesión típica**: variable; consultas rápidas durante el día y análisis largos fuera de servicio.
- **Necesita**: coste laboral, margen, ventas, horas extras, uso del sistema, cierres históricos.
- **Le hace daño**: una cifra que no puede reconstruir; dos pantallas que no coinciden.

### Cliente

Única audiencia externa. Nunca tiene sesión.

- **Dispositivo**: su propio móvil.
- **Necesita**: consultar la carta o completar un encargo por enlace.
- **Le hace daño**: cualquier fricción; no volverá a intentarlo.

### Sistemas externos

No son personas pero consumen y alimentan el producto: el terminal de venta, el correo de la gestoría, el correo de proveedores, la programación del pabellón. Su contrato está en [3-ingenieria/integraciones/](../3-ingenieria/integraciones/).

---

## 2. Roles y su alcance

Cinco valores de rol están en uso, más una condición de acceso que no es un rol.

| Rol | Actor que lo encarna | Alcance |
|---|---|---|
| `admin` | Responsable de operación con permisos plenos | Panel de gestión completo |
| `manager` | Responsable de operación | Panel de gestión completo, incluida la analítica de negocio |
| `supervisor` | Persona en turno con responsabilidad parcial | Área de equipo, más un subconjunto acotado de gestión |
| `staff` | Persona en turno | Área de equipo, más el mismo subconjunto acotado |
| `user` | Valor residual sin semántica clara | Tratar como `staff` hasta que se resuelva |

**Master** no es un rol: es una condición que se resuelve por dirección de correo electrónico. Da acceso a las superficies de gobierno del sistema (analítica de uso, analítica web, panel maestro, edición de contrato). Se decide así porque el usuario maestro puede no tener perfil en la base de datos, y su acceso no debe depender de que exista.

`supervisor` y `staff` tienen hoy exactamente el mismo alcance de acceso. La distinción existe en los datos pero no en los permisos; hasta que se le dé contenido, es deuda de modelo y está registrada en [DEUDA](../5-estado/DEUDA.md).

---

## 3. Matriz de acceso

Tres niveles de superficie:

### Pública — sin sesión

Accesible por cualquiera con el enlace. No expone datos de personas ni de dinero del negocio.

- Carta pública
- Formulario público de encargo por evento
- Encargo privado por token en la dirección
- Formulario público de reporte de actividades

El token de un encargo es la única credencial: quien tiene el enlace, tiene acceso a ese encargo. Es una decisión consciente en favor de la ausencia de fricción para el cliente, y su límite está registrado como [D12](../5-estado/DEUDA.md).

### De equipo — cualquier sesión válida

- Panel de equipo, fichaje, historial de horas propio
- Horario propio y calendario
- Carta interna
- Propinas, reservas, actividades del pabellón
- Perfil propio y documentos propios

### De gestión — según rol

- **`admin` y `manager`**: panel de gestión completo, ventas, sala, cocina, caja, tesorería, libro mayor, coste laboral, horas extras, inventario, compras, recetas, carta, importaciones.
- **Solo `manager` y `admin`**: análisis de negocio.
- **`staff` y `supervisor`**: dentro del panel de gestión solo alcanzan propinas, albaranes, escáner y eventos. Cualquier otra ruta les devuelve a su panel de equipo.
- **Master**: todo lo anterior más analítica de uso, analítica web, panel maestro y edición de condiciones de contrato.

---

## 4. Reglas de comportamiento del acceso

Cuatro reglas que gobiernan el acceso y que son decisiones de producto, no detalles de implementación.

**Fallo abierto hacia el mínimo privilegio.** Si el rol no se puede determinar a tiempo, la persona entra en el área de equipo. Nunca se la deja ante una pantalla en blanco y nunca se le concede más de lo mínimo. Prioriza el principio 7 sin sacrificar el 8.

**Cada rol tiene un destino propio.** Al entrar, cada persona aterriza donde puede trabajar: el equipo en su panel de equipo, la gestión en el panel de gestión, el maestro en el suyo. Nadie ve una pantalla que no le sirve.

**Una redirección no es un error.** Intentar acceder a algo fuera de alcance devuelve a la persona a su territorio en silencio. No se le reprocha, no se le explica: se le lleva donde puede seguir trabajando.

**Comprobar el rol cuesta.** La verificación de rol implica consultar la base de datos, y hacerlo en cada navegación degrada el producto para todos. Por eso solo se comprueba en las rutas que realmente lo necesitan, y el resto se resuelve con la sesión. Es una decisión explícita a favor del principio 7.

---

## 5. Personas ocultas y personas inactivas

Hay perfiles que existen en los datos pero no deben aparecer en las vistas operativas: plazas de reserva, cuentas de sistema, personas de baja. La regla es que **la visibilidad depende del propósito de la vista, no del estado de la persona**:

- Vistas operativas del equipo (horarios, propinas, reparto): solo personas activas y visibles.
- Vistas de análisis histórico y de uso: todas las personas, incluidas bajas, porque excluirlas falsea el pasado.

Confundir ambos criterios provocó en el pasado que personas reales desaparecieran de sus propios datos. La distinción es normativa.
