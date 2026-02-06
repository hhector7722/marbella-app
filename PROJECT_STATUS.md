# BAR LA MARBELLA - PROJECT STATUS

**Última actualización:** 2026-02-06

## 📌 ESTADO GENERAL
El proyecto ha evolucionado de una versión inicial a "Bar Marbella Clean". Se ha integrado un sistema de reglas (`.agent`) para garantizar la calidad arquitectónica y la coherencia en la lógica de negocio (especialmente en nóminas y costes).

---

## ✅ COMPLETADO
- [x] **Infraestructura Base:** Next.js + Supabase Auth / SSR configurado.
- [x] **Panel Admin:** Dashboard principal y navegación básica.
- [x] **Gestión de Staff:** Listado y detalles de empleados.
- [x] **Control de Horas:** Sistema de fichaje (`time_logs`) operativo.
- [x] **Histórico de Extras:** Vista de semanales con lógica de arrastre (Client-side).
- [x] **Protocolo AI:** Integración de habilidades especializadas.
- [x] **Nuevas Skills:** Creación e integración de `comprador-logistica-albaranes`, `analista-bi-marbella` (alerta ratio 35%) y `tester-especialista-marbella`.
- [x] Auditoría de Lógica: Comparando reglas `.agent` con implementación actual para evitar regresiones.
- [x] Refactorización de Utilidades: Centralizando cálculos de dinero y tiempo en Server Actions.
- [x] Optimización UI Kiosco: Ajustar botones y targets táctiles al estándar de 48px+ en navegación y fichaje.
- [x] Refinamiento Editor de Horarios: Implementación de inicio selectivo, botones de añadir/eliminar circularmente y modal de selección de personal.
- [x] Optimización UI Móvil: Aumento de altura en navegación inferior (h-20) y soporte para Safe Area.
- [x] Refinamiento Visual de Horarios: Colores en tiempos (entrada verde/salida roja), orden invertido y uso de solo nombres de pila.
- [x] Interconectividad Staff: Enlace directo a recetas en el dashboard de personal.
- [x] Refinamiento Dashboard Admin (Batch 2): Cuadrícula 2x2 en cierres, colores restaurados y rediseño de tarjeta de caja inicial.
- [x] Optimización UI Staff: Resúmenes semanales en formato horizontal compacto y ajuste de posición del sello de pagado.
- [x] Refinamiento Estético Editor de Horarios: Barras sin contorno con mini-barras para entrada (verde) y salida (roja), fila de totales fija en 2ª posición, columna de eliminación a la derecha e integración de botón "+" como fila.
- [x] Refactorización Layout Dashboard Admin: Organización por filas en escritorio (Cierre vs Tesorería, Accesos vs Extras) con alturas equilibradas.

## 📅 PENDIENTE
- [ ] **Migración Completa a Server Actions:** Seguir moviendo lógica de otras páginas si es necesario.
- [ ] **Validación RLS:** Revisar políticas de seguridad en tablas críticas (`weekly_snapshots`, `time_logs`).
- [ ] **Mejora Bento Grid:** Aplicar estilos visuales más consistentes en el resto de dashboards.

---

## 🛠️ NOTAS TÉCNICAS
- **Primary Color:** `#5B8FB9` (Azul Marbella)
- **Database Rules:** Seguir el protocolo `db-supabase-master`.
- **Naming Convention:** Se mantienen nombres actuales de DB (`prefer_stock_hours`, `contracted_hours_weekly`) para evitar roturas de esquema.
