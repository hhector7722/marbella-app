---
name: DB Supabase Master
description: Mejores prácticas Supabase con RLS, SSR, validaciones y lógica en base de datos
---

# DB Supabase Master

Esta habilidad te guía en el desarrollo seguro y eficiente con Supabase (PostgreSQL + Auth), priorizando **seguridad (RLS)**, **validación de esquema** y **lógica crítica en base de datos**.

## 🎯 Propósito

Asegurar que todo el código relacionado con Supabase sea:
- **Seguro:** Row Level Security (RLS) en todas las tablas
- **Validado:** Verificación de esquema antes de operaciones
- **Robusto:** Lógica crítica en DB (triggers/functions)
- **Correcto:** Uso apropiado de @supabase/ssr para cookies
- **Performante:** Queries optimizadas e índices apropiados

## ⚠️ REGLAS INQUEBRANTABLES

> [!CAUTION]
> Estas reglas son **ABSOLUTAS** en código que interactúa con Supabase. Ninguna excepción.

### 1. 🔒 Row Level Security (RLS) SIEMPRE

**REGLA:** **TODA** tabla nueva DEBE tener RLS habilitado con políticas apropiadas.

```sql
-- ❌ PROHIBIDO: Tabla sin RLS
CREATE TABLE orders (
  id UUID PRIMARY KEY,
  user_id UUID,
  total DECIMAL(10,2)
);
-- ¡PELIGRO! Cualquiera puede ver/modificar todas las órdenes

-- ✅ OBLIGATORIO: RLS con políticas
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  total DECIMAL(10,2) NOT NULL CHECK (total >= 0),
  created_at TIMESTAMP DEFAULT NOW()
);

-- PASO CRÍTICO: Habilitar RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Políticas de acceso
CREATE POLICY users_own_orders ON orders
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY users_insert_own_orders ON orders
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

**Políticas comunes:**

```sql
-- Admin full access
CREATE POLICY admin_full_access ON table_name
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin');

-- Users see only their data
CREATE POLICY user_own_data ON table_name
  FOR SELECT
  USING (auth.uid() = user_id);

-- Specific role access
CREATE POLICY manager_read_all ON table_name
  FOR SELECT
  USING (auth.jwt() ->> 'role' IN ('admin', 'manager'));
```

### 2. ✅ Verificar Esquema ANTES de Insertar

**REGLA:** NUNCA asumas que una columna existe. Lee el esquema primero.

```typescript
// ❌ PROHIBIDO: Asumir columnas
export async function createOrder(data: OrderData) {
  const { data: result } = await supabase
    .from('orders')
    .insert({
      // ¿Qué pasa si esa columna no existe?
      total: data.total,
      tax_amount: data.tax  // ¿Existe tax_amount?
    });
}

// ✅ OBLIGATORIO: Verificar esquema primero
export async function createOrder(data: OrderData) {
  // 1. Leer esquema de la tabla
  const { data: columns } = await supabase
    .from('orders')
    .select('*')
    .limit(0);  // No trae datos, solo estructura

  if (!columns) {
    throw new Error('❌ Tabla "orders" no existe');
  }

  // 2. Verificar columnas requeridas
  const schemaInfo = Object.keys(columns[0] || {});
  const requiredColumns = ['user_id', 'total'];
  
  const missing = requiredColumns.filter(col => !schemaInfo.includes(col));
  if (missing.length > 0) {
    throw new Error(`❌ Columnas faltantes: ${missing.join(', ')}`);
  }

  // 3. Insertar solo columnas que existen
  const insertData: any = {
    user_id: data.userId,
    total: data.total
  };

  // Columna opcional
  if (schemaInfo.includes('tax_amount')) {
    insertData.tax_amount = data.tax;
  }

  const { data: result, error } = await supabase
    .from('orders')
    .insert(insertData)
    .select()
    .single();

  if (error) throw error;
  return result;
}
```

**Helper para validación:**

```typescript
/**
 * Verifica que una tabla exista y tiene las columnas requeridas
 */
export async function validateTableSchema(
  supabase: any,
  tableName: string,
  requiredColumns: string[]
): Promise<{ valid: boolean; missing: string[] }> {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(0);

    if (error) {
      return { valid: false, missing: requiredColumns };
    }

    const existingColumns = Object.keys(data?.[0] || {});
    const missing = requiredColumns.filter(
      col => !existingColumns.includes(col)
    );

    return { valid: missing.length === 0, missing };
  } catch (error) {
    return { valid: false, missing: requiredColumns };
  }
}
```

### 3. 🍪 @supabase/ssr para Server Actions

**REGLA:** En Server Actions/Components, usa **SIEMPRE** `@supabase/ssr` para manejar cookies.

```typescript
// ❌ PROHIBIDO: createClient del lado del servidor
import { createClient } from '@supabase/supabase-js';  // NO en Server Actions

export async function myAction() {
  const supabase = createClient(url, key);  // ❌ Sin cookies!
}

// ✅ OBLIGATORIO: createServerClient con cookies
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function myAction() {
  const cookieStore = cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            // En Route Handlers, las cookies son read-only en algunos casos
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch (error) {
            // Handle error
          }
        },
      },
    }
  );

  // Ahora puedes acceder a auth.users() correctamente
  const { data: { user } } = await supabase.auth.getUser();
  
  return user;
}
```

**Patrón en tu proyecto:**

```typescript
// app/actions/example.ts
'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Helper reutilizable
function getSupabaseClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value;
        },
        set(name, value, options) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {}
        },
        remove(name, options) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {}
        },
      },
    }
  );
}

export async function myServerAction() {
  const supabase = getSupabaseClient();
  
  // Tu lógica aquí
}
```

### 4. 🗄️ Lógica Crítica en Database

**REGLA:** Para operaciones críticas (dinero, inventario, cierre de caja), usa **Functions y Triggers** en PostgreSQL.

**¿Por qué?**
- ✅ Atómico (transacciones ACID)
- ✅ No depende de que el cliente envíe todos los datos
- ✅ Validaciones centralizadas
- ✅ Performance (menos round-trips)

```sql
-- ✅ EJEMPLO: Cierre de Caja (Operación Crítica)
CREATE OR REPLACE FUNCTION close_cash_register(
  register_id UUID,
  counted_amount DECIMAL(10,2)
)
RETURNS JSON AS $$
DECLARE
  expected_amount DECIMAL(10,2);
  difference DECIMAL(10,2);
  result JSON;
BEGIN
  -- 1. Verificar que la caja esté abierta
  IF NOT EXISTS (
    SELECT 1 FROM cash_registers 
    WHERE id = register_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Caja no está abierta';
  END IF;

  -- 2. Calcular monto esperado (desde DB, no desde cliente)
  SELECT 
    opening_amount + 
    COALESCE(SUM(CASE WHEN type = 'sale' THEN amount ELSE -amount END), 0)
  INTO expected_amount
  FROM cash_registers cr
  LEFT JOIN cash_movements cm ON cm.register_id = cr.id
  WHERE cr.id = register_id;

  -- 3. Calcular diferencia
  difference := counted_amount - expected_amount;

  -- 4. Cerrar caja (transacción atómica)
  UPDATE cash_registers
  SET 
    status = 'closed',
    expected_amount = expected_amount,
    counted_amount = counted_amount,
    difference = difference,
    closed_at = NOW()
  WHERE id = register_id;

  -- 5. Log en historial
  INSERT INTO cash_history (register_id, action, amount_diff, created_at)
  VALUES (register_id, 'close', difference, NOW());

  -- 6. Retornar resultado
  result := json_build_object(
    'expected', expected_amount,
    'counted', counted_amount,
    'difference', difference
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql;
```

**Llamar desde TypeScript:**

```typescript
export async function closeCashRegister(registerId: string, countedAmount: number) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .rpc('close_cash_register', {
      register_id: registerId,
      counted_amount: countedAmount
    });

  if (error) throw new Error(`Error al cerrar caja: ${error.message}`);

  return data as {
    expected: number;
    counted: number;
    difference: number;
  };
}
```

### 5. 📊 No Asumir Columnas Estándar

**REGLA:** Lee el esquema actual antes de proponer cambios.

```typescript
// ❌ PROHIBIDO: Asumir "email" o "name" existen
const { data } = await supabase
  .from('users')
  .select('email, name');  // ¿Y si se llama full_name?

// ✅ OBLIGATORIO: Inspeccionar primero
export async function getTableSchema(tableName: string) {
  const supabase = getSupabaseClient();

  // Opción 1: Query con limit 0
  const { data } = await supabase
    .from(tableName)
    .select('*')
    .limit(0);

  if (data) {
    const columns = Object.keys(data[0] || {});
    console.log(`✓ Columnas en ${tableName}:`, columns);
    return columns;
  }

  // Opción 2: Query a information_schema (más detallado)
  const { data: schemaInfo } = await supabase
    .rpc('get_table_columns', { table_name: tableName });

  return schemaInfo;
}

// Usar el esquema real
const columns = await getTableSchema('users');
const emailColumn = columns.includes('email') ? 'email' : 
                    columns.includes('user_email') ? 'user_email' : null;

if (!emailColumn) {
  throw new Error('No email column found in users table');
}
```

**Function SQL para inspección:**

```sql
CREATE OR REPLACE FUNCTION get_table_columns(table_name TEXT)
RETURNS TABLE(
  column_name TEXT,
  data_type TEXT,
  is_nullable BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.column_name::TEXT,
    c.data_type::TEXT,
    (c.is_nullable = 'YES')::BOOLEAN
  FROM information_schema.columns c
  WHERE c.table_name = get_table_columns.table_name
    AND c.table_schema = 'public'
  ORDER BY c.ordinal_position;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## 📋 Checklist para Nuevas Tablas

Cuando crees una tabla, verifica:

### Estructura
- [ ] Usa `UUID` para `id` con `DEFAULT gen_random_uuid()`
- [ ] Incluye `created_at TIMESTAMP DEFAULT NOW()`
- [ ] Incluye `updated_at TIMESTAMP DEFAULT NOW()` si mutable
- [ ] Usa `CHECK` constraints para validaciones (ej:` total >= 0`)
- [ ] Foreign keys con `ON DELETE CASCADE` o `ON DELETE RESTRICT` según lógica

### Seguridad
- [ ] `ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;`
- [ ] Política para `SELECT` (quién puede leer)
- [ ] Política para `INSERT` (quién puede crear)
- [ ] Política para `UPDATE` (quién puede modificar)
- [ ] Política para `DELETE` (quién puede borrar)

### Performance
- [ ] Índices en foreign keys
- [ ] Índices en columnas de búsqueda frecuente
- [ ] Índice GIN en arrays/JSON si aplica
- [ ] Considerar índice parcial si queries comunes filtran por condición

### Triggers (si aplica)
- [ ] Trigger para `updated_at` automático
- [ ] Trigger para audit log si es tabla sensible
- [ ] Trigger para recalcular agregaciones

## 🎯 Patrones Comunes

### Patrón 1: Server Action Segura

```typescript
'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createRecord(data: RecordData) {
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

  // 1. Verificar autenticación
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('No autenticado');
  }

  // 2. Validar esquema
  const { valid, missing } = await validateTableSchema(
    supabase,
    'records',
    ['user_id', 'title']
  );

  if (!valid) {
    throw new Error(`Columnas faltantes: ${missing.join(', ')}`);
  }

  // 3. Insertar con RLS automático
  const { data, error } = await supabase
    .from('records')
    .insert({
      user_id: user.id,  // RLS verificará que esto sea correcto
      title: data.title
    })
    .select()
    .single();

  if (error) throw error;

  return { success: true, data };
}
```

### Patrón 2: Trigger Automático para updated_at

```sql
-- Función reutilizable
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar a cualquier tabla
CREATE TRIGGER trigger_tablename_updated_at
  BEFORE UPDATE ON table_name
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### Patrón 3: Materialized View con Auto-Refresh

```sql
-- Vista materializada (ejemplo: stock consolidado)
CREATE MATERIALIZED VIEW inventory_summary AS
SELECT 
  product_id,
  SUM(CASE WHEN type = 'in' THEN quantity ELSE -quantity END) as stock_level,
  MAX(updated_at) as last_movement
FROM inventory_movements
GROUP BY product_id;

-- Índice único para REFRESH CONCURRENTLY
CREATE UNIQUE INDEX idx_inventory_summary_product 
ON inventory_summary(product_id);

-- Función para refrescar
CREATE OR REPLACE FUNCTION refresh_inventory_summary()
RETURNS TRIGGER AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY inventory_summary;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para auto-refresh
CREATE TRIGGER trigger_refresh_inventory
  AFTER INSERT OR UPDATE OR DELETE ON inventory_movements
  FOR EACH STATEMENT
  EXECUTE FUNCTION refresh_inventory_summary();
```

### Patrón 4: Validación en DB (no solo en cliente)

```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  
  -- ✅ Validaciones a nivel DB
  CHECK (price >= 0),
  CHECK (stock >= 0),
  CHECK (CHAR_LENGTH(name) >= 3),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Trigger adicional para lógica compleja
CREATE OR REPLACE FUNCTION validate_product()
RETURNS TRIGGER AS $$
BEGIN
  -- No permitir precio 0 en productos activos
  IF NEW.price = 0 AND NEW.is_active = true THEN
    RAISE EXCEPTION 'Producto activo no puede tener precio 0';
  END IF;

  -- Uppercase automático del nombre
  NEW.name := UPPER(NEW.name);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_product
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION validate_product();
```

## 🚨 Errores Comunes

### Error 1: RLS Habilitado pero Sin Políticas

```sql
-- ❌ Error común
ALTER TABLE sensitive_data ENABLE ROW LEVEL SECURITY;
-- Sin políticas = nadie puede acceder (ni siquiera admins)

-- ✅ Correcto
ALTER TABLE sensitive_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY allow_admin ON sensitive_data
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin');
```

### Error 2: No Usar Transacciones para Operaciones Múltiples

```typescript
// ❌ Peligroso: Si falla el segundo insert, el primero queda
await supabase.from('orders').insert({ ... });
await supabase.from('order_items').insert({ ... });  // ¡Puede fallar!

// ✅ Usar RPC con transacción en DB
await supabase.rpc('create_order_with_items', {
  order_data: { ... },
  items_data: [ ... ]
});
```

```sql
CREATE OR REPLACE FUNCTION create_order_with_items(
  order_data JSON,
  items_data JSON[]
)
RETURNS UUID AS $$
DECLARE
  new_order_id UUID;
BEGIN
  -- Todo en una transacción
  INSERT INTO orders (user_id, total)
  VALUES (
    (order_data->>'user_id')::UUID,
    (order_data->>'total')::DECIMAL
  )
  RETURNING id INTO new_order_id;

  -- Insertar items
  INSERT INTO order_items (order_id, product_id, quantity)
  SELECT 
    new_order_id,
    (item->>'product_id')::UUID,
    (item->>'quantity')::INT
  FROM unnest(items_data) AS item;

  RETURN new_order_id;
END;
$$ LANGUAGE plpgsql;
```

### Error 3: N+1 Queries

```typescript
// ❌ N+1 problem
const { data: orders } = await supabase.from('orders').select('id');
for (const order of orders) {
  const { data: items } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', order.id);  // Query por cada orden!
}

// ✅ Join único
const { data: ordersWithItems } = await supabase
  .from('orders')
  .select(`
    *,
    order_items (*)
  `);
```

## 📚 Referencias del Proyecto

### Archivos Clave
- [schema.sql](file:///c:/Users/hhect/EscandallsMaster/database/schema.sql) - Schema completo con RLS y triggers
- [middleware.ts](file:///c:/Users/hhect/EscandallsMaster/middleware.ts) - Uso de @supabase/ssr
- [app/actions/auth.ts](file:///c:/Users/hhect/EscandallsMaster/app/actions/auth.ts) - Server actions con cookies

### Ejemplos del Schema Actual

**RLS implementado:**
```sql
-- De tu schema.sql (línea 251-267)
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_full_access_ingredients ON ingredients
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY cocina_read_ingredients ON ingredients
  FOR SELECT
  USING (auth.jwt() ->> 'role' = 'cocina');
```

**Trigger para price history:**
```sql
-- De tu schema.sql (línea 204-219)
CREATE OR REPLACE FUNCTION log_price_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.current_price != NEW.current_price THEN
    INSERT INTO ingredient_price_history (...)
    VALUES (NEW.id, OLD.current_price, NEW.current_price);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

**Recuerda:** La seguridad primero. RLS no es opcional. 🔒
