---
name: Generador de Templates Marbella
description: Genera interfaces consistentes de "Vista Marbella Detail" y popups flotantes según el diseño corporativo de Bar La Marbella.
---

# Generador de Templates Marbella

Esta habilidad garantiza que todas las pantallas y diálogos de la aplicación sigan la misma línea estética "Premium" y "Touch-First".

## 🎯 Propósito
Evitar la fragmentación del diseño. Cada vez que crees una nueva página de detalle o un popup, DEBES usar las estructuras definidas en esta habilidad.

## 📋 Estándares de Diseño Obligatorios

### 1. 🖼️ Pop-ups y Modales (Estilo Flotante)
- **Cero Contenedores en Opciones:** Las opciones dentro de un modal NO deben tener fondo (`bg-xxx`) ni bordes (`border-xxx`) por defecto.
- **Icono + Texto:** Los elementos deben flotar sobre el fondo del modal.
- **Bordes:** Usar siempre `rounded-2xl` para el contenedor principal del modal.
- **Interacción:** Usar `hover:text-xxx` o `active:scale-95` para feedback, sin añadir cajas.
- **Feedback Táctil:** Altura mínima de 48px para cada opción interactiva.

### 2. 📊 Vistas de Detalle (Vista Marbella Detail)
- **Cabecera Estrecha:** Color `#36606F` con bordes redondeados estándar (`rounded-2xl`).
- **Layout de Cabecera:** Debe ser estrecha (`py-4` aprox.), conteniendo un solo título principal, sin subtítulos ni etiquetas secundarias. Debe ser proporcional en altura a la cabecera de un modal estándar.
- **Resumen KPI "Clean":**
    - Se eliminan las mini-tarjetas con fondo de color.
    - Se muestran los valores directamente sobre el fondo (blanco o gris muy claro).
    - Solo el **texto del valor** debe tener color para indicar estado (ej: `text-emerald-500` para éxito, `text-rose-500` para riesgo).
- **Filtros Contextuales:** Toda vista detalle debe incluir una sección de filtros (Fecha, Búsqueda, etc.) compacta y de alta densidad debajo de la cabecera.

### 3. 🍱 Bento Grid
- Usar exclusivamente `rounded-2xl` para los contenedores principales.
- Sombras suaves (`shadow-xl` o `shadow-2xl`).
- Alta densidad de información sin saturar el espacio visual.

### 4. 🖼️ Galería y Catálogos (Gallery View)
- **Fondo Global:** Usar siempre `bg-[#5B8FB9]` (Azul Marbella) para el contenedor principal de la página.
- **Cuadrícula (Grid):** Layout responsivo de alta densidad: `grid-cols-3` en móvil, escalando hasta `grid-cols-8` en monitores XL.
- **Tarjetas de Ítem:**
    - `rounded-2xl`, `p-1.5`, `bg-white`.
    - Feedback visual obligatorio: `hover:-translate-y-0.5` y `active:scale-95`.
    - Altura de imagen fija (`h-14`) para mantener la alineación.
- **Buscador:** Centrado o a la izquierda con `rounded-2xl` y sombra suave.

## 📝 Ejemplos de Implementación

### Estructura de KPI sin tarjeta (Detail View)
```tsx
<div className="grid grid-cols-3 gap-8 py-6 px-10 border-b border-gray-100">
  <div className="flex flex-col items-center">
    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Ventas</span>
    <span className="text-2xl font-black text-[#36606F]">1.240€</span>
  </div>
  <div className="flex flex-col items-center border-x border-gray-50">
    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Diferencia</span>
    <span className="text-2xl font-black text-emerald-500">+12€</span>
  </div>
  <div className="flex flex-col items-center">
    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Estado</span>
    <span className="text-sm font-black text-blue-500 uppercase">Cerrado</span>
  </div>
</div>
```

### Estructura de Opción Flotante (Popup)
```tsx
<button className="flex items-center gap-4 w-full p-4 text-gray-600 hover:text-[#36606F] transition-all group active:scale-95">
  <div className="text-gray-400 group-hover:text-[#36606F] transition-colors">
    <Icon size={24} />
  </div>
  <span className="font-bold text-sm tracking-tight text-left">Nombre de la Opción</span>
</button>
```

## ✅ Checklist de Validación
- [ ] ¿El popup tiene opciones sin bordes ni rellenos de fondo?
- [ ] ¿El resumen superior de la página detalle muestra los valores sin mini-tarjetas?
- [ ] ¿Los botones e iconos tienen un target táctil de al menos 48px?
- [ ] ¿Se han incluido filtros contextuales proactivos?
- [ ] ¿Se usa `cn()` para el manejo de clases dinámicas?
- [ ] ¿La vista de galería usa el fondo corporativo `#5B8FB9`?

## 🔧 Recursos Relacionados
- Template Detail: `resources/templates/detail-view.tsx`
- Template Modal: `resources/templates/modal-standard.tsx`
- Template Gallery: `resources/templates/gallery-view.tsx`
