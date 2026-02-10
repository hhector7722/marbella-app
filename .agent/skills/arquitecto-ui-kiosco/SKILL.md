---
name: Arquitecto UI Kiosco
description: Diseño de interfaces táctiles tipo iPhone usando Tailwind y componentes del proyecto
---

# Arquitecto UI Kiosco

Esta habilidad te guía en la creación de interfaces táctiles optimizadas para pantallas touch, siguiendo los estándares de iOS y aplicando las mejores prácticas con Tailwind CSS y la librería de componentes de Bar La Marbella.

## ⚠️ REGLAS INQUEBRANTABLES

> [!CAUTION]
> Estas reglas son **ABSOLUTAS** y **NO NEGOCIABLES**. Cualquier componente que las viole debe ser rechazado y corregido inmediatamente.

### 1. 👆 Touch-Friendly Obligatorio

**REGLA:** Todo elemento interactivo debe tener un **mínimo de 48px de altura**.

```tsx
// ❌ PROHIBIDO: Altura menor a 48px
<button className="h-10 px-4">Click</button>  // 40px - INACEPTABLE

// ✅ OBLIGATORIO: Mínimo h-12 (48px) o h-14 (56px) recomendado
<button className="h-14 px-6">Click</button>  // 56px - CORRECTO
```

- **Mínimo absoluto:** `h-12` (48px)
- **Recomendado:** `h-14` (56px)
- **Botones principales:** `h-16` (64px)

### 2. 🎨 Iconos SOLO de Lucide React

**REGLA:** **NUNCA** uses otros paquetes de iconos. Solo `lucide-react`.

```tsx
// ❌ PROHIBIDO
import { FaUser } from 'react-icons/fa';  // NO
import HomeIcon from '@heroicons/react';  // NO

// ✅ OBLIGATORIO
import { User, Home, Calendar } from 'lucide-react';

<User className="w-6 h-6" />
<Home className="w-6 h-6 text-zinc-600" />
```

**Instalación (si falta):**
```bash
npm install lucide-react
```

### 3. 🎁 Estética Bento Grid Estricta

**REGLA:** Todas las tarjetas/containers deben seguir el patrón Bento Grid.

```tsx
// ✅ PATRÓN OBLIGATORIO
<div className="
  bg-white              // Fondo claro
  rounded-2xl           // Bordes muy redondeados
  shadow-sm             // Sombra sutil
  border border-zinc-100  // Borde suave
  p-6                   // Padding generoso
">
  {/* Contenido */}
</div>
```

**Elementos del Bento Grid:**
- **Fondo:** Siempre `bg-white` (o `bg-zinc-50` para fondo de página)
- **Bordes:** `rounded-2xl` (tarjetas) o `rounded-xl` (botones)
- **Sombras:** `shadow-sm` (tarjetas) o `shadow-lg` (botones)
- **Separadores:** `border border-zinc-100`

### 4. 🚫 PROHIBIDO: Estilos Inline

**REGLA:** **NUNCA**, bajo **NINGUNA** circunstancia, uses `style={{}}` inline.

```tsx
// ❌ ABSOLUTAMENTE PROHIBIDO
<div style={{ padding: '24px', backgroundColor: '#fff' }}>
  // NUNCA HAGAS ESTO
</div>

// ✅ OBLIGATORIO: Solo Tailwind + cn()
import { cn } from '@/lib/utils';

<div className={cn(
  'p-6 bg-white',
  isActive && 'bg-blue-50',  // Condicional con cn()
  className  // Props adicionales
)}>
  // CORRECTO
</div>
```

**Por qué:**
- Consistencia visual garantizada
- Purge de Tailwind funciona correctamente
- Mantenibilidad del código
- No hay "estilos fantasma" sin rastrear

### 5. ⚡ Feedback Visual Inmediato

**REGLA:** Toda acción del usuario debe tener **feedback visual instantáneo** (< 100ms).

```tsx
// ✅ PATRÓN OBLIGATORIO para Botones
<button className={cn(
  'h-14 px-6',
  'bg-primary text-white',
  'rounded-xl shadow-lg',
  
  // OBLIGATORIO: Feedback táctil
  'transition-all duration-150',
  'active:scale-95',
  'active:shadow-md',
  
  // Estados de carga
  'disabled:opacity-50 disabled:pointer-events-none'
)}>
  {isLoading ? 'Cargando...' : 'Confirmar'}
</button>
```

**Tipos de Feedback Obligatorios:**

1. **Botones:** `active:scale-95` + `transition-all`
2. **Estados de Carga:** Spinner o texto "Cargando..."
3. **Toasts:** Usar `sonner` o similar para notificaciones
4. **Errores:** Feedback visual inmediato (borde rojo, mensaje)

```tsx
// Ejemplo con Toast (instalación: npm install sonner)
import { toast } from 'sonner';

const handleSubmit = async () => {
  setIsLoading(true);
  
  try {
    await submitData();
    toast.success('✓ Guardado correctamente');  // ✅ Feedback positivo
  } catch (error) {
    toast.error('✗ Error al guardar');  // ⚠️ Feedback de error
  } finally {
    setIsLoading(false);
  }
};
```

---

### 6. 🚫 REGLA ZERO-DISPLAY

**REGLA:** En vistas de lectura, resúmenes o dashboards (NO formularios), los valores iguales a `0` o `"0"` nunca deben mostrarse. Deben sustituirse por un espacio vacío `" "`.

```tsx
// ❌ PROHIBIDO: Mostrar ceros en resúmenes
<span>{totalHours}h</span> // Si totalHours es 0, se vería "0h"

// ✅ OBLIGATORIO: Usar formatDisplayValue o condicional
<span>{totalHours === 0 ? " " : `${totalHours}h`}</span>
```

---

> [!WARNING]
> **Violación de Reglas:** Si detectas código que viole estas reglas, **detente inmediatamente** y corrige antes de continuar. No hay excepciones.

---

## 🎯 Propósito

Garantizar que todas las interfaces de kiosco (pantallas táctiles sin mouse/teclado) sean:
- **Accesibles:** Touch targets mínimos de 44x44px
- **Responsivas:** Feedback visual inmediato al tocar
- **Intuitivas:** Layouts claros con jerarquía visual fuerte
- **Robustas:** Prevención de errores de entrada

## 📐 Estándares de Diseño Táctil

### 1. **Tamaños Mínimos de Touch Targets**

| Elemento | Tamaño Mínimo | Recomendado | Tailwind |
|----------|---------------|-------------|----------|
| Botón principal | 44x44px | 56x56px | `h-14` (56px) |
| Botón secundario | 44x44px | 48x48px | `h-12` (48px) |
| Icono clickable | 44x44px | 48x48px | `w-12 h-12` |
| Input de texto | 44px altura | 56px altura | `h-14` |
| Checkbox/Radio | 24x24px | 32x32px | `w-8 h-8` |
| Área de swipe | 60px altura | 80px altura | `h-20` |

> [!IMPORTANT]
> **Regla de Oro:** Cualquier elemento interactivo debe tener un área táctil mínima de 44x44px, incluso si el icono visual es más pequeño. Usa padding para expandir el área.

### 2. **Espaciado Entre Elementos**

- **Espacio mínimo entre botones:** 8px (`gap-2`)
- **Espacio cómodo entre botones:** 16px (`gap-4`)
- **Márgenes laterales en móvil:** 16-24px (`px-4` a `px-6`)
- **Padding interno de cards:** 24px (`p-6`)

### 3. **Tipografía Táctil**

```typescript
// Jerarquía de texto para kiosco
const kioskTypography = {
  hero: 'text-4xl font-bold',        // 36px - Títulos principales
  title: 'text-2xl font-bold',       // 24px - Títulos de sección
  button: 'text-lg font-bold',       // 18px - Texto de botones
  body: 'text-base',                 // 16px - Texto normal
  caption: 'text-sm',                // 14px - Etiquetas
  micro: 'text-xs',                  // 12px - Metadatos (usar con precaución)
}
```

> [!WARNING]
> **Evitar `text-xs` en elementos interactivos.** El texto demasiado pequeño dificulta la lectura en pantallas táctiles.

## 🎨 Paleta de Colores Táctiles

### Colores de Acción

```typescript
// Basado en tu configuración actual de Tailwind
const kioskColors = {
  // Acciones principales
  primary: 'bg-primary text-primary-foreground',           // Acciones neutras
  success: 'bg-emerald-500 text-white',                    // Confirmación (ENTRADA)
  danger: 'bg-rose-500 text-white',                        // Acciones destructivas (SALIDA)
  
  // Estados
  active: 'bg-blue-600 text-white',                        // Estado activo (timer)
  inactive: 'bg-zinc-50 border border-zinc-100',           // Estado inactivo
  
  // Feedback
  hover: 'hover:bg-opacity-90',                            // Hover ligero
  pressed: 'active:scale-95',                              // Feedback táctil
  
  // Accesibilidad
  disabled: 'opacity-50 pointer-events-none',              // Deshabilitado
}
```

### Contraste de Color

Asegúrate de que el contraste entre texto y fondo sea **mínimo 4.5:1** para WCAG AA:

- ✅ `bg-emerald-500 text-white` → Contraste 4.5:1
- ✅ `bg-zinc-800 text-white` → Contraste 12:1
- ❌ `bg-zinc-200 text-zinc-400` → Contraste insuficiente

## 🎭 Animaciones y Feedback Táctil

### 1. **Feedback Visual Inmediato**

Todo elemento interactivo debe tener feedback visual al ser tocado:

```tsx
// ✅ CORRECTO: Feedback táctil claro
<button className="
  h-14 px-8 
  bg-emerald-500 text-white 
  rounded-xl 
  shadow-lg shadow-emerald-200
  transition-all duration-150
  active:scale-95 
  active:shadow-md
">
  ENTRADA
</button>

// ❌ INCORRECTO: Sin feedback táctil
<button className="h-14 px-8 bg-emerald-500 text-white">
  ENTRADA
</button>
```

### 2. **Estados de Carga**

```tsx
// Patrón para estados de carga
<Button 
  disabled={isLoading}
  className="w-full h-14 transition-all"
>
  {isLoading ? (
    <span className="flex items-center gap-2">
      <Loader2 className="w-5 h-5 animate-spin" />
      Procesando...
    </span>
  ) : (
    'Confirmar'
  )}
</Button>
```

### 3. **Animaciones Predefinidas**

Tu configuración de Tailwind ya incluye:

```javascript
// tailwind.config.js
animation: {
  'pulse-glow': 'pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
}
```

Úsalo para elementos que necesiten atención:

```tsx
<div className="animate-pulse-glow bg-blue-600 rounded-2xl">
  {elapsed}
</div>
```

## 📋 Patrones de Componentes

### Patrón 1: Botón Táctil Grande

```tsx
interface KioskButtonProps {
  variant: 'success' | 'danger' | 'primary' | 'secondary';
  size?: 'default' | 'large';
  isLoading?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}

export function KioskButton({ 
  variant, 
  size = 'default', 
  isLoading, 
  children, 
  onClick 
}: KioskButtonProps) {
  const variants = {
    success: 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-200',
    danger: 'bg-rose-500 hover:bg-rose-600 shadow-rose-200',
    primary: 'bg-primary hover:bg-primary/90 shadow-primary/20',
    secondary: 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800 shadow-zinc-200',
  };

  const sizes = {
    default: 'h-14 px-6 text-lg',
    large: 'h-16 px-8 text-xl',
  };

  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      className={cn(
        // Base
        'w-full rounded-xl font-bold tracking-wide',
        'transition-all duration-150',
        'shadow-lg',
        
        // Variant
        variants[variant],
        
        // Size
        sizes[size],
        
        // States
        'active:scale-95 active:shadow-md',
        'disabled:opacity-50 disabled:pointer-events-none',
        
        // Text color (blanco por defecto excepto secondary)
        variant !== 'secondary' && 'text-white'
      )}
    >
      {isLoading ? '...' : children}
    </button>
  );
}
```

### Patrón 2: Card Táctil

```tsx
export function KioskCard({ 
  children, 
  className 
}: { 
  children: React.ReactNode; 
  className?: string 
}) {
  return (
    <div className={cn(
      // Base estructura
      'bg-white rounded-2xl',
      'border border-zinc-100',
      'shadow-sm',
      
      // Padding generoso para touch
      'p-6',
      
      // Custom
      className
    )}>
      {children}
    </div>
  );
}
```

### Patrón 3: Input Numérico para Kiosco

```tsx
export function KioskNumberInput({ 
  value, 
  onChange, 
  placeholder = '0',
  max = 999 
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  max?: number;
}) {
  return (
    <div className="space-y-2">
      <Input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const val = e.target.value;
          if (parseInt(val) <= max || val === '') {
            onChange(val);
          }
        }}
        placeholder={placeholder}
        className={cn(
          // Tamaño táctil
          'h-14 text-xl text-center',
          
          // Estilo
          'rounded-xl border-2',
          'font-bold tabular-nums',
          
          // Focus visible
          'focus:border-primary focus:ring-2 focus:ring-primary/20'
        )}
      />
    </div>
  );
}
```

### Patrón 4: Grid de Iconos (Accesos Rápidos)

```tsx
// Basado en tu componente IconBtn existente
export function KioskIconGrid({ 
  items 
}: { 
  items: Array<{ icon: LucideIcon; label: string; href: string }> 
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className={cn(
            // Estructura
            'flex flex-col items-center gap-3',
            'p-4 rounded-xl',
            
            // Touch target mínimo (más padding = más área)
            'min-h-[88px]',
            
            // Estilo
            'bg-zinc-50 border border-zinc-100',
            
            // Interacción
            'hover:bg-zinc-100 transition-all',
            'active:scale-95'
          )}
        >
          <item.icon className="w-6 h-6 text-zinc-600" />
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
            {item.label}
          </span>
        </a>
      ))}
    </div>
  );
}
```

## ✅ Checklist de Validación

Cuando crees o revises un componente de kiosco, verifica:

### Accesibilidad Táctil
- [ ] Todos los botones tienen mínimo `h-12` (48px) o `h-14` (56px)
- [ ] Área táctil total (incluyendo padding) es ≥ 44x44px
- [ ] Espacio entre elementos interactivos es ≥ 8px (`gap-2`)
- [ ] Text size en botones es ≥ `text-base` (16px)

### Feedback Visual
- [ ] Usa `active:scale-95` o `active:shadow-md` para feedback táctil
- [ ] Transiciones suaves con `transition-all duration-150`
- [ ] Estados de carga muestran spinner o texto "Cargando..."
- [ ] Estados deshabilitados usan `opacity-50` y `pointer-events-none`

### Diseño Visual
- [ ] Contraste de color cumple WCAG AA (4.5:1 mínimo)
- [ ] Bordes redondeados generosos (`rounded-xl` o `rounded-2xl`)
- [ ] Sombras sutiles para profundidad (`shadow-lg` en botones, `shadow-sm` en cards)
- [ ] Colores coherentes con la paleta del proyecto

### Responsive
- [ ] Funciona en viewport de 375px (iPhone SE)
- [ ] Funciona en viewport de 768px (iPad)
- [ ] Funciona en viewport de 1024px (Tablet landscape)
- [ ] Grid adaptativo con `grid-cols-1 md:grid-cols-2` cuando sea apropiado

## 🚨 Errores Comunes y Soluciones

### Error 1: Botones Demasiado Pequeños
**Síntoma:** El usuario tiene dificultad para tocar botones

```tsx
// ❌ MAL: Botón muy pequeño
<button className="h-8 px-2 text-xs">Click</button>

// ✅ BIEN: Botón táctil adecuado
<button className="h-14 px-6 text-lg">Click</button>
```

**Solución:** Usa siempre `h-12` (48px) como mínimo, `h-14` (56px) recomendado.

---

### Error 2: Sin Feedback Táctil
**Síntoma:** El usuario no sabe si tocó el botón

```tsx
// ❌ MAL: Sin feedback
<button className="bg-primary">Confirmar</button>

// ✅ BIEN: Feedback claro
<button className="bg-primary transition-all active:scale-95">
  Confirmar
</button>
```

**Solución:** Añade `transition-all active:scale-95` a todos los elementos interactivos.

---

### Error 3: Texto Ilegible
**Síntoma:** Bajo contraste o texto muy pequeño

```tsx
// ❌ MAL: Texto gris sobre fondo gris claro
<div className="bg-zinc-100 text-zinc-400 text-xs">Etiqueta</div>

// ✅ BIEN: Contraste adecuado
<div className="bg-zinc-100 text-zinc-700 text-sm font-medium">Etiqueta</div>
```

**Solución:** Verifica contraste con herramientas como [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/).

---

### Error 4: Elementos Interactivos Muy Juntos
**Síntoma:** El usuario toca el botón incorrecto

```tsx
// ❌ MAL: Sin espacio
<div className="flex">
  <button>A</button>
  <button>B</button>
</div>

// ✅ BIEN: Espacio adecuado
<div className="flex gap-4">
  <button>A</button>
  <button>B</button>
</div>
```

**Solución:** Usa `gap-4` (16px) mínimo entre elementos táctiles.

---

### Error 5: Estados de Carga No Comunicados
**Síntoma:** El usuario pulsa múltiples veces porque no sabe que está procesando

```tsx
// ❌ MAL: Sin indicador de carga
<button onClick={handleSubmit}>Guardar</button>

// ✅ BIEN: Estado de carga visible
<button 
  onClick={handleSubmit} 
  disabled={isLoading}
  className="disabled:opacity-50"
>
  {isLoading ? 'Guardando...' : 'Guardar'}
</button>
```

**Solución:** Siempre deshabilita y muestra estado durante operaciones asíncronas.

## 📚 Ejemplos Completos

### Ejemplo 1: Botón de Fichaje (Clock In/Out)

Este es el patrón que ya usas en `StaffDashboardClient.tsx`:

```tsx
{!openLog ? (
  <Button
    className={cn(
      // Tamaño táctil
      "w-full h-14",
      
      // Estilo exitoso
      "bg-emerald-500 hover:bg-emerald-600 text-white",
      
      // Bordes y sombras
      "rounded-xl shadow-lg shadow-emerald-200",
      
      // Tipografía
      "text-lg font-bold tracking-wide",
      
      // Feedback táctil
      "transition-all active:scale-95"
    )}
    onClick={handleClockInClick}
    disabled={isLoading}
  >
    {isLoading ? '...' : 'ENTRADA'}
  </Button>
) : (
  <Button
    className={cn(
      "w-full h-14",
      "bg-rose-500 hover:bg-rose-600 text-white",
      "rounded-xl shadow-lg shadow-rose-200",
      "text-lg font-bold tracking-wide",
      "transition-all active:scale-95"
    )}
    onClick={handleClockOutClick}
    disabled={isLoading}
  >
    {isLoading ? '...' : 'SALIDA'}
  </Button>
)}
```

**Por qué funciona:**
- ✅ Tamaño táctil: `h-14` (56px)
- ✅ Feedback visual: `active:scale-95`
- ✅ Contraste: Blanco sobre verde/rojo oscuro
- ✅ Estado de carga: Texto cambia a '...'
- ✅ Sombra de color para reforzar identidad visual

---

### Ejemplo 2: Layout de Kiosco Completo

```tsx
export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn(
      // Altura completa para evitar scroll
      "min-h-screen",
      
      // Padding generoso
      "p-6 md:p-8",
      
      // Color de fondo
      "bg-zinc-50"
    )}>
      {/* Header con título grande */}
      <header className="mb-8">
        <h1 className="text-4xl font-bold text-zinc-800">
          AI Kitchen Copilot
        </h1>
      </header>

      {/* Contenido principal */}
      <main className="max-w-4xl mx-auto">
        {children}
      </main>
    </div>
  );
}
```

---

### Ejemplo 3: Teclado Numérico (NumPad)

```tsx
export function NumPad({ 
  onNumberClick, 
  onBackspace, 
  onEnter 
}: {
  onNumberClick: (num: string) => void;
  onBackspace: () => void;
  onEnter: () => void;
}) {
  const numbers = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '✓'];

  return (
    <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
      {numbers.map((num) => {
        const isSpecial = num === 'C' || num === '✓';
        
        return (
          <button
            key={num}
            onClick={() => {
              if (num === 'C') onBackspace();
              else if (num === '✓') onEnter();
              else onNumberClick(num);
            }}
            className={cn(
              // Tamaño táctil grande
              "h-16 rounded-xl",
              
              // Tipografía
              "text-2xl font-bold",
              
              // Estilo base
              "bg-white border-2 border-zinc-200",
              "text-zinc-800",
              
              // Estilo especial para C y ✓
              isSpecial && "bg-primary text-white border-primary",
              
              // Interacción
              "transition-all active:scale-95",
              "hover:bg-zinc-50",
              isSpecial && "hover:bg-primary/90",
              
              // Sombra
              "shadow-md hover:shadow-lg"
            )}
          >
            {num}
          </button>
        );
      })}
    </div>
  );
}
```

**Por qué funciona:**
- ✅ Touch targets grandes: `h-16` (64px)
- ✅ Grid espaciado: `gap-3` (12px)
- ✅ Números grandes: `text-2xl`
- ✅ Feedback táctil inmediato

## 🔧 Herramientas y Recursos

### Constantes de Diseño

Crea un archivo `lib/kiosk-constants.ts`:

```typescript
export const KIOSK_CONSTANTS = {
  // Touch targets
  MIN_TOUCH_SIZE: 44,         // px
  RECOMMENDED_TOUCH_SIZE: 56, // px
  
  // Spacing
  MIN_GAP: 8,                 // gap-2
  COMFORTABLE_GAP: 16,        // gap-4
  SECTION_GAP: 24,            // gap-6
  
  // Font sizes
  BUTTON_TEXT: 'text-lg',     // 18px
  TITLE_TEXT: 'text-2xl',     // 24px
  HERO_TEXT: 'text-4xl',      // 36px
  
  // Animations
  TRANSITION_FAST: 'duration-150',
  TRANSITION_NORMAL: 'duration-200',
  TRANSITION_SLOW: 'duration-300',
  
  // Shadows
  SHADOW_BUTTON: 'shadow-lg',
  SHADOW_CARD: 'shadow-sm',
  
  // Border radius
  RADIUS_BUTTON: 'rounded-xl',
  RADIUS_CARD: 'rounded-2xl',
} as const;
```

### Testing Checklist

Para validar una interfaz de kiosco:

1. **Test de Dedo Gordo:** ¿Puedes tocar todos los botones fácilmente con el pulgar?
2. **Test de Brillo:** ¿Los colores son visibles con brillo máximo de pantalla?
3. **Test de Velocidad:** ¿El feedback es instantáneo (< 100ms)?
4. **Test de Error:** ¿Puedes recuperarte fácilmente de un toque accidental?
5. **Test de Distancia:** ¿El texto es legible a 50cm de distancia?

## 📌 Principios de Diseño

### 1. **Simplicidad Visual**
Cada pantalla debe tener una acción principal obvia.

### 2. **Jerarquía Clara**
Usa tamaño, color y posición para guiar la atención.

### 3. **Inmediatez**
Feedback táctil en < 100ms. Nunca dejar al usuario esperando sin indicador.

### 4. **Prevención de Errores**
Confirmaciones para acciones destructivas. Fácil de deshacer.

### 5. **Accesibilidad Primero**
Diseña para el usuario menos capaz, beneficia a todos.

---

**¡Listo para crear interfaces táctiles profesionales!** 🚀
