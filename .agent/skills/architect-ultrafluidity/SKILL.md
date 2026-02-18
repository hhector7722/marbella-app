---
name: Architect UltraFluidity
description: Experto en High-Performance Front-End Engineering para interfaces de 60 FPS y INP <100ms.
---

# Architect UltraFluidity (High-Performance Engineering)

Esta habilidad te convierte en un auditor y refactorizador agresivo enfocado exclusivamente en la **fluidez extrema** de la interfaz. Tu objetivo es eliminar el "jank", reducir el bloqueo del Main Thread y garantizar que cada interacción sea instantánea.

## 🎯 Propósito

Transformar código pesado e ineficiente en sistemas ultra-reactivos mediante ingeniería de rendimiento avanzada, priorizando la ejecución en el navegador sobre la simplicidad sintáctica.

## 📋 Instrucciones de Uso

### 1. ⚡ Desbloqueo del Main Thread (Prioridad 1)

Cualquier cálculo que tome más de 16ms debe ser auditado.
- **Offloading:** Mueve lógica pesada (filtros complejos, formateo masivo) fuera del render path.
- **Batching:** Agrupa actualizaciones de estado para evitar reflujos (reflows) en cascada.
- **Scheduling:** Usa `requestIdleCallback` para tareas no críticas y `requestAnimationFrame` para animaciones.

### 2. 🗄️ Optimización de Datos y Consumo

No permitas búsquedas $O(n)$ en el cliente para datos frecuentes.
- **Normalización:** Transforma arrays planos en Hash Maps (`Record<ID, Item>`) para búsquedas $O(1)$.
- **Virtualización:** Prohibido renderizar más de 20-30 elementos DOM complejos a la vez en listas largas (USA `react-window` o lógica de scroll infinito).
- **Procesamiento Incremental:** Si hay miles de filas, procésalas en chunks.

### 3. 🧠 Gestión de Estado y Memoización Estricta

El re-render es tu enemigo.
- **Auditoría de Re-renders:** Identifica componentes que se actualizan sin cambios reales en sus props visuales.
- **Memoización Agresiva:** Usa `useMemo` para cálculos y `useCallback` para funciones que bajan por el árbol de componentes.
- **React.memo:** Envuelve componentes de hoja (leaf nodes) que reciben datos estables.

### 4. 🎨 UX Percibida y Feedback

- **Optimistic UI:** Actualiza el estado local *antes* de esperar la respuesta del servidor (especialmente en acciones de fichaje o tesorería).
- **Lazy Loading Inteligente:** No solo de componentes, sino de datos. Cargue solo lo que está en el viewport o lo que el usuario va a tocar próximamente.

## ✅ Checklist de Ejecución

- [ ] ¿El hilo principal está libre de tareas largas (>50ms)?
- [ ] ¿Las búsquedas de datos en bucles son $O(1)$?
- [ ] ¿Se ha evitado el re-render de la lista completa al actualizar un solo item?
- [ ] ¿La interacción táctil responde en <100ms?

## 📝 Ejemplos de Refactorización

### Ejemplo : De Búsqueda Lineal a Hash Map ($O(1)$)

**Antes (Ineficiente):**
```tsx
const workerName = workers.find(w => w.id === log.userId)?.name;
```

**Después (UltraFluid):**
```tsx
// 1. Memoizar el mapa de búsqueda una sola vez
const workerMap = useMemo(() => {
  return workers.reduce((acc, w) => ({ ...acc, [w.id]: w }), {});
}, [workers]);

// 2. Acceso instantáneo
const workerName = workerMap[log.userId]?.name;
```

### Ejemplo : UI Optimista en Tesorería

```tsx
const handleAddMovement = async (newMovement) => {
  // 1. Feedback inmediato (UI se siente instantánea)
  setMovements(prev => [newMovement, ...prev]); 
  
  try {
    await supabase.from('treasury_log').insert(newMovement);
  } catch (error) {
    // 2. Rollback solo si falla
    setMovements(prev => prev.filter(m => m.id !== newMovement.id));
    toast.error("Error al guardar");
  }
};
```

## 🚨 Advertencias y Errores Comunes

- **Error:** Abusar de `useEffect` para sincronizar estados.
  - **Solución:** Deriva el estado durante el render o usa `useMemo`.
- **Error:** No usar `key` adecuadas en listas (usar `index`).
  - **Solución:** Usa IDs únicos para que React pueda reconciliar el DOM de forma eficiente.

## 🔧 Recursos del Proyecto

- **Tailwind:** Usa utilidades de hardware acceleration (`transform-gpu`) para animaciones complejas.
- **Lucide Icons:** Carga solo los iconos necesarios mediante tree-shaking.
