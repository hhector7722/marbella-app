# Asistente Marbella: consultas fiables con permisos (Groq)

## Problemas corregidos

- **«¿Cuántos cafés hemos vendido hoy?»** Consulta `get_full_period_ticket_sales_detail` (líneas de TPV) y suma unidades y facturación de nombres de bebida de café (incluyendo cortados y americanos). No confunde la cantidad de tickets con las unidades; entrega el detalle de artículos para comprobar qué se está contando.
- **«¿Cuántas horas trabajó Fernando la semana pasada?»** Calcula lunes a domingo en Europe/Madrid, resuelve al empleado por nombre, llama la RPC autorizada `consultar_registros_asistencia` y suma fichajes completos. Marca los abiertos o inválidos. No confunde horas trabajadas con contratadas o extraordinarias.
- **«¿Qué lleva la sangría?»** Lee `recipes`, `recipe_ingredients` e `ingredients` con consulta de sesión. Si existe más de una sangría, pide que se elija. Indica elaboración y cantidades reales. Ya no depende únicamente del motor de expansión de recetas que puede devolver un campo vacío.
- Los mensajes del asistente no muestran los asteriscos `**` ni comillas de código literalmente.
- Más iteraciones de herramientas y selección forzada en preguntas operativas, sin otro proveedor de pago como sustituto.

## Permisos

Los usuarios están autenticados mediante Supabase `auth.getUser` y el rol se toma de `profiles.role` del servidor. El modelo no suministra el rol ni recibe una clave service-role. El catálogo del modelo se filtra por `canExecute`, **y se vuelven a comprobar los permisos en cada ejecución**.

- Ventas por artículo: solo roles con `consultar_metricas_basicas` (manager/admin en el sistema actual).
- Recetas e ingredientes: roles con `gestionar_recetas`; el backend solo permite lectura.
- Horas: personal y roles con `consultar_registros_asistencia`. Personal limitado a `auth.uid()` y a su propia identidad. Consulta de terceros solo si además existe permiso `consultar_usuarios`. La RPC también verifica permisos en PostgreSQL.
- No se exponen herramientas de edición de caja, stock, usuarios, empleados o pedidos; el chat es **de consulta** hasta incorporar confirmaciones y autorización específica.

Las respuestas obtenidas de la BD son información contextual, no instrucciones; el modelo no puede decidir saltar RLS ni ejecutar SQL arbitrario.

## Límites

No significa acceso a todas las tablas automáticamente. Solo puede contestar con precisión sobre módulos con herramientas implementadas y autorizadas. Las consultas a albaranes OCR, nóminas, tareas sin API y operaciones de escritura requieren herramientas propias adicionales. Si faltan datos debe decirlo, sin inventarlos.

La llamada a Groq requiere la clave `GROQ_API_KEY` de la organización gratuita y sigue sujeta a cuota, latencia y términos de privacidad. Se transmiten al proveedor las preguntas y los resultados mínimos necesarios para contestar; revisar tratamiento de datos laborales conforme al RGPD. No se modifican OpenAI Realtime, STT ni OCR.

## Pruebas

```bash
node --experimental-strip-types --test src/lib/copilot/knowledge-tools.test.ts src/lib/copilot/groq-chat.test.ts
npx tsc --noEmit
npx eslint src/lib/copilot src/app/api/copiloto/route.ts src/components/chat/ChatMarbella.tsx
```

El test con datos simulados valida selección de herramienta, 61 tickets vs 17 cafés/cortados, suma de fichajes, bloqueo de terceros y recuperación de ingredientes. Hay que verificar también en sesión autenticada el resultado real de las tres preguntas de las capturas.
