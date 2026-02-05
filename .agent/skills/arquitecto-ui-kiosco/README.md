# Arquitecto UI Kiosco - README

## 📦 Contenido de la Habilidad

Esta habilidad contiene:

### 1. **SKILL.md** (Archivo Principal)
Guía completa con:
- Estándares de diseño táctil (tamaños, espaciado, tipografía)
- Paleta de colores optimizada
- Animaciones y feedback táctil
- Patrones de componentes con código
- Checklist de validación
- Errores comunes y soluciones
- Ejemplos completos

### 2. **examples/kiosk-components.tsx**
Componentes React listos para usar:
- `KioskButton` - Botón táctil con variants
- `KioskCard` - Card con padding generoso
- `KioskIconButton` - Botón de icono táctil
- `KioskNumPad` - Teclado numérico

### 3. **resources/kiosk-design-tokens.ts**
Constantes de diseño:
- Touch targets (tamaños mínimos)
- Spacing (gaps y padding)
- Typography (tamaños de fuente)
- Colors (paleta táctil)
- Animations (transiciones y feedback)
- Funciones helper: `getKioskButtonClasses()`, `getKioskCardClasses()`

## 🚀 Cómo Usar Esta Habilidad

### Opción 1: Leer la Guía Completa
```
Abre: .agent/skills/arquitecto-ui-kiosco/SKILL.md
```
Lee las secciones relevantes según tu necesidad.

### Opción 2: Copiar Componentes de Ejemplo
```typescript
// Desde: .agent/skills/arquitecto-ui-kiosco/examples/kiosk-components.tsx
import { KioskButton } from './kiosk-components';

<KioskButton variant="success" size="large" onClick={handleClick}>
  CONFIRMAR
</KioskButton>
```

### Opción 3: Usar Design Tokens
```typescript
// Desde: .agent/skills/arquitecto-ui-kiosco/resources/kiosk-design-tokens.ts
import { KIOSK_CONSTANTS, getKioskButtonClasses } from './kiosk-design-tokens';

// Opción A: Usar constantes directamente
<button className={cn(
  KIOSK_CONSTANTS.TOUCH.RECOMMENDED_CLASS,
  KIOSK_CONSTANTS.TYPOGRAPHY.BUTTON,
  KIOSK_CONSTANTS.ANIMATIONS.TOUCH_FEEDBACK
)}>
  Click
</button>

// Opción B: Usar funciones helper
<button className={getKioskButtonClasses('success', 'large')}>
  Click
</button>
```

## ✅ Checklist Rápida

Al crear un componente táctil, verifica:

- [ ] Touch target ≥ 44x44px (usar `h-14` o mayor)
- [ ] Feedback táctil con `active:scale-95`
- [ ] Spacing entre elementos ≥ 8px (`gap-2` mínimo)
- [ ] Texto de botones ≥ 16px (`text-base` o mayor)
- [ ] Contraste de color ≥ 4.5:1
- [ ] Estados de carga visibles
- [ ] Border radius generoso (`rounded-xl` o `rounded-2xl`)

## 📞 Invocar Esta Habilidad

Cuando necesites crear o validar una interfaz táctil, di:

> "Usa la habilidad Arquitecto UI Kiosco para crear [componente/pantalla]"

El AI leerá automáticamente las instrucciones y aplicará los estándares.

---

**Versión:** 1.0  
**Última actualización:** 24 Enero 2026  
**Proyecto:** Bar La Marbella - AI Kitchen Copilot
