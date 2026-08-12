# Evidence backfill (piloto)

Pipeline **Evidence-only**. No modifica `purchase_invoices`, líneas, stock ni adjuntos.

## Dry-run del piloto

```bash
node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
  scripts/evidence-backfill/run.ts --dry-run --pilot
```

Equivalente con tsx (si está disponible):

```bash
pnpm dlx tsx scripts/evidence-backfill/run.ts --dry-run --pilot
```

## Write

**Prohibido** hasta autorización explícita. Requiere:

```bash
... --write --i-understand-evidence-only --invoice-id <uuid>
```

## IDs del piloto

`pilot-ids.json` — 15 UUID verificados en BD.
