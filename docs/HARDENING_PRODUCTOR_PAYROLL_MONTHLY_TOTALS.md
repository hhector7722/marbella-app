# Hardening del productor `payroll_monthly_totals`

**Fecha:** 2026-07-24  
**Skills:** `gestor-nominas` + `auditor-payroll` + `db-supabase-master`  
**Alcance:** solo productor (webhook + lib + schema). Sin Labor / HE / Shadow / consumidores.

---

## Cambios realizados

| Pieza | Cambio |
|-------|--------|
| `src/lib/payroll/company-summary-parser.ts` | Parser v1 etiquetado (sin `Math.max`) |
| `src/lib/payroll/content-hash.ts` | SHA-256 del PDF |
| `src/lib/payroll/company-summary-parser.test.ts` | 12 tests |
| `src/app/api/webhooks/nominas-summary/route.ts` | Orquestación: hash, validaciones, auditoría, rectificaciones |
| `supabase/migrations/20260724190000_payroll_monthly_totals_hardening.sql` | Columnas + `payroll_import_runs` + RLS |
| Backfill prod may/jun | `content_hash` + `parser_version=1` **sin cambiar** `total_company_cost` |

---

## Nueva arquitectura del productor

```
Gmail/GAS → POST /api/webhooks/nominas-summary
                ↓
         hash SHA-256 (idempotencia)
                ↓
         pdf2json → texto
                ↓
         parseCompanySummaryText (v1)
                ↓
         validaciones / duplicado / rectificación
                ↓
    ┌───────────┴───────────┐
    │                       │
payroll_import_runs    payroll_monthly_totals
 (append-only)          (SSOT coste empresa)
```

---

## Parser

**`parser_version = 1`** (`PAYROLL_SUMMARY_PARSER_VERSION`)

Estrategia:

1. Periodo vía `PAGA TOTAL DEL dd/mm/yyyy AL dd/mm/yyyy`.
2. Localizar `TOTAL EMPRESA` y/ o `TOTAL CENTRO`.
3. Importe europeo **inmediatamente antes y después** de la etiqueta (radio 80 chars).
4. Si antes = después → ese importe.
5. Si solo uno → ese.
6. Si antes ≠ después → **rechazo** (ambigüedad).
7. Si EMPRESA y CENTRO existen con importes distintos → **rechazo**.
8. Preferir EMPRESA si ambos coinciden.
9. **Prohibido** elegir el máximo de una ventana amplia.

---

## Validaciones (antes de escribir SSOT)

- Periodo válido y coherente  
- Exactamente un importe total válido y positivo  
- Sin ambigüedad de etiqueta  
- PDF no duplicado (`content_hash`)  
- Sin rectificación automática (mismo periodo, hash distinto → 409)

Si falla → **no inserta** en `payroll_monthly_totals` + fila en `payroll_import_runs`.

---

## Gestión de duplicados

| Caso | Acción | Status audit |
|------|--------|--------------|
| Mismo `content_hash` ya en SSOT | No reimporta | `skipped_duplicate` |
| Reenvío mismo PDF | Idem | `skipped_duplicate` |

---

## Gestión de rectificaciones

| Caso | Acción | Status |
|------|--------|--------|
| Mismo `period_ym`, `content_hash` distinto | **No sobrescribe**; 409 | `rectification_pending` |
| Legacy sin hash e importe distinto | **No sobrescribe**; 409 | `rectification_pending` |
| Legacy sin hash e importe igual | Backfill hash/version (ok) | `imported` |

Política automática de aplicación de rectificativas: **no implementada** (solo detección + registro), según requisito.

---

## Cobertura de tests

`npm run test:payroll` → **12/12**

- PDF correcto TOTAL CENTRO / EMPRESA  
- Importe mayor cercano **no** asociado → ignorado  
- Importes repetidos coincidentes  
- Antes ≠ después → rechazo  
- Sin TOTAL / sin periodo  
- EMPRESA ≠ CENTRO  
- Hash estable / distinto  

Verificación Storage real:

| Mes | BD | Parser v1 | Match |
|-----|-----|-----------|-------|
| 2026-05 | 12285.92 | 12285.92 | ✅ |
| 2026-06 | 12111.84 | 12111.84 | ✅ |

`/dashboard/labor` no se tocó; sigue leyendo los mismos `total_company_cost`.

---

## Riesgos eliminados

- Heurística `Math.max` en ventana 300 chars  
- Reimportación silenciosa del mismo PDF  
- Sobrescritura ciega ante PDF distinto del mismo mes  
- Ausencia total de auditoría de ingestión  
- Imposibilidad de saber con qué parser se procesó un mes  

---

## Riesgos restantes

- PDF solo imagen (sin texto) → pdf2json falla (sigue siendo dependencia de texto nativo)  
- Cambio radical de layout gestoría (rótulos nuevos) → rechazo (seguro, pero requiere parser v2)  
- Rectificaciones requieren intervención humana (intencional)  
- GAS/Gmail sigue siendo el transportador (sin cron en app)  
- Tipos TS de Supabase aún no regenerados (`content_hash` etc. en runtime sí existen)

---

## Confianza SSOT

**Nivel: Alto**

Justificación: productor único endurecido, importes may/jun reproducidos al céntimo con parser etiquetado, hash + auditoría + no overwrite de rectificaciones. Queda fuera de “Muy alto” mientras el transporte dependa de Gmail/GAS y no haya golden tests binarios en CI con los PDF reales versionados en repo (hoy se verificaron desde Storage).
