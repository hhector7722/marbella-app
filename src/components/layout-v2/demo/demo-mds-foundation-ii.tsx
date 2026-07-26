'use client'

import { useState } from 'react'
import {
  Filter,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
} from 'lucide-react'
import {
  ActionDialog,
  Alert,
  Banner,
  Button,
  CheckboxField,
  ConfirmDialog,
  CurrencyField,
  DataTable,
  DateField,
  DeleteDialog,
  FieldGroup,
  FormDialog,
  InlineMessage,
  List,
  ListActions,
  ListHeader,
  ListItem,
  NumberField,
  PageContent,
  PageHeader,
  SearchBar,
  SearchEmpty,
  SearchInput,
  SearchLoading,
  SearchResults,
  Section,
  SelectField,
  SuccessDialog,
  SwitchField,
  Table,
  TableActions,
  TableBody,
  TableCell,
  TableColumnHeader,
  TableEmpty,
  TableFilters,
  TableHead,
  TableHeader,
  TablePagination,
  TableRow,
  TableSearch,
  TableSelection,
  TableToolbar,
  TextareaField,
  TextField,
  TimeField,
  ToastLayout,
  Toolbar,
  ToolbarActions,
  ToolbarDivider,
  ToolbarFilters,
  ToolbarGroup,
  ToolbarSearch,
  ToolbarSubtitle,
  ToolbarTitle,
  Text,
} from '@/components/mds'

/**
 * Catálogo Foundation Components II (Sprint 6).
 */
export function DemoMdsFoundationII() {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [successOpen, setSuccessOpen] = useState(false)
  const [actionOpen, setActionOpen] = useState(false)

  return (
    <PageContent className="gap-8 border-t border-mds-border pt-8">
      <PageHeader
        title="Foundation Components II"
        description="Segunda capa MDS: Button, Table, Form, Dialog, Notification, Toolbar, Search, List."
      />

      <Section id="mds-buttons" title="Button" description="Único botón de producto. Variantes MDS.">
        <div className="flex flex-wrap gap-2">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="success">Success</Button>
          <Button variant="toolbar">
            <Filter className="size-4" aria-hidden />
            Toolbar
          </Button>
          <Button variant="icon" aria-label="Más">
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
          <Button loading variant="primary">
            Guardando…
          </Button>
        </div>
        <div className="mt-3 max-w-sm">
          <Button variant="mobile">Mobile full width</Button>
        </div>
      </Section>

      <Section id="mds-toolbar" title="Toolbar" description="Chrome de acciones de página/sección.">
        <Toolbar className="rounded-xl border border-mds-border bg-mds-surface p-3 shadow-sm">
          <div className="min-w-0">
            <ToolbarTitle>Catálogo</ToolbarTitle>
            <ToolbarSubtitle>Filtros y acciones</ToolbarSubtitle>
          </div>
          <ToolbarDivider />
          <ToolbarSearch>
            <SearchInput placeholder="Buscar artículo…" />
          </ToolbarSearch>
          <ToolbarFilters>
            <Button variant="toolbar">Hoy</Button>
            <Button variant="toolbar">Semana</Button>
          </ToolbarFilters>
          <ToolbarActions>
            <ToolbarGroup>
              <Button variant="icon" aria-label="Actualizar">
                <RefreshCw className="size-4" aria-hidden />
              </Button>
              <Button variant="primary">
                <Plus className="size-4" aria-hidden />
                Nuevo
              </Button>
            </ToolbarGroup>
          </ToolbarActions>
        </Toolbar>
      </Section>

      <Section id="mds-search" title="Search" description="Input, bar, empty, results, loading.">
        <SearchBar
          actions={
            <Button variant="outline">Buscar</Button>
          }
        >
          <SearchInput placeholder="Café, cerveza…" defaultValue="" />
        </SearchBar>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <SearchResults>
            <div className="px-4 py-3 text-sm font-medium">Cerveza rubia</div>
            <div className="px-4 py-3 text-sm font-medium">Café espresso</div>
          </SearchResults>
          <SearchEmpty />
          <SearchLoading rows={3} />
        </div>
      </Section>

      <Section id="mds-list" title="List" description="Listas táctiles tipo Settings.">
        <List>
          <ListHeader>Operación</ListHeader>
          <ListItem selected>
            Cierre de caja
            <ListActions>
              <Button variant="icon" aria-label="Ajustes">
                <Settings className="size-4" aria-hidden />
              </Button>
            </ListActions>
          </ListItem>
          <ListItem>
            Reservas
            <ListActions>
              <Text variant="caption">3</Text>
            </ListActions>
          </ListItem>
          <ListItem disabled>Inventario (próximamente)</ListItem>
        </List>
      </Section>

      <Section id="mds-table" title="Table" description="Composites sobre Table shadcn.">
        <DataTable
          toolbar={
            <TableToolbar>
              <TableSearch />
              <TableFilters>
                <Button variant="toolbar">Categoría</Button>
              </TableFilters>
              <TableActions>
                <Button variant="outline">Exportar</Button>
              </TableActions>
            </TableToolbar>
          }
          footer={
            <TablePagination page={1} pageCount={4} summary="1–5 de 18" />
          }
        >
          <TableSelection selectedCount={2} onClear={() => undefined}>
            <Button variant="danger">
              <Trash2 className="size-4" aria-hidden />
              Eliminar
            </Button>
          </TableSelection>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <TableColumnHeader title="Nombre" sorted="asc" onSort={() => undefined} />
                </TableHead>
                <TableHead>
                  <TableColumnHeader title="Estado" />
                </TableHead>
                <TableHead className="text-right">
                  <TableColumnHeader title="Importe" className="justify-end" />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Tortilla</TableCell>
                <TableCell>OK</TableCell>
                <TableCell className="text-right tabular-nums">4,50 €</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">AOVE 5L</TableCell>
                <TableCell>Alerta</TableCell>
                <TableCell className="text-right tabular-nums">38,00 €</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <TableEmpty title="Ejemplo vacío (oculto en flujo real)" className="hidden" />
        </DataTable>
      </Section>

      <Section id="mds-form" title="Form" description="Fields oficiales. Input shadcn + nativos MDS.">
        <FieldGroup className="max-w-lg rounded-xl border border-mds-border bg-mds-surface p-4 shadow-sm">
          <TextField label="Nombre" placeholder="Producto" hint="Visible en carta" />
          <NumberField label="Unidades" defaultValue={12} />
          <CurrencyField label="PVP" placeholder="0,00" />
          <DateField label="Fecha" />
          <TimeField label="Hora" />
          <SelectField
            label="Categoría"
            placeholder="Elige…"
            defaultValue=""
            options={[
              { value: 'bebidas', label: 'Bebidas' },
              { value: 'cocina', label: 'Cocina' },
            ]}
          />
          <TextareaField label="Notas" placeholder="Observaciones…" />
          <CheckboxField label="Activo en carta" description="Visible para el personal" defaultChecked />
          <SwitchField label="Destacado" description="Aparece en home" defaultChecked />
          <InlineMessage tone="danger">Ejemplo de FieldError vía InlineMessage</InlineMessage>
        </FieldGroup>
      </Section>

      <Section
        id="mds-dialogs"
        title="Dialog"
        description="Capas sobre Dialog shadcn. Solo presentación."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(true)}>
              Confirm
            </Button>
            <Button variant="danger" onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
            <Button variant="outline" onClick={() => setActionOpen(true)}>
              Action
            </Button>
            <Button variant="primary" onClick={() => setFormOpen(true)}>
              Form
            </Button>
            <Button variant="success" onClick={() => setSuccessOpen(true)}>
              Success
            </Button>
          </div>
        }
      >
        <Text variant="body" muted>
          Abre los diálogos con los botones de la sección.
        </Text>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="¿Cerrar caja?"
          description="Se bloqueará la sesión de caja actual."
          onConfirm={() => setConfirmOpen(false)}
        />
        <DeleteDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title="¿Eliminar albarán #123?"
          description="Esta acción no se puede deshacer."
          onConfirm={() => setDeleteOpen(false)}
        />
        <ActionDialog
          open={actionOpen}
          onOpenChange={setActionOpen}
          title="Acciones rápidas"
          description="Elige una acción."
          actions={
            <>
              <Button variant="outline" onClick={() => setActionOpen(false)}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={() => setActionOpen(false)}>
                Continuar
              </Button>
            </>
          }
        >
          <Text variant="body" muted>
            Contenido libre del ActionDialog.
          </Text>
        </ActionDialog>
        <FormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          title="Nuevo artículo"
          description="Formulario corto de ejemplo."
          onSubmit={() => setFormOpen(false)}
        >
          <TextField label="Nombre" placeholder="Producto" />
          <CurrencyField label="PVP" />
        </FormDialog>
        <SuccessDialog
          open={successOpen}
          onOpenChange={setSuccessOpen}
          title="Guardado"
          description="Los cambios se han aplicado correctamente."
        />
      </Section>

      <Section id="mds-notifications" title="Notification" description="Diseño únicamente. Sin cola de toast.">
        <div className="space-y-3">
          <Banner
            tone="warning"
            title="Turno con descuadre pendiente"
            description="Revisa el cierre antes de salir."
          />
          <Alert
            tone="success"
            title="Sincronizado"
            description="Los fichajes están al día."
          />
          <Alert tone="danger" title="Sin conexión a Supabase" />
          <InlineMessage tone="info">Mensaje inline informativo</InlineMessage>
          <ToastLayout
            tone="success"
            title="Cierre guardado"
            description="Caja del 26/07 sincronizada."
            action={
              <Button variant="ghost" className="min-h-12 px-2 text-xs">
                Ver
              </Button>
            }
          />
        </div>
      </Section>
    </PageContent>
  )
}
