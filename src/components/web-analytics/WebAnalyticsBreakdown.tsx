import { formatNumber } from '@/lib/web-analytics/labels'
import {
  EmptyState,
  List,
  ListItem,
  Section,
  Surface,
  Text,
} from '@/components/mds'

type BreakdownSectionProps = {
  title: string
  items: Array<{ label: string; count: number }>
}

function BreakdownSection({ title, items }: BreakdownSectionProps) {
  return (
    <Surface variant="default" className="overflow-hidden p-0">
      <div className="border-b border-mds-border px-4 py-3">
        <Text variant="label">{title}</Text>
      </div>
      {items.length === 0 ? (
        <EmptyState
          variant="compact"
          title="Sin datos"
          description="Todavía no hay registros en este desglose."
          className="border-0 shadow-none"
        />
      ) : (
        <List className="rounded-none border-0 shadow-none">
          {items.map((item) => (
            <ListItem
              key={`${title}-${item.label}`}
              className="min-h-10 gap-2 py-2 text-xs"
            >
              <Text
                as="p"
                variant="body"
                className="min-w-0 flex-1 truncate font-medium"
              >
                {item.label}
              </Text>
              <Text
                as="span"
                variant="body"
                muted
                className="shrink-0 text-xs tabular-nums"
              >
                {formatNumber(item.count)}
              </Text>
            </ListItem>
          ))}
        </List>
      )}
    </Surface>
  )
}

type WebAnalyticsBreakdownProps = {
  topPages: Array<{ label: string; count: number }>
  topReferrers: Array<{ label: string; count: number }>
  topDevices: Array<{ label: string; count: number }>
  topSources: Array<{ label: string; count: number }>
  topLocales: Array<{ label: string; count: number }>
}

export function WebAnalyticsBreakdown({
  topPages,
  topReferrers,
  topDevices,
  topSources,
  topLocales,
}: WebAnalyticsBreakdownProps) {
  return (
    <Section
      id="web-breakdown"
      title="Desgloses"
      description="Ranking por dimensión."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <BreakdownSection title="Páginas más vistas" items={topPages} />
        <BreakdownSection title="Origen del tráfico" items={topReferrers} />
        <BreakdownSection title="Dispositivos" items={topDevices} />
        <BreakdownSection title="UTM source" items={topSources} />
        <BreakdownSection title="Idioma" items={topLocales} />
      </div>
    </Section>
  )
}
