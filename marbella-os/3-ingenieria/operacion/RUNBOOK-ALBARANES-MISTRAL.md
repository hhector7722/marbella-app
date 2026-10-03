---
documento: RUNBOOK-ALBARANES-MISTRAL
clase: vivo
estado: vigente
capa: ingenieria
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-10-03
caducidad: 3 meses
depende_de: ADR-0022, SEGURIDAD
---

# Operación · Mistral y actor técnico de recepción

## Cuándo se usa

Al preparar un entorno nuevo, o si las propuestas de un albarán capturado por
`supervisor` llegan a K4 con `forbidden`. El actor técnico solo actúa en el
delegado interno; nadie debe iniciar sesión con esa cuenta.

## Preparar un entorno nuevo

1. Aplicar las migraciones de Supabase. La tabla privada de actor queda vacía y
   el delegado falla cerrado hasta que se provisiona la identidad.
2. Con `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` del entorno en
   `.env.local`, ejecutar `node --env-file=.env.local scripts/albaranes/provision-automation-actor.mjs`.
   El script usa Auth Admin, marca la identidad como actor técnico, no confirma
   el correo y crea un perfil `manager` oculto.
3. Desde una sesión SQL administrativa del mismo proyecto, ejecutar:

```sql
INSERT INTO private.purchase_receipt_automation_actor (profile_id)
SELECT p.id
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE u.email = 'marbella-purchase-automation@marbella.invalid'
  AND u.email_confirmed_at IS NULL
  AND u.raw_app_meta_data->>'marbella_automation_actor' = 'purchase_receipt_v1'
  AND p.role = 'manager'
  AND p.visible_in_plantilla = false
ON CONFLICT (singleton) DO NOTHING;
```

4. Verificar que la tabla de configuración contiene una sola fila, que
   `anon`/`authenticated` no ejecutan `apply_receipt_line_automated` y que una
   vista previa K4 sobre una propuesta real segura devuelve
   `automation_actor_profile_id` y `captured_by_profile_id` distintos.
5. Configurar en Vercel las claves del servidor y los flags
   `ALBARAN_PRIMARY_EXTRACTOR=mistral` y
   `ALBARAN_AUTO_RECEIPT_MISTRAL=enabled` solo después de comprobar la cola, las
   propuestas y la vista previa. El cron de Supabase despierta el procesador.

## Si falla

- Si no aparece la cuenta, repetir el script: es idempotente. No crear un perfil
  humano sustituto ni asignar el correo a una persona.
- Si la vista previa devuelve `forbidden`, comprobar que el marcador Auth, el
  rol `manager`, el correo no confirmado, la visibilidad oculta y la única fila
  de configuración siguen presentes. Confirmar que propuesta y albarán tienen
  el mismo `created_by`.
- Si K4 devuelve `needs_review`, respetar la excepción concreta; la identidad
  técnica no omite los mapeos, las conversiones ni el cálculo económico.
- Ante anomalía económica, desactivar `ALBARAN_AUTO_RECEIPT_MISTRAL`, conservar
  evidencia y trabajos, y revisar las confirmaciones y el registro privado de
  auditoría antes de volver a activar.
