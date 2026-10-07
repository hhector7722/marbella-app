---
documento: RUNBOOK-ALBARANES-MISTRAL
clase: vivo
estado: vigente
capa: ingenieria
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-10-07
caducidad: 3 meses
depende_de: ADR-0023, SEGURIDAD
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
5. Configurar en Vercel las claves del servidor y
   `ALBARAN_AUTO_RECEIPT_MISTRAL=enabled` solo después de comprobar la cola,
   las propuestas y la vista previa. El cron de Supabase despierta el procesador.

## Relectura histórica

`node --env-file=.env.local scripts/albaranes/mistral-historical-replay.mjs`
calcula el límite del periodo desde extracciones y trabajos reales y presenta
un plan por archivo. Con `--enqueue` encola las hojas sin extracción Mistral
correcta de la versión actual. Los trabajos son reanudables y están marcados
como `historical`; no cambian stock, precios, confirmaciones ni el estado OCR
heredado. Guardar los recuentos económicos antes y después del lote y revisar
los errores explícitos. Una extracción correcta del mismo hash y versión se
reutiliza sin llamada OCR. El botón «Reprocesar» usa el mismo
original y la misma protección para un albarán individual.

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

## Retirada del antiguo servicio local

**Estado 2026-10-04:** la función Edge, las RPC y el secreto Docling de
Supabase ya están retirados. Remote Desktop Commander muestra el dispositivo
«Crack» desconectado; la comprobación y retirada del CT 105 siguen pendientes
hasta que vuelva a estar accesible. No cerrar la retirada de infraestructura
sin la lectura final de servicios y procesos.

El despliegue conocido estaba en Proxmox CT 105 `docling-worker` mediante
`docling-serve.service` y `docling-worker.service`, sin Docker en ese CT. Al
recuperar acceso al mini-PC, comprobar primero servicios y contenedores que
usan Docker; no retirar Docker ni recursos de otras aplicaciones. Detener y
deshabilitar los dos servicios Docling, retirar sus unidades de systemd y
verificar que no se reinician. Retirar únicamente la instalación
`/opt/marbella-docling/venv`, los modelos de
`/var/lib/marbella-docling/models` y la configuración de
`/etc/marbella-docling/` después de confirmar que no contienen otro servicio.
Comprobar contenedores, imágenes y volúmenes Docling; eliminar solo los
específicos de esa instalación. Cerrar la tarea con una lectura nueva del
estado de procesos y arranque del CT.

## Excepción de hojas repetidas del histórico

El albarán `978715c5-c372-4543-b93f-4895936007a7` contiene dos pares de
fotografías distintas con contenido OCR idéntico: un par de 32 líneas y otro
de 4. Mistral conservó las cuatro lecturas como evidencia; ninguna de sus 72
propuestas está lista para recepción. Antes de mapear o recibir ese albarán,
reconciliar las hojas originales y seleccionar una sola copia de cada par.
No borrar la evidencia repetida ni asumir que hashes de archivo distintos
significan entregas distintas.
