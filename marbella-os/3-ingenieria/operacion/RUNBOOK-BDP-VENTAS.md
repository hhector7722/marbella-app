---
documento: RUNBOOK-BDP-VENTAS
clase: vivo
estado: vigente
capa: ingenieria
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-07-29
caducidad: 6 meses
supersede: context/DEPLOY_BDP_VENTAS.txt
---

# RUNBOOK · Despliegue del puente con el punto de venta

Procedimiento para desplegar el extractor y el receptor de ventas y telemetría. Arquitectura en [integraciones/BDP-TPV](../integraciones/BDP-TPV.md).

> **Este despliegue es manual y no es reproducible.** Se copia un archivo a su destino, sin versión desplegada conocida ni forma de volver atrás. Registrado como [D6](../../5-estado/DEUDA.md) y previsto en el [ROADMAP](../../5-estado/ROADMAP.md).

## Archivos fuente
- `integrations/tpv-bridge/index.js` → copiar como `index.js` en el equipo del punto de venta (por ejemplo `C:\Users\Pos\Desktop\AgenteBDP\index.js`)
- `integrations/gateway/server.js` → copiar como `server.js` en la pasarela (`/root/server-receptor/server.js`)

## PC del TPV (PowerShell en carpeta AgenteBDP)

taskkill /F /IM node.exe 2>$null
Start-Sleep -Seconds 2

$env:BDP_GATEWAY_URL = "http://192.168.1.205:3000"

# Primera vez o tras hueco de ventas: catch-up completo
$env:BDP_RUN_CATCHUP = "1"
node index.js
# Esperar: 📦 Catch-up listo: ...

# Operación normal (solo cobros nuevos cada 5s)
# Ctrl+C y luego:
$env:BDP_RUN_CATCHUP = "0"
node index.js

## Gateway Linux (erp-gateway)

cd /root/server-receptor
cp server.js server.js.bak
# pegar context/server.txt como server.js
grep scheduleTicketStock server.js
pm2 restart receptor
pm2 logs receptor --lines 20

## Verificación
- TPV: 🔎 Docs en ventana > 0 | 🔎 A cuenta sin cierre >= 0 | ✅ Venta enviada (tag | A-CUENTA si aplica) | 🔄 Poll: N enviado(s)
- Gateway: [VENTAS] ... | pend=... | dia=YYYY-MM-DD (hoy)
- App: /dashboard/ventas filtro hoy (total = SUM total_documento, incluye a cuenta)

## Tickets a cuenta (Pendiente=1 sin Hora_Cierre)
- VENTAS_WHERE: `(Hora_Cierre IS NOT NULL OR Pendiente = 1)` — no entran mesas abiertas sin pendiente.
- Al cobrar: cambia Documentos_Pagos → firma distinta → re-upsert en Supabase (mismo numero_documento).
- pm2: `pm2 restart PuenteBDP` y `pm2 logs PuenteBDP --lines 30`

## COMPROBANTE (no es venta)
- Indexx genera docs con `Numero_Documento = 'COMPROBANTE'`. Se excluyen en VENTAS_WHERE + `enviarTicket`.
- Gateway `/api/ventas` también los omite. Tras desplegar index.js: reiniciar AgenteBDP.

## Variables opcionales
- BDP_GATEWAY_URL=http://192.168.1.205:3000
- BDP_RUN_CATCHUP=1  (solo recuperación histórica)
- VENTAS_FECHA_MODO=fecha_sistema  (en server .env, default)
