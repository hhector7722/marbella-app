# BAR LA MARBELLA - PROJECT STATUS

**Última actualización:** 2026-02-15

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
- [x] Refinement of Weekly Summaries: Removed redundant "Balance" column to simplify staff views.
- [x] Bugfix: Enforced "Zero Positive Carry-over" rule for staff dashboards.
- [x] Bugfix: Enforced "Daily Rounding" rule across actions to eliminate weekly 0.5h discrepancies (16 vs 15.5).
- [x] Feature: Added ability for Admins to override "Contracted Hours" for specific weeks in history view.
- [x] Fix: Corrected syntax error in `AdminDashboardView.tsx` preventing production builds.
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
- [x] **Refinamiento UI Marbella (Fase 4)**: Historial sin bordes azules, eliminación de icono calendario en filtros, integración de popup de empleado en registros y unificación de configuración en el perfil.
- [x] **Optimización Bottom Nav**: Reorganización de ítems (Horarios, Asistencia, Inicio, Pedidos, Cuenta) con nuevos iconos PNG y acceso directo a pedidos.
- [x] **Modales de Gestión**: Actualización estética del modal "Gestión Stock" en Staff (#36606F) y vinculación de accesos directos (Pedidos -> /orders/new, Proveedores -> /suppliers) en ambos dashboards.
- [x] **Estabilidad Dashboard Admin**: Corrección de layout en 2 columnas, reordenación inteligente para móvil/desktop y ajuste cromático de Horas Extras a púrpura corporativo.
- [x] **Visibilidad Selectiva ADM/Staff**: Restricción del toggle de la cabecera exclusivamente para usuarios con rol de Manager.
- [x] **Cierre de Caja Full Integration**: Implementación de botón "+ CIERRE" en la cabecera fija para usuarios específicos, con mapeo al nuevo esquema de `cash_closings` e integración automática con la tesorería de la "Caja Inicial" mediante desglose de unidades.
- [x] **Unificación de Cuenta**: Migración de las opciones de "Configuración" (Cambio de Contraseña y Logout) directamente a la vista de Perfil.
- [x] **Notificaciones de Horario**: Implementación de sistema Web Push con botón "ENVIAR" en el editor de horarios para notificar a los empleados.
- [x] **Reporte de Cierre Automático**: Notificaciones push automáticas a todos los managers con el resumen financiero (Ventas, Venta Neta, Ticket Medio) al realizar el cierre diario.
- [x] **Refinamiento Recetas Staff**: Ajuste de fondo blanco para el modal de detalle de recetas cuando se accede desde el dashboard de personal.
- [x] **Refinamiento Cierre de Caja**: Consolidación de ventas en un único campo, autocompletado desde tickets, redondeo a 2 decimales y adición de símbolo de euro.
- [x] **Rediseño Histórico Admin**: KPIs de resumen actualizados (Ventas, Venta Neta, Ticket Medio) y nuevos filtros dinámicos por Periodo y Mes.
- [x] **Refinamiento de Perfil**: Cabecera compacta, reducción de fuentes, nombre en una sola fila y migración del botón de edición a icono superior derecho para managers.
- [x] **Optimización de Capas (Z-Index)**: Ajuste de nivel en la navegación inferior (`z-30`) para permitir el difuminado (blur) correcto cuando hay modales abiertos.
- [x] **Refinamiento Historial y Gestión de Cierres**: Rediseño del modal de histórico con KPIs de negocio e implementación de edición/borrado de cierres con sincronización robusta y políticas RLS corregidas.
- [x] **Importador Legacy**: Nueva skill `importador-legacy-marbella` y asistente interactivo en `/dashboard/import` para la carga masiva de datos (Proveedores, Productos, Histórico) con soporte para cambio de contrato histórico y selector de pasos interactivo.
- [x] **Visibilidad Histórico de Cierres**: Refactorización del filtro por defecto a "Mes Actual" e implementación de seleccionador dinámico por meses para navegación ágil.
- [x] **Identidad Visual (Loading Spinner)**: Implementación de un cargador dinámico radial personalizado (`LoadingSpinner`) y sustitución global de todos los iconos de carga genéricos para mejorar la estética premium.
- [x] **Refinamiento de Recetas (Staff)**: Actualización del modal de detalle con fondo gris apagado (`bg-zinc-100`) para resaltar tarjetas, integración de imagen de la receta en la cabecera e implementación del `LoadingSpinner` corporativo.
- [x] **Consistencia Visual (Loading Spinner)**: Adopción del nuevo componente `LoadingSpinner` en el detalle de recetas para alinearse con la identidad visual premium del proyecto.
- [x] **Refinamiento Movimientos y Dashboard**: Exclusión de arqueos en historiales, filtro por defecto al mes actual e integración del indicador de "SALDO" acumulado.
- [x] **Control de Apariencia**: Implementación de bloqueo de Modo Noche mediante `darkMode: 'class'` y forzado de clase `light` en el layout para preservar la estética corporativa.
- [x] **Refinamiento de Pedidos**: Eliminación de botones redundantes en la generación de pedidos y corrección de error crítico en la exportación a PDF (`autoTable`).
- [x] **Corrección Creación Pedidos**: Resolución de error `supplier_id` null y ajuste de proporciones en modal de éxito (UX Kiosco).
- [x] **Importador Legacy (v2)**: Mejora de la lógica de importación de fichajes para permitir la sobrescritura de registros existentes eliminando conflictos de la restricción `idx_one_shift_per_day`.
- [x] **Corrección Zona Horaria**: Script de emergencia `fix_import_timezones.sql` para corregir el desfase de horas en importaciones masivas.
- [x] **Visualización Inteligente de Horas (Staff)**: Lógica condicional para mostrar `Contrato + Horas` en lugar de solo trabajadas para perfiles de Manager y Salario Fijo.
- [x] **Ordenación Cronológica Dinámica**: El historial de fichajes ahora se ordena de más reciente a más antiguo por defecto, invirtiéndose automáticamente al aplicar filtros de fecha para facilitar la lectura secuencial.
- [x] **Optimización Geolocalización**: Aumento del radio de fichaje a 300m y corrección de coordenadas a Plus Code `96X6+VQ` (CEM La Mar Bella) para compensar la deriva del GPS.
- [x] **Rediseño Modal de Cambio**: Implementación de un nuevo layout de 3 columnas (Entra/Unidad/Sale) con fondos de color verde/rojo y estética neutra en ambos dashboards.
- [x] **Refinamiento Filtros Historial**: Unificación visual de filtros (Mes/Trabajador) en una sola fila para managers e implementación de "badge" con cruz roja para limpiar la selección activa.
- [x] Ajuste Posición Sello: Corrección de estilos CSS en el historial para permitir que el sello de "PAGADO" sobresalga de la tarjeta (overflow visible) y se posicione en la esquina inferior derecha.
- [x] **Corrección Crítica UUID Pedidos**: Migración de `supplier_id` a TEXT en `purchase_orders` para soportar IDs legacy y rediseño completo del modal de éxito ("Pedido Guardado") siguiendo el estándar Bento Grid y colores corporativos.
- [x] **Refinamiento Registros**: Diferenciación de vista Escritorio (Nombre + Horas Colores) y Móvil (Compacto), manteniendo coherencia estética.
- [x] **Fix Registros**: Habilitado guardado de tipos no regulares (Festivo, Baja, etc) añadiendo columna `event_type` a `time_logs`.
- [x] **Employee Joining Date**: Implementado campo `joining_date` en perfiles, lógica de backend para ignorar semanas previas y UI en alta/edición de empleados.
- [x] **Preferencia 'Bolsa de Horas'**: Toggle implementado en el alta de trabajadores y lógica de cálculo respetada en el histórico.
- [x] **Rediseño PDF Pedidos V4.0**: Implementación final del diseño 'Wave' preciso con doble onda, línea de contorno y cabecera de tabla redondeada conforme a la referencia visual.

- [x] **Corrección PDF y 404**: Resolución de error `bezierCurveTo` en la generación de pedidos PDF y corrección de ruta inexistente `/orders` en la navegación a `/orders/new`.
- [x] **Mejora Modal Pedidos**: Incorporación de vista previa real del PDF, botón de envío de archivo (Share API) y botón de contacto directo por WhatsApp al proveedor.
- [x] **Refactor Histórico de Extras**: Transformación a vista detalle semanal con coste total, marcador de pago global, modal de desglose por trabajador y filtros avanzados (Mes, Trabajador, Rango).
- [x] **Refinamiento Resúmenes Semanales**: Eliminación visual de la columna "Balance" (diferencial semanal) en el dashboard e historial de personal, simplificando la vista y manteniendo el foco en el saldo acumulado ("Pendiente").


## 📅 PENDIENTE
- [ ] Próximas integraciones de BI y alertas de stock.

---

## 🛠️ NOTAS TÉCNICAS
- **Primary Color:** `#5B8FB9` (Azul Marbella)
- **Database Rules:** Seguir el protocolo `db-supabase-master`.
- **Naming Convention:** Se mantienen nombres actuales de DB (`prefer_stock_hours`, `contracted_hours_weekly`) para evitar roturas de esquema.
