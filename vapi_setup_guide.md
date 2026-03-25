# Guía de Configuración Vapi - Bar La Marbella

Para activar el nuevo Agente de Voz "Clean Start", sigue estos pasos en el [Vapi Dashboard](https://dashboard.vapi.ai/):

## 1. Crear el Asistente
- **Nombre**: Marbella AI Pro
- **Modelo**: GPT-4o
- **Transcriber**: Deepgram (Nova-2) para español/catalán.
- **Voice**: Azure (Sonia) o OpenAI (Shimmer) para un tono profesional.

## 2. Configurar Herramientas (Tools)
En la sección "Tools", añade las siguientes herramientas apuntando a tu URL de producción:
- **Webhook URL**: `https://tu-dominio.com/api/ai/voice/vapi`

### Herramientas Requeridas:
1. **get_labor_summary_tool**
   - Descripción: Consulta horas trabajadas y extras.
   - Parámetros: `targetEmployeeName` (string, opcional).
2. **get_financials_tool**
   - Descripción: Consulta ventas (Cierres de Caja). Solo para Managers.
   - Parámetros: `startDate`, `endDate` (string, YYYY-MM-DD).
3. **get_recipe_info_tool**
   - Descripción: Consulta ingredientes y elaboración.
   - Parámetros: `recipeName` (string).
4. **update_order_draft_tool**
   - Descripción: Añadir/Quitar del carrito de compra.
   - Parámetros: `productName`, `quantity`, `action` ('add', 'set', 'remove').

## 3. Vincular con el Frontend
Una vez creado el asistente:
1. Copia tu **Public Key** de la configuración de cuenta en Vapi.
2. Copia el **Assistant ID** de tu nuevo asistente.
3. Edita el archivo `src/components/ai/AIVoiceCall.tsx` y reemplaza los placeholders:
   - `VAPI_PUBLIC_KEY_PLACEHOLDER`
   - `VAPI_ASSISTANT_ID_PLACEHOLDER`

## 4. Notas de Seguridad
El sistema ya está configurado para:
- Detectar el `userId` automáticamente desde el frontend.
- Validar permisos en el servidor (un "Staff" no podrá usar la herramienta de ventas aunque lo intente).
