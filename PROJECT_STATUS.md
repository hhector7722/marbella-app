# BAR LA MARBELLA - PROJECT STATUS

**Última actualización:** 2026-02-14

## 📌 ESTADO GENERAL
El proyecto ha evolucionado de una versión inicial a "Bar Marbella Clean". Se ha integrado un sistema de reglas (`.agent`) para garantizar la calidad arquitectónica y la coherencia en la lógica de negocio (especialmente en nóminas y costes).

---

## ✅ COMPLETADO
- [x] **Infraestructura Base:** Next.js + Supabase Auth / SSR configurado.
- [x] **Redirección por Rol:** Implementación de lógica en `/` para dirigir a Managers a `/dashboard` y Staff a `/staff/dashboard`.
- [x] **Panel Admin:** Dashboard principal y navegación básica.
- [x] **Gestión de Staff:** Listado y detalles de empleados.
- [x] **Control de Horas:** Sistema de fichaje (`time_logs`) operativo.
- [x] **Histórico de Extras:** Vista de semanales con lógica de arrastre (Client-side).
- [x] **Protocolo AI:** Integración de habilidades especializadas.
- [x] **Nuevas Skills:** Creación e integración de `comprador-logistica-albaranes`, `analista-bi-marbella` (alerta ratio 35%) y `tester-especialista-marbella`.
- [x] **Refactorización Radical de Tesorería**: Esquema unificado en `treasury_log`, eliminación de 5 tablas legacy, automatización total mediante triggers, consolidación de 3 cajas (Operativa, Cambio 1, Cambio 2) y vistas de desglose de inventario.
- [x] Auditoría de Lógica: Comparando reglas `.agent` con implementación actual para evitar regresiones.
- [x] Refactorización de Utilidades: Centralizando cálculos de dinero y tiempo en Server Actions.
- [x] Optimización UI Kiosco: Ajustar botones y targets táctiles al estándar de 48px+ en navegación y fichaje.
- [x] Refinamiento Editor de Horarios: Implementación de inicio selectivo, botones de añadir/eliminar circularmente y modal de selección de personal.
- [x] Optimización UI Móvil: Aumento de altura en navegación inferior (h-20) y soporte para Safe Area.
- [x] Refinamiento Visual de Horarios: Colores en tiempos (entrada verde/salida roja), orden invertido y uso de solo nombres de pila.
- [x] Interconectividad Staff: Enlace directo a recetas en el dashboard de personal.
- [✅] Fase 27: Staff Dashboard Desktop Refactor.
- [✅] Fase 28: Refinamiento Estético Registros (Calendario Blanco, Month Picker).
- [✅] Fase 29: Mejoras ingredientes (Filtro Proveedores, Borrado Individual).
- [✅] Fase 30: Refinamiento Recetas (Fondo Blanco Imagen, Simplificación UX).
- [✅] Fase 31: Refactorización Layout Dashboard Staff (Ampliación Resumen/Fichaje v 2/3, Horarios v 1/3 e Iconos compactos).
- [x] Refinamiento Dashboard Admin (Batch 2): Cuadrícula 2x2 en cierres, colores restaurados y rediseño de tarjeta de caja inicial.
- [x] Optimización UI Staff: Resúmenes semanales en formato horizontal compacto y ajuste de posición del sello de pagado.
- [x] Refinamiento Estético Editor de Horarios: Barras sin contorno con mini-barras para entrada (verde) y salida (roja), fila de totales fija en 2ª posición, columna de eliminación a la derecha e integración de botón "+" como fila.
- [x] Refactorización Layout Dashboard Admin: Organización por filas en escritorio (Cierre vs Tesorería, Accesos vs Extras) con alturas equilibradas.
- [x] Refinamiento Dashboard Admin: Tarjetas de estadísticas compactas, independencia de expansión en columnas y refinamiento de sección Tesorería (Caja Inicial horizontal, cajas de cambio compactas sin scroll).
- [x] Estándar "Vista Marbella Detail": Unificación estética de Movimientos, Histórico y Horas Extras bajo un diseño corporativo de alta densidad y contraste.
- [x] Refactorización Galerías (Recetas e Ingredientes): Layout compacto multi-columna y sistema de filtros interactivos mediante popup para Categorías y Proveedores.
- [x] Refinamiento Staff (Fase 3): Texto centrado en actividad de horarios, barras con extremos redondeados (full-rounded) y barra de edición flotante de mayor altura (h-20) con efecto glassmorphism.
- [x] Unificación Estética Staff: Sincronización de cabeceras y resúmenes semanales entre Dashboard de Personal e Historial, compactando la información en filas horizontales de alta densidad.
- [x] Rectificaciones Críticas Dashboard: Restauración de cajas de cambio, corrección de altura de Tesorería, eliminación de marcos naranjas y estabilidad de KPIs en expansión de movimientos.
- [x] Rediseño Histórico de Extras: Transición al estándar "Vista Marbella Detail" con cabecera sólida, mini-KPIs horizontales y listado expandible de alta densidad.
- [x] Refinamiento Editor de Horarios: Extensión de marcadores de entrada (verde) y salida (roja) hacia el centro para mejor visibilidad táctil.
- [x] Selector de Plantilla Admin: Implementación de popup de selección en el dashboard de administración con redirección inteligente a perfiles.
- [x] Restauración de Horas Extras: Tarjetas moradas por semana, indicadores de estado (verde/naranja) y toggles de pago individuales por trabajador.
- [x] Refinamiento Caja Inicial: Eliminación de cabecera "Tesorería" y reposicionamiento del acceso "Ver más" junto a Movimientos.
- [x] Gestión de Producto: Modal de gestión con 6 categorías (Recetas, Ingredientes, Pedidos, Inventario, Stock, Proveedores).
- [x] Consistencia Global UX: Soporte para cierre de modales y popups al realizar click fuera (backdrop) en toda la aplicación.
- [x] Rediseño Registros: Calendario ultra-moderno integrado directamente sobre fondo azul, con cabecera roja y celdas blancas, unificado en un bloque con esquinas redondeadas.
- [x] Refactorización Dashboard Staff (Escritorio): Nueva disposición optimizada con Resumen/Fichaje a la izquierda (col-1) y Horarios proactivos/Iconos a la derecha (col-2).
- [x] Identificación Visual Tesorería: Integración de imágenes de billetes y monedas en todos los formularios de desglose de efectivo (Caja Inicial, Cambio, Arqueo).
- [x] Rediseño Perfil Corporativo: Transición de `/profile` a una tarjeta de alta densidad con estilo "Vista Marbella Detail", optimizada para táctil y alto contraste.
- [x] Refinamiento Staff (Móvil): Layout de doble columna en smartphone (Horarios 1/2 e Iconos 1/2) con etiqueta "Info" responsiva.
- [x] **Cierre de Caja Moderno**: Nuevo `CashClosingModal` multi-paso con soporte para clima, tickets y arqueo detallado, reemplazando la página legacy.
- [x] **Gestión Staff Transparente**: Restauración de etiquetas y visualización de valores cero en resúmenes semanales para trazabilidad total.
- [x] **Refinamiento Dashboard Admin**: Tarjetas de "Último Cierre" con diseño minimalista sin relleno, valores flotantes y acentos de color tipográficos.
- [x] **Consistencia Estética (Iconografía)**: Estandarización de iconos de navegación y acción a estilo "solid-fill" en Navbar, Dashboard, Histórico y Horarios.
- [x] **Corrección de Estabilidad Dashboard**: Resolución de errores de sintaxis JSX y balanceo de etiquetas en el panel de administración principal.
- [x] **Regla Zero-Display Global**: Implementación de norma para ocultar valores cero en vistas de lectura, con soporte en el protocolo de arquitectura y `lib/utils.ts`.
- [x] **Refactorización Layout Dashboard Admin**: Disposición en cuadrícula 2x2 con Cierre y Tesorería arriba, e Iconos y Horas Extras abajo.
- [x] **Unificación Estética Cierre**: Resumen de facturación integrado en un único bloque blanco sin tarjetas internas para mayor claridad.
- [x] **Optimización Tesorería**: Reorganización de cajas de cambio en fila y caja inicial expandida.
- [x] **Restauración de Identidad Visual**: Corrección de ruta del logotipo (`/icons/logo-white.png`) en Login y Navbar.
- [x] **Regla de Iconos Flotantes**: Eliminación de tarjetas de fondo en iconos de modales (Dashboard y Producto) para un diseño más limpio.
- [x] **Regla de Visibilidad de Modales:** Los modales deben ser 100% visibles (sin cortes) con scroll interno obligatorio si el contenido es extenso.
- [x] **Cumplimiento Zero-Display (Staff)**: Aplicación de la norma en el resumen semanal del dashboard de personal.
- [x] **Optimización UI Gestión de Caja**: Imágenes de moneda agrandadas (h-24/h-20), modales ensanchados (max-w-2xl/4xl) y layouts sin scroll para arqueos, entradas/salidas, cambios y cierre.
- [x] **Disparador de Cierre de Caja**: Conexión del botón "+" de "Último Cierre" con el `CashClosingModal` para gestión proactiva desde el dashboard.
- [x] **Integración Herencia Iconográfica**: Migración de iconos Lucide a PNG personalizados en Dashboard, Staff y Perfil para identidad corporativa (Refinado: eliminación de marcos/filtros).
- [x] **Cumplimiento Regla Zero-Display (Final)**: Aplicación estricta y verificada de ocultación de valores cero en las vistas de personal (Dashboard e Historial) y refuerzo de la utilidad global en `lib/utils.ts`.
- [x] **Optimización de Accesos Admin**: Reducción al 50% de los contenedores de aplicaciones en el dashboard administrativo, organizados en una única fila compacta con iconos centrados.
- [x] **Optimización de Rendimiento y Carga de Iconos**: Sustitución de etiquetas `<img>` por el componente `Image` de Next.js en dashboards y navegación para mejorar la velocidad de carga y prevenir saltos de diseño (Layout Shift).
- [x] **Compactación Dashboard Admin (Smartphone)**: Reducción del 50% en la altura de contenedores clave (Cierres, Tesorería, Extras) y ajuste de iconos cuadrados para máxima eficiencia vertical.
- [x] **Refinamiento Staff Dashboard**: Simplificación de etiquetas ("Horarios" en lugar de "Próximos Horarios") para una interfaz más limpia.
- [x] **Rediseño Modal de Cierre**: Simplificación total del modal de arqueo e implementación de persistencia real en la tabla `cash_closings` (Corregido error de columnas `opened_by`/`closed_by`).
- [x] **Persistencia y Cálculo de Venta Neta**: Integración de lógica de inserción en base de datos con cálculo automático de neto (IVA 10%) para estadísticas históricas.
- [x] **Refinamiento Modal de Cambios**: Títulos dinámicos y botones flotantes para una estética minimalista.
- [x] **Estandarización de Resúmenes Staff**: Unificación de resúmenes semanales con alturas fijas para garantizar la inmovilidad de etiquetas bajo la regla Zero-Display.
- [x] **Unificación Estética de Tesorería (Floating UI)**: Eliminación de billetes de 500/200€, implementación de imágenes premium agrandadas y diseño sin tarjetas en todos los formularios de caja y cierre.
- [x] **Configuración de Icono PWA**: Corrección de rutas de iconos en `manifest.json` y `layout.tsx` para apuntar correctamente a `/icons/logo-white.png`, asegurando la imagen correcta al "añadir a pantalla de inicio".
- [x] **Optimización de Modales de Tesorería**: Compactación radical de los formularios de Entrada, Salida, Arqueo y Cambios para eliminar el scroll. Rediseño del formulario de cambios a layout horizontal y homogeneización de tamaños de valores en toda la gestión de efectivo.
- [x] **Filtros Avanzados en Extras**: Implementación de selector de periodo (mes) y selección manual de rango de fechas en el histórico de horas extras para una auditoría más precisa.
- [x] **Agrupación de Semanas ISO**: Corrección del sistema de agrupación de semanas en el dashboard de extras para utilizar el estándar ISO (Lunes a Domingo).
- [x] **Propagación y Recálculo V3**: Implementación de lógica de servidor para propagar balances semanales, respetando contratos históricos y corrigiendo el balance de Managers (Extras-only). Lógica asimétrica de deuda indestructible.
- [x] **Geofencing (GPS) Restricción:** Implementación de validación por radio de 150m para fichajes de staff y auditoría silenciosa para managers (Ajustado por fiabilidad).
- [x] **Refinamiento Visual Staff:** Actualización de iconos a versiones PNG premium, cambio de etiqueta "Guía" por "Cambiar" y optimización de iconos en el popup de Contactos (WhatsApp PNG y icono de teléfono flotante).
- [x] **Navegación por Gestos:** Implementación de gestos "swipe" (deslizar) para que Managers cambien entre Dashboard Staff y Admin.
- [x] **Optimización UI Móvil (Caja/Personal):** Compactación de modales de tesorería y registros para mejor accesibilidad táctil sin sacrificar legibilidad.
- [x] **Sincronización Resumen Staff:** Corrección de la lógica de propagación en la base de datos para sincronizar automáticamente el saldo acumulado (`profiles.hours_balance`) tras recálculos en el historial.
- [x] **Estándar Gallery View:** Creación de plantilla `gallery-view.tsx` e integración en el Generador de Templates Marbella para unificar vistas de catálogo (Ingrediente/Recetas).
- [x] **Rediseño Modal Cambio (V3 - Táctil)**: Implementación de botones incrementales, código de colores (verde/rojo) y corrección de error crítico de overflow para garantizar la visibilidad del botón de guardado.
- [x] **Migración Cromática**: Transición global de `#5B8FB9` al nuevo Azul Marbella `#36606F` en Registros, Dashboards y Recetas.
- [x] **Unificación Estética Vistas de Detalle y Modales**: Aplicación del estándar "Vista Marbella Detail" (#36606F) en cabeceras de Movimientos, Horas Extras, Perfil y todos los modales de la aplicación (Cierre Caja, Stock, Empleados, Recetas).
- [x] **Expansión de Perfil (DNI/IBAN/Documentos)**: Implementación de campos DNI e IBAN, sistema de gestión de archivos (Contratos/Nóminas) con Supabase Storage y modalidad de edición para Managers.
- [x] **Gestión de Seguridad**: Implementación de modal de cambio de contraseña directo en la cuenta del personal con diseño táctil premium.
- [x] **Refinamiento UI Global (Vista Marbella Detail)**: Unificación estética de las cabeceras en Laboral, Historial y Horas Extras. Rediseño de la navegación en Registros con mes compacto y controles externos.
- [x] **Herramienta de Importación Masiva**: Nueva página `/admin/import` para migración de fichajes históricos vía CSV con mapeo automático de emails y procesamiento por bloques.
- [x] **Gestión de Proveedores (Gallery View)**: Nueva vista de alta densidad para proveedores con integración de logotipos corporativos y acceso directo desde el Dashboard.
- [x] **Estandarización de Contacto**: Unificación de iconos de Teléfono y WhatsApp en `/profile` y `/suppliers` siguiendo el estilo minimalista del Dashboard de Personal.
- [x] **Sistema de Pedidos a Proveedores (Refinado)**: Mejora del flujo en `/orders/new` con iconos circulares (48px), botón de resumen superior, filtrado estricto por proveedor, soporte para unidades personalizadas con persistencia y eliminación de precios en resumen y PDF.
- [x] **Refinamiento UI Historial (Staff)**: Unificación estética de cabeceras, rediseño de filtros (Empleado/Mes) sin flechas, reposicionamiento del sello "Pagado" y ajuste de ancho de tabla para mayor densidad visual.
- [x] **Estandarización de Redondeo (rounded-2xl)**: Unificación global de todos los contenedores y modales de la aplicación al estándar de redondeo de 16px (`rounded-2xl`) para una estética premium y consistente.

## 📅 PENDIENTE
- [ ] Próximas integraciones de BI y alertas de stock.

---

## 🛠️ NOTAS TÉCNICAS
- **Primary Color:** `#5B8FB9` (Azul Marbella)
- **Database Rules:** Seguir el protocolo `db-supabase-master`.
- **Naming Convention:** Se mantienen nombres actuales de DB (`prefer_stock_hours`, `contracted_hours_weekly`) para evitar roturas de esquema.
