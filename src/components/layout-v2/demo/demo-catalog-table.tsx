import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { demoTableRows, type DemoTableRow } from './page-data'

function statusBadge(status: DemoTableRow['status']) {
  switch (status) {
    case 'ok':
      return <Badge className="bg-mds-success/15 text-mds-success">OK</Badge>
    case 'pending':
      return (
        <Badge className="bg-mds-warning/15 text-mds-warning">Pendiente</Badge>
      )
    case 'alert':
      return <Badge className="bg-mds-danger/15 text-mds-danger">Alerta</Badge>
  }
}

export function DemoCatalogTable() {
  return (
    <Card className="border border-mds-border bg-mds-surface ring-0">
      <CardHeader className="border-b border-mds-border">
        <CardTitle className="text-mds-foreground">Catálogo demo</CardTitle>
        <CardDescription>
          Tabla de referencia · tipografía, badges y filas táctiles
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <Table>
          <TableHeader>
            <TableRow className="border-mds-border hover:bg-transparent">
              <TableHead>Producto</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Importe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {demoTableRows.map((row) => (
              <TableRow key={row.id} className="border-mds-border">
                <TableCell className="min-h-12 font-semibold text-mds-foreground">
                  {row.name}
                </TableCell>
                <TableCell className="text-mds-muted">{row.category}</TableCell>
                <TableCell>{statusBadge(row.status)}</TableCell>
                <TableCell className="text-right font-bold tabular-nums text-mds-foreground">
                  {row.amount}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
