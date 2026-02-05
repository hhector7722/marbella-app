# DB Supabase Master - README

## 📦 Contenido de la Habilidad

Esta habilidad contiene:

### **SKILL.md** (Archivo Principal)
Guía completa de Supabase con:
- **5 Reglas Inquebrantables** (RLS, validación esquema, @supabase/ssr, lógica en DB, no asumir columnas)
- Checklist para nuevas tablas (estructura, seguridad, performance, triggers)
- 4 patrones comunes (server actions, triggers, materialized views, validaciones)
- 3 errores comunes y soluciones
- Referencias al schema.sql del proyecto

## 🎯 Reglas Inquebrantables

### 1. 🔒 RLS SIEMPRE
Toda tabla nueva DEBE tener Row Level Security habilitado con políticas apropiadas.

### 2. ✅ Verificar Esquema
NUNCA asumas que una columna existe. Lee el esquema antes de insertar.

### 3. 🍪 @supabase/ssr
En Server Actions, usa SIEMPRE `@supabase/ssr` para cookies, no `@supabase/supabase-js`.

### 4. 🗄️ Lógica Crítica en DB
Operaciones críticas (dinero, inventario) deben usar Functions/Triggers PostgreSQL.

### 5. 📊 No Asumir Columnas
Lee el esquema actual antes de proponer cambios o queries.

## 🚀 Cómo Usar Esta Habilidad

### Escenario 1: Crear Nueva Tabla

```
"Usa la habilidad DB Supabase Master para crear 
la tabla 'cash_registers' con RLS apropiado"
```

El AI:
- Creará tabla con UUIDs, timestamps, constraints
- Habilitará RLS
- Creará políticas de acceso
- Añadirá triggers para updated_at
- Sugerirá índices de performance

### Escenario 2: Validar Código Existente

```
"Usa la habilidad DB Supabase Master para revisar 
si mi Server Action tiene las cookies configuradas correctamente"
```

El AI verificará:
- Uso de `@supabase/ssr` (no `@supabase/supabase-js`)
- Correcta configuración de cookies (get/set/remove)
- Manejo de errores en try/catch

### Escenario 3: Migrar Lógica a DB

```
"Usa la habilidad DB Supabase Master para mover 
el cálculo de cierre de caja a una Function PostgreSQL"
```

El AI:
- Creará función en SQL con lógica transaccional
- Validará datos desde DB (no confía en cliente)
- Implementará manejo de errores
- Proporcionará wrapper TypeScript para llamarla

## ✅ Checklist Rápida

Al trabajar con Supabase:

**Nuevas Tablas:**
- [ ] UUID primary key con `DEFAULT gen_random_uuid()`
- [ ] `created_at` y `updated_at` timestamps
- [ ] CHECK constraints para validaciones
- [ ] RLS habilitado + políticas
- [ ] Índices en foreign keys y búsquedas frecuentes

**Server Actions:**
- [ ] Usa `@supabase/ssr`, no `@supabase/supabase-js`
- [ ] Configura cookies (get/set/remove)
- [ ] Verifica autenticación con `getUser()`
- [ ] Valida esquema antes de insertar
- [ ] Manejo de errores con try/catch

**Lógica Crítica:**
- [ ] Implementada como Function PostgreSQL
- [ ] Usa transacciones (BEGIN/COMMIT)
- [ ] Validaciones en DB, no solo cliente
- [ ] Retorna JSON estructurado
- [ ] Wrapper TypeScript con tipos

## 📚 Ejemplos Prácticos

### Ejemplo 1: Server Action Segura

```typescript
'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createOrder(data: OrderData) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => cookies().get(name)?.value,
        set: (name, value, options) => {
          try { cookies().set({ name, value, ...options }); } catch {}
        },
        remove: (name, options) => {
          try { cookies().set({ name, value: '', ...options }); } catch {}
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const { data: result, error } = await supabase
    .from('orders')
    .insert({ user_id: user.id, ...data })
    .select()
    .single();

  if (error) throw error;
  return result;
}
```

### Ejemplo 2: RLS Policies

```sql
-- Tabla con RLS
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  total DECIMAL(10,2) NOT NULL CHECK (total >= 0),
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Usuarios ven solo sus órdenes
CREATE POLICY users_own_orders ON orders
  FOR SELECT
  USING (auth.uid() = user_id);

-- Admin ve todo
CREATE POLICY admin_all_orders ON orders
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin');
```

### Ejemplo 3: Function Crítica en DB

```sql
CREATE OR REPLACE FUNCTION close_cash_register(
  register_id UUID,
  counted_amount DECIMAL(10,2)
)
RETURNS JSON AS $$
DECLARE
  expected DECIMAL(10,2);
  diff DECIMAL(10,2);
BEGIN
  -- Calcular desde DB (no confiar en cliente)
  SELECT opening + COALESCE(SUM(movements), 0)
  INTO expected
  FROM cash_registers
  WHERE id = register_id;

  diff := counted_amount - expected;

  -- Actualizar atómicamente
  UPDATE cash_registers
  SET 
    status = 'closed',
    counted = counted_amount,
    difference = diff,
    closed_at = NOW()
  WHERE id = register_id;

  RETURN json_build_object(
    'expected', expected,
    'counted', counted_amount,
    'difference', diff
  );
END;
$$ LANGUAGE plpgsql;
```

## 🔥 Errores Comunes

### ❌ Error 1: RLS Habilitado Sin Políticas
```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- Sin políticas = NADIE puede acceder (ni admin)
```

### ❌ Error 2: Usar createClient en Server
```typescript
// MAL: En Server Action
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(url, key);  // Sin cookies!
```

### ❌ Error 3: No Validar Esquema
```typescript
// MAL: Asumir que tax_amount existe
await supabase.from('orders').insert({
  total: 100,
  tax_amount: 21  // ¿Existe esta columna?
});
```

## 📖 Referencias

### Archivos del Proyecto
- [schema.sql](file:///c:/Users/hhect/EscandallsMaster/database/schema.sql) - Schema con RLS y triggers
- [middleware.ts](file:///c:/Users/hhect/EscandallsMaster/middleware.ts) - Ejemplo @supabase/ssr
- [app/actions/auth.ts](file:///c:/Users/hhect/EscandallsMaster/app/actions/auth.ts) - Server actions

### Documentación Oficial
- [Supabase RLS](https://supabase.com/docs/guides/auth/row-level-security)
- [@supabase/ssr](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [PostgreSQL Functions](https://www.postgresql.org/docs/current/xfunc.html)

---

**Estado:** ✅ Lista para usar  
**Ubicación:** [.agent/skills/db-supabase-master/](file:///c:/Users/hhect/EscandallsMaster/.agent/skills/db-supabase-master/)  
**Próximo paso:** Invocar cuando trabajes con Supabase (tablas, auth, server actions)
