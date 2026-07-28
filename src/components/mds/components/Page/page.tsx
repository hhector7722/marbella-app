import { cn } from '@/lib/utils'
import { Text } from '../Typography'

type PageTitleProps = React.ComponentProps<'h1'>

function PageTitle({ className, ...props }: PageTitleProps) {
  return (
    <Text
      as="h1"
      variant="display"
      data-slot="mds-page-title"
      className={cn('text-lg font-black md:text-xl lg:text-2xl', className)}
      {...props}
    />
  )
}

type PageSubtitleProps = React.ComponentProps<'p'>

function PageSubtitle({ className, ...props }: PageSubtitleProps) {
  return (
    <Text
      as="p"
      variant="body"
      muted
      data-slot="mds-page-subtitle"
      className={cn('mt-0.5 text-xs md:mt-1 md:text-sm', className)}
      {...props}
    />
  )
}

type PageActionsProps = {
  children: React.ReactNode
  className?: string
}

function PageActions({ children, className }: PageActionsProps) {
  return (
    <div
      data-slot="mds-page-actions"
      className={cn(
        'flex shrink-0 flex-wrap items-center justify-end gap-2',
        className
      )}
    >
      {children}
    </div>
  )
}

type PageHeaderProps = {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      data-slot="mds-page-header"
      className={cn(
        'flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3',
        className
      )}
    >
      <div className="min-w-0 flex-1">
        {typeof title === 'string' ? <PageTitle>{title}</PageTitle> : title}
        {description ? (
          typeof description === 'string' ? (
            <PageSubtitle>{description}</PageSubtitle>
          ) : (
            description
          )
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  )
}

type PageContentProps = {
  children: React.ReactNode
  className?: string
}

function PageContent({ children, className }: PageContentProps) {
  return (
    <div
      data-slot="mds-page-content"
      className={cn('flex min-w-0 flex-1 flex-col gap-6', className)}
    >
      {children}
    </div>
  )
}

export {
  PageTitle,
  PageSubtitle,
  PageHeader,
  PageContent,
  PageActions,
}
export type {
  PageTitleProps,
  PageSubtitleProps,
  PageHeaderProps,
  PageContentProps,
  PageActionsProps,
}
