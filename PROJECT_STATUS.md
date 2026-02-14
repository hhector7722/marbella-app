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
- [x] **Refinamiento UI Marbella (Fase 4)**: Historial sin bordes azules, eliminación de icono calendario en filtros, integración de popup de empleado en registros y unificación de configuración en el perfil.
- [x] **Optimización Bottom Nav**: Reorganización de ítems (Horarios, Asistencia, Inicio, Pedidos, Cuenta) con nuevos iconos PNG y acceso directo a pedidos.
- [x] **Estabilidad Dashboard Admin**: Corrección de layout en 2 columnas, reordenación inteligente para móvil/desktop y ajuste cromático de Horas Extras a púrpura corporativo.
- [x] **Visibilidad Selectiva ADM/Staff**: Restricción del toggle de la cabecera exclusivamente para usuarios con rol de Manager.
- [x] **Cierre de Caja Full Integration**: Implementación de botón "+ CIERRE" en la cabecera fija para usuarios específicos, con mapeo al nuevo esquema de `cash_closings` e integración automática con la tesorería de la "Caja Inicial" mediante desglose de unidades.
- [x] **Unificación de Cuenta**: Migración de las opciones de "Configuración" (Cambio de Contraseña y Logout) directamente a la vista de Perfil.
- [x] **Refinamiento Recetas Staff**: Ajuste de fondo blanco para el modal de detalle de recetas cuando se accede desde el dashboard de personal.

## 📅 PENDIENTE
- [ ] Próximas integraciones de BI y alertas de stock.

---

## 🛠️ NOTAS TÉCNICAS
- **Primary Color:** `#5B8FB9` (Azul Marbella)
- **Database Rules:** Seguir el protocolo `db-supabase-master`.
- **Naming Convention:** Se mantienen nombres actuales de DB (`prefer_stock_hours`, `contracted_hours_weekly`) para evitar roturas de esquema.
 
