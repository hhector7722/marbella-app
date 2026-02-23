# BAR LA MARBELLA - PROJECT STATUS

**Última actualización:** 2026-02-23

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
- [x] **Refactorización Radical de Tesorería**: Esquema unificado en `treasury_log`, eliminación de 5 tablas legacy, automatización total mediante triggers y consolidación de 3 cajas.
- [x] **Importación de Tesorería Robusta**: Corrección del asistente para carga masiva con mapeo inteligente de cabeceras (insensible a acentos/espacios) y validación de filas mejorada.
- [x] **Mejora UX Tesorería**: Estado vacío proactivo con botón de reseteo de filtros y feedback visual instructivo.
- [x] **Diseño Marbella Premium**: Aplicación global de estética de tarjetas blancas sobre fondo azul (#5B8FB9) en movimientos y filtros.
- [x] **Rediseño Radical Historial Premium (Refinado)**: Implementación total del nuevo layout con estructura de "Doble Contenedor" (Card-in-Card) igual a movimientos. Cabecera integrada, cápsula de resumen y grid de tarjetas dentro de contenedor con sombra interna.
- [x] **Integración Sileo Notifications**: Sistema premium de notificaciones (basado en física).
- [x] **Rediseño Filtro Mensual**: Sustitución de tira horizontal por botón con modal de selección de Mes/Año.
- [x] **Refinamiento Resúmenes Semanales**: Simplificación de vistas eliminando columnas redundantes.
- [x] **Operaciones de Caja en Movimientos**: Integración de botones y formularios para Entrada, Salida y Arqueo directamente desde /dashboard/movements.
- [x] **Arquitectura de Componentes de Tesorería**: Extracción de formularios a componentes compartidos reutilizables.
- [x] **Simplificación Historial**: Eliminación de "Ritmo de Ventas" y mejora de legibilidad de fechas en tarjetas.
- [x] **Robustez Geofencing**: Mejora de fiabilidad de ubicación con caché de 60s y feedback de errores detallado para evitar bloqueos en el fichaje.
- [x] **Diseño Marbella Premium Movimientos**: Rediseño radical de `/dashboard/movements` siguiendo el diseño corporativo (Cabecera con acciones, Bento Filters, Resumen Periodo y Listado Estilizado).
- [x] **Performance Audit & Optimization (Complete)**: Optimización radical de Historiales (Ventas, Mano de Obra, Staff) y Dashboard Admin mediante normalización con Hash Maps ($O(1)$), Renderizado Incremental con `IntersectionObserver` y Memoización estratégica.
- [x] **Acciones Directas en Dashboard**: Sustitución de menú de caja por botones de acción directa (Entrada, Salida, Arqueo) y navegación mejorada a movimientos.
- [x] **Métrica de Diferencia**: Nueva columna en el resumen de movimientos para visualizar descuadres de arqueo de forma inmediata.
- [x] **Refinamiento Estético Caja Inicial**: Unificación de Caja Inicial (ahora en verde `emerald-600`) y botones de acción (Entrada, Salida, Arqueo) con nuevo diseño: texto negro en negrita e iconos blancos dentro de círculos de color, replicado en todo el dashboard y página de movimientos.
- [x] **Detalle de Movimientos**: Implementación de modal dinámico que muestra el desglose de billetes/monedas y notas al pulsar sobre cualquier fila de movimientos.
- [x] **Corrección de Lógica de Arqueo y Métricas (REFINADO)**: Implementación de lógica de deltas (descuadres) en la base de datos para que los arqueos no rompan el historial. Actualización de `/dashboard/movements` para mostrar Saldo Teórico (sin arqueos) vs. Diferencia según solicitud.
- [x] **Triggers de Tesorería Proactivos**: Nuevo trigger `BEFORE INSERT` que calcula automáticamente el descuadre al realizar un arqueo, manteniendo la integridad del balance global.
- [x] **Ocultación de Arqueos en Extracto**: Los arqueos ahora están ocultos de la tabla de movimientos para evitar confusión, pero sus descuadres se acumulan en la métrica "DIFERENCIA".
- [x] **Sistema de Tesorería Atómico e Inmune a Duplicados**: Implementación de triggers avanzados que gestionan `UPDATE` y `DELETE` revirtiendo el impacto anterior, eliminando el error de duplicación de deudas.
- [x] **Unificación de Lógica de Saldos**: Sustitución de cálculos en frontend por `get_theoretical_balance` (SQL RPC), garantizando exactitud matemática total.
- [x] **Saneamiento de Datos**: Script de limpieza aplicado para eliminar duplicados generados por la lógica anterior.
- [x] **Habilitación de Cierres Retroactivos**: Implementación de selector de fecha/hora sutil en el modal de cierre, permitiendo corregir el momento del cierre y actualizando los datos de ventas automáticamente.
- [x] **Rediseño Resumen Movimientos**: Refactorización de métricas superiores en `/movements`, eliminando "Caja Real", priorizando "Saldo" y "Diferencia" para mayor claridad operativa.
- [x] **Modo Compra en Movimientos**: Nueva funcionalidad en el modal de Salidas que permite desglosar dinero entregado y cambio recibido, calculando el precio neto y actualizando el inventario de caja con exactitud.
- [x] **Ajuste de Saldo Inicial:** Corregir saldo a 336.21€ al cierre del 13/02 (Botón "Arreglar Saldo" en Movimientos).
- [x] **Corrección Radical de /overtime**: Reescritura completa de la página desde cero, unificando la lógica y componentes visuales con la tarjeta del dashboard. Implementación de filtros temporales (Mensual/Manual), KPIs de periodo y cumplimiento estricto de la regla "Zero-Display".
- [x] **Robustez en Cálculo de Extras**: Mejora de la acción de servidor para incluir buffers de cálculo, garantizando la consistencia de los balances arrastrados en cualquier rango de fechas.
- [x] **Limpieza de Etiquetas en Movimientos**: Eliminación del sufijo " (Editado)" en las notas de movimientos de tesorería al modificar cierres de caja.
- [x] **Optimización de Modal de Cambio (Mobile)**: Rediseño radical del modal utilizando un layout basado en filas con controles laterales para facilitar el uso en smartphones. Se han optimizado los targets táctiles (44px+) y se ha integrado un resumen de balance en la cabecera siguiendo el estilo Marbella Premium.
- [x] **Autocompletado Proactivo en Cierres (Refinado)**: Implementación de autocompletado instantáneo de ventas y tickets en el modal de cierre utilizando datos del dashboard en tiempo real. Se ha mejorado la robustez de la recuperación de datos mediante consultas directas a `tickets_marbella`, eliminando dependencias de RPC y garantizando la sincronización desde el panel de staff.
- [x] **Corrección de Métrica de Ventas en Historial**: Se ha corregido el mapeo de la métrica "Ventas" de `gross_sales` a `tpv_sales` en `/history`, solucionando el problema de visualización de "0€".
- [x] **Restricción de Rol Supervisor**: Eliminación del acceso de supervisores al panel de administración y a la lista de plantilla, redirigiéndolos automáticamente al panel de staff para mantener la seguridad operativa.
- [x] 📸 **Imágenes en Desglose de Historial**: Integración de representaciones visuales de billetes y monedas en el modal de desglose de efectivo de `/dashboard/history`, mejorando la coherencia visual con el resto de la aplicación.
- [x] 📱 **Refinamiento Mobile Historial**: Ajuste radical de la vista smartphone en `/history`. Eliminación de fondo circular en flecha de volver, ajuste dinámico del selector de métricas y optimización del calendario para visualización sin scroll horizontal en dispositivos móviles.
- [x] 🔘 **Controles Monetarios Proactivos**: Implementación de botones "+" y "-" en todos los campos de entrada monetaria y desgloses de efectivo.
- [x] 🧠 **IA Operativa (OpenAI gpt-4o-mini)**: Migración exitosa de Chat de Texto a OpenAI. Implementado protocolo de compatibilidad v1/v2 y resuelto conflicto crítico de variables de entorno del sistema. 
- [x] 🧱 **Arquitectura de Entorno**: Saneamiento de la raíz del proyecto eliminando archivos `package.json` redundantes en el home del usuario, optimizando el rendimiento de Next.js/Turbopack.
- [x] 🌍 **Personalización Avanzada IA (Premium)**: Implementación de detección dinámica de idioma (Catalán/Español) y estilos de saludo personalizados (Jefe, Colega, Profesional) basados en perfiles de Supabase para chat y voz.
- [x] ✨ **Refinamiento Minimalista Chat**: Limpieza del fondo del chat (eliminación de textos e iconos de ayuda) y optimización del logo de cabecera (más grande y alineado al botón de cierre).
- [x] ⚡ **IA Ultra-Concisa e Integral**: Prompts de máximo 1-2 frases. Herramientas avanzadas (`get_staff_work_info`) para consultar horas reales trabajadas, saldo de horas extras y horarios programados de *cualquier* semana (para el empleado activo o todo su equipo, si es manager). Reforzada semánticamente para distinguir estrictamente entre turnos teóricos y fichajes reales.
- [x] 📈 **Contexto Financiero Histórico en IA**: La herramienta de Dashboard para Managers (`get_dashboard`) ha sido refactorizada para poder consultar la facturación total y el estado de los Cierres de Caja (`cash_closings`) de días pasados, permitiendo a la IA responder a comandos como "cuánto se facturó el jueves" o "cómo cerró la caja ayer".
- [x] 👨‍🍳 **Herramienta de Recetario (`get_recipe_details`)**: Añadido soporte nativo a la IA del web chat para que pueda buscar dinámicamente cualquier plato del menú, cruzar con la tabla `recipe_ingredients` y leer su elaboración y qué ingredientes y unidades exactas lleva.
- [x] 📱 **Experiencia Nativa Móvil**: Sustituida la altura basada en Viewport Relative (VH) por una interpolación en tiempo real del API `window.visualViewport` para iOS Safari, evitando que el teclado virtual empuje la cabecera fuera de la pantalla. Respetando el diseño de caja flotante modal original.
- [x] **Rediseño Radical de Tarjetas de Historial (V2 - SI Reference)**: Reestructuración total siguiendo la imagen de referencia: cabecera con día, métrica principal con porcentaje integrado y cuadrícula 2x2 para métricas secundarias con regla Zero-Display y colores temáticos.
- [x] **IA Operativa (OpenAI Realtime)**: Actualización del worker a `gpt-4o-realtime-preview` con saludos dinámicos y herramientas refinadas.
- [x] **Estilo Rojo en Tarjetas Historial**: Aplicación de fondo rojo (`rose-500`) suavizado, eliminación de iconos superfluos y optimización de jerarquía visual (métricas, porcentajes y footer simétrico).
- [x] **Refinamiento UI Historial**: Implementación de contenedor blanco roto (`bg-[#fafafa]`) y cabecera de métricas de ancho completo para una experiencia más limpia.
- [x] **Rediseño Modal Detalle Cierres**: Solución de solapamiento de botones con el nombre del día y mejor integración de flechas de navegación en cabecera superior.
- [x] **Rediseño Vista Calendario Historial (Refinado)**: Nueva visualización en estilo calendario (7 columnas) con tarjetas optimizadas (cabecera roja, layout simétrico de métricas y fuentes legibles en 7-col).
- [x] **Refinamiento UI Header Historial**: Ajuste de padding y dimensiones en el selector de métricas para evitar que el botón seleccionado toque los márgenes, mejorando la estética premium.
- [x] **Rediseño Radical Modal de Cambio**: Optimización total siguiendo referencia visual. Estructura de 3 columnas (Entra | Denom | Sale) con fondos de color intensificados y cabecera de KPIs dinámica, manteniendo el formato compacto.
- [x] **Corrección de Build (Tipos Supabase)**: Restauración de `src/types/supabase.ts` tras una corrupción causada por un prompt interactivo de CLI, unificando el entorno y desbloqueando la compilación.
- [x] **Refinamiento de Etiquetas**: Cambio de la etiqueta "Cambiar" por "Caja" en el dashboard de staff y administrador para mayor claridad operativa.
- [x] **Mejora UX Modal de Caja**: Inversión de columnas en el modal de cambio (ahora "Sale" a la izquierda y "Entra" a la derecha) para una interacción más natural.
- [x] **Rediseño Botón Cierre**: Nuevo diseño con icono de "+" blanco en círculo verde redondo y lógica de visibilidad para Managers y Supervisores en el dashboard de staff.
- [x] **Métrica de Diferencia en Dashboard**: Sustitución de la flecha en la tarjeta de Caja Inicial por el valor de la diferencia, con lógica de colores (rojo < 0, blanco > 0) y tick para descuadre cero.
- [x] **Optimización Mobile Movimientos**: Ajuste radical de la vista smartphone en `/dashboard/movements`. Acciones de cabecera alineadas con el título, resumen de KPIs en fila única de 4 columnas y refinamiento de la distribución de anchos en la tabla de movimientos para evitar solapamientos.
- [x] **Refinamiento Estético de Iconos**: Sustitución de props de tamaño por clases Tailwind y unificación de estilos en iconos de acción de tesorería.
- [x] **Rediseño Tarjeta Producto (Pedidos)**: Evolución a **Plantilla Galería Cuadrada** (estilo `/recipes`). Geometría final optimizada: zona petróleo más esbelta (`py-1.5`) con contenido centrado, nombre posicionado justo en el límite de color e imagen centrada verticalmente en el área superior para un equilibrio visual premium. Simetría total de controles confirmada.
- [x] **Ajuste Altura Contenedor Cajas Cambio (Mobile)**: Eliminación de bordes, fondos y reducción drástica de espaciados (paddings y gaps) en las tarjetas de Cambio 1 y Cambio 2 para que floten sobre el fondo blanco del panel y su altura total se compacte para coincidir con la fila de iconos adyacente.
- [x] **Corrección de Transición Swipe Mobile**: Inversión del orden espacial en `DashboardSwitcher.tsx` (Panel Administrativo a la izquierda, Panel Staff a la derecha). Esto soluciona la resistencia de rebote y permite que deslizar hacia la derecha desde Staff vuelva a Administración de manera 100% fluida, coincidiendo con la heurística nativa de iOS "Atrás".

- [x] **Rediseño Tarjeta Horas Extras**: Eliminación del relleno verde y borde lila, implementando fondos blancos flotantes con sombra y rediseño de marcadores (icono unificado ! rojo/blanco y tick esmeralda) tanto en Dashboard Admin como en /overtime.
- [x] **Igualación Calendario/Escritorio (Historial)**: Adaptación exacta de proporciones en tarjetas de calendario (4 columnas), suprimiendo textos y asegurando legibilidad completa de números en móvil mediante diseño fluido extremo.
- [x] **Rediseño Pixel-Perfect Tarjetas Calendario (Historial)**: Implementación total del diseño de referencia con cabecera roja (#D64D5D), métrica principal con porcentaje integrado y grid 2x2 para métricas secundarias (Ventas, Medio, Efectivo, Tarjeta). Optimización de espaciados para evitar solapamientos y cumplimiento estricto de la regla "Zero-Display".
- [x] **Optimización Altura Caja Inicial Mobile**: Reducción del espaciado dinámico debajo de la fila de 'Movimientos' cuando está plegada, permitiendo que el contenido inferior (Horas Extras, etc.) suba proporcionalmente para aprovechar el espacio en pantalla.
- [x] **Ajuste Fino de Posiciones Mobile Dashboard**: Subido el bloque completo de contenido hacia la cabecera eliminando padding superior (`pt-0`) y ajustando el gap de Ventas, además de reducir ligeramente la altura de los indicadores (puntos) de paginación entre dashboards.
- [x] **Alineación Mobile Staff Dashboard**: Reestructuración radical de la sección inferior ("Horarios" y cuadrícula de iconos) adoptando una cuadrícula dividida al 50% (`grid-cols-2`) con los mismos espaciados que el panel de administración, centrando perfectamente el contenido con los puntos de paginación de la interfaz.
- [x] **Rediseño Tarjetas Calendario (Historial)**: Adaptación perfecta de proporciones ("Ventas", "Medio", "Efectivo", "Tarjeta" en grid simétrico 2x2) en la versión de escritorio y reducción proporcional fluida para encajar todos los elementos en móviles sin alterar proporciones.
- [x] **Integración Modal de Proveedores**: Re-integración del modal de selección de proveedores en 3 puntos clave (Barra Nav, Admin y Staff). Se ha implementado una lógica de carga híbrida (DB + Lista estática) y un diseño Marbella Premium con tarjetas flotantes sin bordes sobre fondo blanco.
- [x] **IA Operativa (Chat)**: Restaurada con OpenAI y protocolo de streaming fluido.
- [x] **Seguridad IA (RLS Delegado)**: Implementación de arquitectura de "Rayos X" donde la IA consulta Supabase usando la identidad real del usuario (JWT) en lugar del Service Role, respetando estrictamente los permisos de cada rol.
- [x] **Renderizado Markdown Nativo**: Integración de `react-markdown` y `remark-gfm` en el widget de chat, permitiendo la visualización de tablas de ingredientes, listas de tareas y negritas de forma elegante.
- [x] 📄 **Refinamiento Flujo de Pedidos (FINAL)**: Pulido estético integral. Modal de resumen ultra-limpio, éxito compacto y PDF refinado.
- [x] 💾 **Persistencia y Control de Pedidos**: Implementación de unidades preferidas autoguardables e independientes de la cantidad. Borradores persistentes por usuario que permiten pausar y reanudar pedidos. Añadido botón "Borrar Pedido" y limpieza automática de borrador por proveedor tras finalizar el pedido.
- [x] 📦 **Modal de Productos Staff**: Implementación de un modal intermedio en el panel de staff y barra de navegación que unifica el acceso a Pedidos, Inventario, Stock y Proveedores, eliminando opciones irrelevantes (Recetas/Ingredientes) para el perfil operativo.
- [ ] **IA Voz (LiveKit)**: Limitada en entornos Windows ARM64 (Surface) por falta de binarios nativos.

## 📅 PENDIENTE
- [ ] Próximas integraciones de BI y alertas de stock.

---

## 🛠️ NOTAS TÉCNICAS
- **Primary Color:** `#5B8FB9` (Azul Marbella)
- **Database Rules:** Seguir el protocolo `db-supabase-master`.
- **Naming Convention:** Se mantienen nombres actuales de DB para evitar roturas de esquema.
- **Regla Zero-Display:** En vistas de lectura (no formularios), cualquier valor igual a 0 debe mostrarse como un espacio vacío " ".
