---
name: Especialista Tesorería Marbella
description: Experto en lógica de caja, balances teóricos y sincronización de arqueos para Bar Marbella.
---

# Especialista Tesorería Marbella

Esta habilidad garantiza que la gestión de efectivo en el proyecto "Bar Marbella Clean" sea matemáticamente exacta y robusta contra errores de usuario o de lógica.

## 🎯 Propósito

Mantener la integridad total entre el historial de movimientos (`treasury_log`) y los balances de las cajas (`cash_boxes`). El objetivo es que el usuario siempre sepa cuánto dinero "debería" haber (Teórico) frente a lo que hay realmente (Físico).

## 📋 Axiomas de Tesorería

### 1. Balance Teórico Absoluto
El Saldo que se muestra como "Saldo" o "Balance Teórico" debe calcularse **IGNORANDO TODOS LOS ARQUEOS**.
- **Fórmula:** `SaldoInicial + Suma(Entradas) - Suma(Salidas)`.
- **Por qué:** Los arqueos no son movimientos de dinero, son correcciones de errores. La contabilidad real solo debe verse afectada por lo que entra y sale.

### 2. Sincronización Total (Triggers)
Cualquier cambio en la tabla `treasury_log` debe reflejarse automáticamente en `cash_boxes`.
- **INSERT:** Sumar/Restar según el tipo.
- **UPDATE:** Deshacer el efecto del registro antiguo (`OLD`) y aplicar el nuevo (`NEW`).
- **DELETE:** Deshacer el efecto del registro eliminado.
- **REGLA DE ORO:** Nunca permitir que el balance de la caja se desvíe de la suma de sus logs.

### 3. Lógica de Arqueo (Arqueo = Corrección)
Cuando se realiza un arqueo físico:
1. El inventario de denominaciones se sobrescribe completamente.
2. El `current_balance` de la caja se fija al valor contado.
3. El log guarda la **Diferencia (Descuadre)** en la columna `amount`.
   - `amount = ValContado - BalanceActual`.

### 4. Visualización Premium
- **Regla Zero-Display:** En vistas de lectura, valores iguales a 0€ se muestran como espacio vacío " ".
- **Diferencia:** Si es negativa (falta dinero), usar colores de alerta (Naranja/Rojo).

## ✅ Checklist de Auditoría

- [ ] ¿El trigger maneja `UPDATE` y `DELETE` para evitar balances huérfanos?
- [ ] ¿El balance mostrado en la tabla de movimientos es el Teórico?
- [ ] ¿Se filtran correctamente los arqueos para que no ensucien el extracto de ingresos/gastos?
- [ ] ¿El "Saldo Acumulativo" de la tabla tiene sentido temporal (va de presente a pasado correctamente)?

## 📝 Ejemplos de Lógica Correcta

### SQL: Trigger de Sincronización Robusto
```sql
CREATE OR REPLACE FUNCTION fn_sync_treasury_all_ops()
RETURNS TRIGGER AS $$
BEGIN
    -- 1. Reversar el OLD si es UPDATE o DELETE
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        UPDATE cash_boxes 
        SET current_balance = current_balance - (CASE WHEN OLD.type = 'OUT' THEN -OLD.amount ELSE OLD.amount END)
        WHERE id = OLD.box_id;
    END IF;

    -- 2. Aplicar el NEW si es INSERT o UPDATE
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        UPDATE cash_boxes 
        SET current_balance = current_balance + (CASE WHEN NEW.type = 'OUT' THEN -NEW.amount ELSE NEW.amount END)
        WHERE id = NEW.box_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
```

## 🚨 Errores Críticos a Evitar
- **Arqueos aditivos:** Nunca sumes un arqueo al balance anterior; el arqueo ES el nuevo balance.
- **Ignorar el `OLD` en actualizaciones:** Si un usuario cambia un gasto de 10€ por 100€, el sistema debe restar los 90€ de diferencia, no sumar 100€ adicionales.
- **Saldo Real en la tabla de movimientos:** La tabla debe mostrar el Saldo Teórico Histórico para que el usuario pueda auditar dónde ocurrió un descuadre.
