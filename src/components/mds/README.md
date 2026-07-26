# MDS Components (`src/components/mds`)

Capa de componentes del **Marbella Design System**.

## Relación con shadcn

- **shadcn** (`@/components/ui`) = infraestructura (Button base pattern, Input, Table, Dialog, Skeleton, Separator…).
- **MDS** (`@/components/mds`) = lenguaje de marca y composites de producto.

Siempre componer shadcn / nativos con skin MDS. Nunca duplicar primitives ni meter lógica de negocio.

## Import

```ts
import {
  Button,
  Surface,
  Section,
  Metric,
  DataTable,
  TextField,
  ConfirmDialog,
  Alert,
  Toolbar,
  SearchInput,
  List,
  ListItem,
} from '@/components/mds'
```

## Familias

| Familia | Estado | Notas |
|---------|--------|-------|
| Surface, Section, Page, Typography, Metric, EmptyState, Loading, Status | ✅ Sprint 5 | |
| **Button** | ✅ Sprint 6 | Único botón de producto V2 |
| **Table** | ✅ Sprint 6 | Composites sobre Table shadcn |
| **Form** | ✅ Sprint 6 | Input shadcn + select/textarea/checkbox/switch nativos MDS |
| **Dialog** | ✅ Sprint 6 | Confirm / Delete / Action / Form / Success |
| **Notification** | ✅ Sprint 6 | Alert, Banner, InlineMessage, ToastLayout (sin cola) |
| **Toolbar** | ✅ Sprint 6 | |
| **Search** | ✅ Sprint 6 | |
| **List** | ✅ Sprint 6 | |

## Playground

`/dev/app-shell`

1. **Librería MDS** — Sprint 5  
2. **Foundation Components II** — Sprint 6  

## Ejemplos de uso

### Button

```tsx
<Button variant="primary">Guardar</Button>
<Button variant="danger" loading>Eliminando…</Button>
<Button variant="icon" aria-label="Más"><MoreHorizontal /></Button>
<Button variant="mobile">Acción principal</Button>
```

Variantes: `primary` · `secondary` · `ghost` · `outline` · `danger` · `success` · `toolbar` · `mobile` · `icon`.  
Estado: `loading` (prop). Touch ≥ 48px.

### Table

```tsx
<DataTable
  toolbar={
    <TableToolbar>
      <TableSearch />
      <TableFilters>…</TableFilters>
      <TableActions><Button variant="outline">Exportar</Button></TableActions>
    </TableToolbar>
  }
  footer={<TablePagination page={1} pageCount={3} />}
>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>
          <TableColumnHeader title="Nombre" sorted="asc" onSort={…} />
        </TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>…</TableBody>
  </Table>
  <TableEmpty />
  <TableLoading rows={5} />
</DataTable>
```

### Form

```tsx
<FieldGroup>
  <TextField label="Nombre" hint="Visible en carta" error={errors.name} />
  <CurrencyField label="PVP" currencySymbol="€" />
  <DateField label="Fecha" /> {/* valor YYYY-MM-DD string; no new Date(iso) */}
  <SelectField label="Categoría" options={[…]} placeholder="Elige…" />
  <CheckboxField label="Activo" />
  <SwitchField label="Destacado" />
</FieldGroup>
```

También: `NumberField`, `TimeField`, `TextareaField`, `FieldLabel`, `FieldDescription`, `FieldError`, `FieldHint`, `FieldShell`.

### Dialog

```tsx
<ConfirmDialog open={open} onOpenChange={setOpen} title="¿Cerrar caja?" onConfirm={…} />
<DeleteDialog open={…} title="¿Eliminar albarán #123?" onConfirm={…} />
<FormDialog open={…} title="Nuevo" onSubmit={…}><TextField label="Nombre" /></FormDialog>
<SuccessDialog open={…} title="Guardado" />
<ActionDialog open={…} title="Acciones" actions={<>…</>} />
```

### Notification

```tsx
<Alert tone="success" title="Sincronizado" description="…" />
<Banner tone="warning" title="Descuadre pendiente" />
<InlineMessage tone="danger">Campo obligatorio</InlineMessage>
<ToastLayout tone="info" title="Aviso" description="Solo layout; sin sonner." />
```

### Toolbar / Search / List

```tsx
<Toolbar>
  <ToolbarTitle>Catálogo</ToolbarTitle>
  <ToolbarSearch><SearchInput placeholder="Buscar…" /></ToolbarSearch>
  <ToolbarActions><Button variant="primary">Nuevo</Button></ToolbarActions>
</Toolbar>

<List>
  <ListHeader>Operación</ListHeader>
  <ListItem selected>Cierre de caja<ListActions>…</ListActions></ListItem>
</List>
```

## Decisiones Sprint 6

1. **Button MDS** es el botón canónico en V2; shadcn Button queda como infra / legacy.
2. **Table** no sustituye shadcn: composites + re-export de primitives.
3. **Form**: sin checkbox/select/switch/textarea en `ui/` → nativos con skin MDS (sin deps nuevas). Input shadcn para texto/número/fecha/hora/moneda.
4. **ToastLayout** es solo diseño; no hay cola ni integración sonner.
5. **Info** en notificaciones = `mds-secondary` (igual que Status.Info).

## Reglas

- Solo tokens / utilidades `mds-*` (sin hex, sin inline styles).
- Touch ≥ 48px en interactivos.
- Presentational: sin fetch, auth ni Supabase.
- Probar en `/dev/app-shell` antes de producción.
- `PageHeader` layout-v2 ≠ `PageHeader` mds (alias si conviven).

## Adopción en pantallas reales

No montar MDS “a mano” con hex o layouts legacy. Flujo canónico:

1. Registrar ruta en `src/config/v2/registry.ts`
2. Nav en `src/config/navigation/`
3. UI con `@/components/mds`
4. Envolver con `V2PageShell` desde `@/components/layout-v2`

Ver `src/components/layout-v2/README.md` y auditoría del primer slice en `docs/redesign/SPRINT7_VERTICAL_SLICE_AUDIT.md`.
