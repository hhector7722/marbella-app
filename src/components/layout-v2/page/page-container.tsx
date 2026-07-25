import { cn } from '@/lib/utils'

type PageContainerProps = {
  children: React.ReactNode
  className?: string
}

export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div
      className={cn(
        'mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-4 md:px-6 md:py-6',
        className
      )}
    >
      {children}
    </div>
  )
}
