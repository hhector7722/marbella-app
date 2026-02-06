---
name: Tester Especialista Marbella
description: Auditoría de calidad, validación de RLS, pruebas de UI táctil y stress testing financiero.
---

# Tester Especialista Marbella 🧪

## 🎯 Propósito
Garantizar la robustez del sistema, la seguridad de los datos de los empleados y la usabilidad perfecta de la interfaz en el entorno real del bar.

## 📋 Instrucciones de Uso

### 1. Auditoría de Seguridad (Supabase RLS)
Antes de dar por terminada una tarea de base de datos:
- **Verificación RLS:** Ejecutar pruebas simulando diferentes roles (`staff`, `admin`, `manager`).
- **Privacidad:** Asegurar que los datos salariales y logs personales solo son accesibles por el dueño o administradores.

### 2. Auditoría UX Kiosco (Touch First)
Validar que la UI es operable en condiciones de trabajo rápido.
- **Touch Targets:** Tamaño mínimo de elementos interactivos: **48px**.
- **Retroalimentación:** Todos los botones deben tener estados `active` y `hover` claros.

### 3. Stress Test Financiero
Verificar cálculos en situaciones límite.
- **Redondeo:** Probar con precios y cantidades que generen muchos decimales para asegurar que los totales cuadran al céntimo.
- **Límites de Tiempo:** Validar fichajes que crucen la medianoche o jornadas de >12 horas.

## ✅ Checklist de Ejecución
- [ ] ¿Se han probado las políticas RLS con roles no administrador?
- [ ] ¿Todos los botones nuevos tienen al menos 48px de altura?
- [ ] ¿Se han validado los cálculos con casos de borde (ej. 0 ventas, descuentos 100%)?
- [ ] ¿La interfaz responde en <200ms en dispositivos móviles?

## 🚨 Advertencias
- **Error:** Probar solo en escritorio.
    - **Solución:** Usar el simulador de dispositivos móviles del navegador o herramientas de testeo real.
