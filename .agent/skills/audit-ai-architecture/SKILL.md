---
name: AuditAIArchitecture
description: Herramienta de análisis estático y dinámico para auditar la integración de IA (Texto y Voz) en Bar La Marbella.
---

# AUDIT AI ARCHITECTURE (AI-ARCH-AUDITOR)

Esta habilidad está diseñada para diagnosticar fallos sistémicos en la integración de IA, centrándose en la transición a Gemini y el ecosistema de Voz de LiveKit.

## VECTORES DE ANÁLISIS

### 1. Frontera Cliente/Servidor (Hybrid Mesh)
- **Rutas Críticas:** `src/components/ai/AIChatWidget.tsx` -> `src/app/api/chat/route.ts`.
- **Modelos:** El chat web utiliza **OpenAI (gpt-4o-mini)**. El worker de voz utiliza **Gemini (2.0-flash-exp)**.
- **Hooks:** Validar el uso de `useChat` de `ai/react` (v3+ compatible con OpenAI).
- **Data Flow:** Verificar que el streaming no se rompe por buffers de middleware o headers de Supabase Auth.

### 2. Ecosistema de Voz (Worker-First)
- **Componentes:** `src/components/ai/AIVoiceCall.tsx`.
- **Worker Script:** `ai-voice-worker/agent.py` (o similar).
- **Latencia:** Verificar el pipeline VAD -> STT -> LLM -> TTS.
- **Auth:** Relación entre el backend de Next.js generando tokens de LiveKit y la conexión del worker.

### 3. LLM Supply Chain (Dependency Audit)
- **SDKs:** 
  - `ai` (Vercel AI SDK)
  - `@ai-sdk/google` (Gemini Provider)
  - `livekit-server-sdk` / `livekit-client`
- **Incompatibilidades:** Detectar parches de versiones (ej. `ai@3` vs `ai@4+`) que causan errores 500.

### 4. Seguridad y Red (Isolation)
- **Middleware:** Bloqueos en `middleware.ts` en rutas `/api/ai/*`.
- **RLS:** Políticas de Supabase en tablas de logs de IA o historial.
- **VARS:** Consistencia de `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.

## REGLAS DE REPORTE
- **Precisión:** Indicar archivo y número de línea exactos.
- **Severidad:** Marcar como CRÍTICO (Bloqueante), ALTO (Ruptura de flujo), o MEDIO (Deuda técnica).
- **Simplicidad:** Sin adornos. Hechos y vectores de solución.
