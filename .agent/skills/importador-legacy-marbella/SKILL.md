---
name: Importador Legacy Marbella
description: Asistente para la migración de datos históricos (Proveedores, Productos, Recetas, Logs) desde Excel/CSV a Supabase.
---

# Importador Legacy Marbella

## 🎯 Propósito

Facilitar la importación masiva y validación de datos históricos de Bar La Marbella. Esta habilidad guía el proceso de mapeo de archivos Excel/CSV antiguos a la nueva estructura de base de datos en Supabase, asegurando la integridad referencial y respetando las políticas RLS.

## 📋 Instrucciones de Uso

### 1. Preparación de Datos (ETL)

Antes de importar, los datos deben ser limpiados y estructurados.

#### Estructura Esperada (Ejemplos):

**Proveedores (`suppliers.xlsx`):**
| nombre | telefono | email | contacto | frecuencia_revisión |
|--------|----------|-------|----------|---------------------|
| Makro  | 600...   | ...   | ...      | Semanal             |

**Productos (`products.xlsx`):**
| nombre | categoría | proveedor | coste_unitario | unidad_medida | merma_% |
|--------|-----------|-----------|----------------|---------------|---------|
| Coca   | Refrescos | Makro     | 0.50           | Unidad        | 0       |

**Recetas (`recipes.xlsx`):**
| nombre_plato | categoría | coste_total | pvp | margen_% | ingredientes (JSON/Texto) |
|--------------|-----------|-------------|-----|----------|---------------------------|

### 2. Flujo de Importación

El proceso debe seguir este orden estricto para mantener la integridad referencial:
1.  **Proveedores**: Base de la cadena de suministro.
2.  **Productos/Ingredientes**: Requieren proveedores existentes.
3.  **Recetas**: Requieren productos existentes como ingredientes.
4.  **Histórico de Logs/Cierres**: Requieren configuración base.

### 3. Validación y Seguridad

-   **RLS (Row Level Security):** Todas las inserciones deben realizarse en el contexto de un usuario autenticado o mediante Service Role si es una migración administrativa, pero preferiblemente simulando la sesión del usuario para `created_by`.
-   **Duplicados:** Verificar existencia por nombre (normalizado a minúsculas/trim) antes de insertar `ON CONFLICT DO NOTHING` o `DO UPDATE`.
-   **Tipos de Datos:** Convertir strings de moneda ("10,50 €") a `numeric` (10.50).

## ✅ Checklist de Ejecución

- [ ] Instalar dependencia `xlsx` para parsing en cliente/servidor.
- [ ] Crear Server Actions segregados para cada tipo de entidad.
- [ ] Implementar feedback visual (barra de progreso o log de errores) durante la importación.
- [ ] Validar que los FK (claves foráneas) existan antes de insertar hijos.

## 🚨 Advertencias y Errores Comunes

-   **Error:** Importar Recetas antes que Productos.
    -   **Consecuencia:** Fallo de FK o recetas incompletas.
    -   **Solución:** Seguir el orden estricto (Proveedores -> Productos -> Recetas).
-   **Error:** Formatos de número con coma decimal.
    -   **Solución:** Usar utilidades de limpieza para convertir "10,50" a `10.50` antes de enviar a BD.
