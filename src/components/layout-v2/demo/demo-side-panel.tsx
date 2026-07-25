import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { demoSideItems } from './page-data'

export function DemoSidePanel() {
  return (
    <aside className="flex flex-col gap-4">
      <Card className="border border-mds-border bg-mds-surface ring-0">
        <CardHeader>
          <CardTitle className="text-mds-foreground">Cola del día</CardTitle>
          <CardDescription>Card lateral de referencia</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {demoSideItems.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-mds-border bg-mds-muted-surface px-3 py-3"
            >
              <p className="text-sm font-bold text-mds-foreground">{item.title}</p>
              <p className="mt-0.5 text-xs text-mds-muted">{item.subtitle}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border border-mds-border bg-mds-surface ring-0">
        <CardHeader>
          <CardTitle className="text-mds-foreground">Skeleton</CardTitle>
          <CardDescription>Estado de carga</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-12 w-full rounded-xl bg-mds-muted-surface" />
          <Skeleton className="h-4 w-3/4 rounded-md bg-mds-muted-surface" />
          <Skeleton className="h-4 w-1/2 rounded-md bg-mds-muted-surface" />
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant="outline">Outline</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge className="bg-mds-primary text-mds-primary-foreground">
              Primary
            </Badge>
            <Badge className="bg-mds-danger/15 text-mds-danger">Danger</Badge>
          </div>
        </CardContent>
      </Card>
    </aside>
  )
}
