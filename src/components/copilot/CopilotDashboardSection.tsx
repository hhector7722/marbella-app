'use client'

import { CopilotChat } from '@/components/copilot/CopilotChat'
import { CopilotVoiceCall } from '@/components/copilot/CopilotVoiceCall'
import { cn } from '@/lib/utils'

export function CopilotDashboardSection() {
  return (
    <section className={cn('w-full max-w-7xl mx-auto px-3 md:px-4 pb-24 pt-6')}>
      <div
        className={cn(
          'rounded-xl border border-zinc-100 bg-white shadow-sm p-4 md:p-6 space-y-4'
        )}
      >
        <h2 className="text-xl font-bold tracking-tight text-zinc-900">
          Copiloto operativo
        </h2>
        <div className={cn('grid grid-cols-1 md:grid-cols-2 gap-6 items-start')}>
          <CopilotChat />
          <CopilotVoiceCall />
        </div>
      </div>
    </section>
  )
}
