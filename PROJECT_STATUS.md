# BAR LA MARBELLA - PROJECT STATUS

**Última actualización:** 2026-02-05

## 📌 ESTADO GENERAL
El proyecto ha evolucionado de una versión inicial a "Bar Marbella Clean". Se ha integrado un sistema de reglas (`.agent`) para garantizar la calidad arquitectónica y la coherencia en la lógica de negocio (especialmente en nóminas y costes).

---

## ✅ COMPLETADO
- [x] **Infraestructura Base:** Next.js + Supabase Auth / SSR configurado.
- [x] **Panel Admin:** Dashboard principal y navegación básica.
- [x] **Gestión de Staff:** Listado y detalles de empleados.
- [x] **Control de Horas:** Sistema de fichaje (`time_logs`) operativo.
- [x] **Histórico de Extras:** Vista de semanales con lógica de arrastre (Client-side).
- [x] **Protocolo AI:** Integración de habilidades especializadas en carpeta `.agent`.

## 🚧 EN PROCESO
- [ ] **Auditoría de Lógica:** Comparando reglas `.agent` con implementación actual para evitar regresiones.
- [ ] **Refactorización de Utilidades:** Centralizando cálculos de dinero y tiempo en `src/lib/utils.ts`.

## 📅 PENDIENTE
- [ ] **Migración a Server Actions:** Mover la lógica compleja de `OvertimePage` al servidor para mayor seguridad y velocidad.
- [ ] **Validación RLS:** Revisar políticas de seguridad en tablas críticas (`weekly_snapshots`, `time_logs`).
- [ ] **Optimización UI Kiosco:** Ajustar botones y targets táctiles al estándar de 48px+ en todas las pantallas de staff.

---

## 🛠️ NOTAS TÉCNICAS
- **Primary Color:** `#5B8FB9` (Azul Marbella)
- **Database Rules:** Seguir el protocolo `db-supabase-master`.
- **Naming Convention:** Se mantienen nombres actuales de DB (`prefer_stock_hours`, `contracted_hours_weekly`) para evitar roturas de esquema.
