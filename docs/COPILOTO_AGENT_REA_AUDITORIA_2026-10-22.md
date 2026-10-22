# Agente integrado de La Marbella — investigación y auditoría (22/10/2026)

## Encargo
Chat integrado que permita: (1) preguntas sobre ventas, recetas, inventario y manuales con permisos por usuario; (2) interacción por texto y mensajes de audio; (3) ejecutar acciones sobre la aplicación, especialmente agregar artículos a un pedido abierto **sin enviarlo**. La llamada en directo es secundaria.

## Método y referencias verificadas
- **REA 6.7.0** se ejecutó en el ordenador Crack (Fedora 44) sobre una sesión Chrome aislada apuntando a la documentación desplegada de CopilotKit. Inspección mediante `rea inspect-web-page`: evidencia `ev_4bfae3b74b87d087c75b301c5d6bad204b7da11f647f679ee28f8965c3d01725`; se observaron 1.021 nodos DOM. Su alcance es **estructura de la página**, no comportamiento del servidor ni ejecución de herramientas.
- **CopilotKit**, implementación abierta: `useFrontendTool` registra funciones ejecutadas en el navegador con acceso al estado React. Fuentes: https://docs.copilotkit.ai/agent-spec/frontend-tools y https://github.com/CopilotKit/CopilotKit .
- **Shopify Sidekick**, referencia funcional: consulta datos del negocio y propone acciones que la persona revisa antes de guardarlas. Fuente: https://shopify.dev/docs/apps/build/ai . No se inspeccionó ninguna sesión privada de Shopify con REA.
- **AI SDK 6**, ya usado en Marbella: `useChat` y `DefaultChatTransport` están integrados. La versión resuelta del paquete en el entorno local se comprobó en 6.0.235.

## Hallazgos reales sobre marbella-app
- `src/components/chat/ChatMarbella.tsx`: interfaz de texto, grabación de audio para transcripción, botón de llamada WebRTC. El chat está montado globalmente desde `src/app/layout.tsx`.
- `src/app/api/copiloto/route.ts`: procesamiento de mensajes con Ollama `qwen3:8b`, enrutador local de comandos y llamadas a herramientas; sesiones y mensajes persistidos.
- `src/app/api/copiloto/transcribe/route.ts`: utiliza transcripción de OpenAI; no se ha verificado disponibilidad de credenciales ni funcionamiento final.
- `src/app/api/copiloto/voice/token/route.ts`: modelo Realtime fechado en 2024; su disponibilidad y compatibilidad actuales están **sin verificar**. La llamada en vivo no debe ser una dependencia del MVP.
- `src/lib/copilot/permissions.ts`: permisos definidos por rol; además de este filtro hay que revisar autorizaciones efectivas de cada RPC y sus políticas RLS, especialmente funciones SECURITY DEFINER.
- `src/lib/copilot/actions.ts`: catálogo de acciones; `crear_pedido` es una RPC **no operativa**. Su implementación SQL declara explícitamente `no_implementada` y que los pedidos del TPV se originan en TPV/BDP.
- `src/app/dashboard/sala/page.tsx` y `src/components/dashboards/RadarSala.tsx`: visualizan información de `estado_sala` proveniente de TPV/BDP; no se ha encontrado un editor de borradores TPV en ese flujo.
- `src/app/orders/new/page.tsx` y `src/components/orders/OrderProductCard.tsx`: **otro tipo de pedido**, para proveedores. Tiene `order_drafts` compartido por proveedor, autosalvado y actualización por Realtime. Esta pantalla ya diferencia claramente **guardar borrador** de **tramitar/enviar pedido**.
- Estructura contrastada con Supabase, en solo lectura: `order_drafts` tiene clave compuesta `(supplier_id BIGINT, ingredient_id UUID)`. Los productos `Coca cola` y `Coca cola zero` están asociados a Santa Teresa, con unidad de pedido `pack`. Por tanto «cinco Coca-Colas» no puede traducirse sin más a cinco botellas: es necesario expresar y validar la unidad del borrador.

## Arquitectura elegida
1. Reutilizar `ChatMarbella` y Vercel AI SDK, no instalar otro chat framework.
2. Exponer funciones pequeñas de **consulta** que validen en backend usuario/rol y respeten RLS. Cada herramienta debe devolver datos y fuente; el modelo no infiere cifras de negocio.
3. Exponer funciones de **propuesta de acciones** específicas por pantalla. Antes de editar, resolver identificador de artículo, unidad y objetivo; mostrar propuesta confirmable. La aplicación actual —no el modelo— ejecuta la modificación y confirma el resultado.
4. Diferenciar `pedido de proveedor` de `comanda TPV`. El primer flujo tiene un borrador real. La edición del segundo necesita un mecanismo de escritura autorizado en TPV/BDP o un editor propio integrado, hoy no acreditado.
5. Nunca convertir `añadir al borrador` en `enviar pedido`. La capacidad de envío debe ser otra operación con autorización explícita.
6. Conservar el audio como transcripción + mismas herramientas de texto. No basar el MVP en una llamada viva.

## Seguridad y casos de aceptación
- Validar usuario real y permisos **en cada ejecución**, nunca confiar en roles inferidos por el modelo ni en datos de `pageContext` enviados desde el navegador.
- En el ejemplo de la Coca-Cola, identificar nombre exacto, proveedor y unidad de compra. Si hay ambigüedad, solicitar selección/confirmación en vez de sumar packs a ciegas.
- Aplicar cambios a borradores con control de concurrencia e idempotencia, ya que el borrador de proveedores es compartido.
- Mostrar error si una RPC devuelve `error: no_implementada`, aunque el transport SQL responda 200; no afirmar éxito inexistente.
- No exponer `service_role` al navegador ni permitir comandos SQL libres al agente.
- Registrar la identidad, herramienta, argumentos normalizados y resultado para operaciones de escritura.
- Tests: consulta autorizada y denegada; falta de contexto; producto ambiguo; unidad de compra; edición de borrador sin envío; reintentos; conflictos concurrentes; audio transcrito y enviado por chat.

## Cambios implementados en la rama aislada
- Contexto de pantalla reducido: cuando el usuario está en `/orders/new?supplier=...`, el chat recibe la referencia textual del proveedor. No se usa para autorizar operaciones.
- Instrucción verificable para no anunciar acciones que no tienen un resultado real y no confundir la herramienta `crear_pedido` con una modificación de borrador.
- Error explícito de herramienta (HTTP 501) ante RPC que devuelve `no_implementada`; HTTP 502 cuando falla el RPC. Previamente algunos errores podían pasar como resultado satisfactorio.
- Pruebas locales con cliente Supabase simulado: caso stub, error del RPC y ejecución correcta, los tres aprobados. TypeScript `--noEmit` aprobado.

## Corrección posterior al diagnóstico del usuario: asistente preexistente no funcional
El chatbot existente NO se considerará una implementación operativa. Los fallos relatados fueron: respuestas deficientes, grabaciones de audio sin respuesta y llamadas en directo fallidas. Se han identificado como causas técnicas plausibles —no verificadas mediante una sesión de usuario final— las dependencias del chat en Ollama local desde un despliegue de Vercel, el flujo de transcripción que únicamente rellenaba la caja de texto, y la dependencia de un modelo Realtime retirado (gpt-4o-realtime-preview-2024-12-17, fin de servicio 2026-05-07).

Se ha añadido una nueva ruta experimental de chat en `/api/copiloto/v2`, basada en Vercel AI SDK 6 y un proveedor OpenAI con `gpt-5.4-mini`. Se reutilizan sesión Supabase, comprobación de rol y un conjunto restringido de herramientas de consulta; no hay escrituras de negocio. El componente de chat apunta a esta ruta. Los audios grabados utilizan selección del formato compatible en navegador, transcripción con `gpt-transcribe` y envío automático del texto reconocido al chatbot. El endpoint comprueba autenticación, tamaño y tipo. La llamada antigua se oculta temporalmente hasta migrar a Realtime GA y probarla, sin prometer que funciona.

Validación estática: `tsc --noEmit` y ESLint de los archivos cambiados sin errores. NO se han ejecutado pruebas de extremo a extremo con sesión autenticada ni pruebas reales de audio contra OpenAI; `OPENAI_API_KEY` figura en metadatos de Vercel para Production pero no se ha validado su funcionamiento y no consta configurada para Preview. No se ha hecho despliegue.

## Preparación del despliegue Preview (22/10/2026, revisión posterior)
Vercel había creado automáticamente un despliegue Preview READY del commit `7fb8ff28`, pero la clave `OPENAI_API_KEY` estaba configurada únicamente para Production. Para evitar copiar credenciales a otros entornos, se migraron la ruta de texto a un ID de modelo de AI Gateway (`openai/gpt-5.4-mini`) y la transcripción al proveedor `gateway.transcriptionModel("openai/gpt-4o-mini-transcribe")` de AI SDK 6 con OIDC nativo de Vercel. Ambos modelos se comprobaron contra el catálogo del Gateway vigente (486 modelos), y se consultaron los ejemplos publicados dentro del paquete instalado. Esto evita claves específicas de OpenAI en Preview y limita su exposición. **Requiere verificar funcionamiento real, disponibilidad de saldo del equipo y credenciales de la sesión de usuario.**

## Limitaciones y pendientes
- **No se ha implementado todavía** la operación de añadir un producto mediante chat a un borrador. No afirmar lo contrario.
- No se modificó ninguna fila real de pedidos, productos o ventas en Supabase.
- No se realizó análisis dinámico autorizado de una sesión privada de Shopify.
- No se ha probado la transcripción o llamada en producción.
- La copia principal del repositorio en Crack estaba 301 commits por detrás del remoto: el trabajo se ha realizado en una rama/worktree desde `origin/main` actualizado (21/10/2026), sin alterar el checkout principal ni desplegar a producción.
