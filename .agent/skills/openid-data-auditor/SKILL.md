---
name: OpenAIDataAuditor
description: Especialista en auditar y mapear la integración de datos entre OpenAI y Supabase.
---

# OpenAIDataAuditor

Esta habilidad permite realizar una auditoría técnica profunda sobre cómo el modelo de OpenAI accede a los datos del negocio, identificando "puntos ciegos" y proponiendo arquitecturas de herramientas (Function Calling) y RAG.

## 🎯 Propósito

Eliminar la ceguera de datos de la IA mediante el mapeo de tres vectores críticos: Inyección de Contexto, Ecosistema de Herramientas y Seguridad de Datos (RLS/Auth).

## 📋 Instrucciones de Uso

### 1. Auditoría de Inyección de Contexto (System Prompt)
Rastrear los archivos donde se definen los prompts del sistema (ej. `src/app/api/chat/route.ts`).
- Identificar variables de entorno o constantes que contengan reglas del negocio.
- Verificar si la identidad del usuario (nombre, rol) se está pasando dinámicamente.

### 2. Mapeo del Ecosistema de Herramientas (Function Calling)
Analizar el código en busca de consultas SQL o lógica de Supabase que deba exponerse a la IA.
- Validar las firmas de las funciones con `zod`.
- Diseñar la estructura de herramientas para que sean modulares y reutilizables.

### 3. Validación de Permisos y Auth de DB
Determinar el nivel de acceso necesario para cada herramienta.
- **Service Role**: Para operaciones administrativas transversales protegidas por RLS.
- **Anon Key**: Para consultas que deben respetar la sesión del usuario.
- Verificar la configuración de `supabaseServerClient` o similares.

## ✅ Checklist de Ejecución

- [ ] Identificar archivos de ruta de API de Chat.
- [ ] Listar herramientas actuales y propuestas.
- [ ] Verificar políticas RLS relevantes.
- [ ] Generar reporte arquitectónico con "Mapa de Ceguera".

## 📝 Ejemplos

### Ejemplo: Estructura de Herramienta Recomendada (v2)

```typescript
{
  name: 'get_stock_audit',
  description: 'Obtiene el inventario actual de un producto específico.',
  parameters: z.object({
    product_name: z.string().describe('Nombre del producto a consultar')
  }),
  execute: async ({ product_name }) => {
    // Implementación con Service Role si es admin-only
    const { data } = await supabaseAdmin.from('inventory').select('*').ilike('name', `%${product_name}%`);
    return data;
  }
}
```

## 🚨 Advertencias y Errores Comunes

- **Error de Alucinación:** No proporcionar datos exactos de la DB en el prompt.
- **Fuga de Datos:** Exponer herramientas sensibles a usuarios sin el rol adecuado.
- **Latencia:** Herramientas que realizan consultas SQL demasiado complejas o lentas.
