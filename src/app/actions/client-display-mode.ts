'use server'

import { createClient } from '@/utils/supabase/server'
import { z } from 'zod'

const displayModeSchema = z.enum(['standalone', 'browser'])

export async function reportClientDisplayMode(mode: unknown) {
  const parsed = displayModeSchema.safeParse(mode)
  if (!parsed.success) {
    return { error: 'Modo de cliente no válido' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'No autenticado' }
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      last_display_mode: parsed.data,
      last_display_mode_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) {
    console.error('reportClientDisplayMode:', error)
    return { error: error.message }
  }

  return { success: true as const }
}

export type TeamClientInstallRow = {
  user_id: string
  full_name: string | null
  email: string | null
  role: string | null
  last_display_mode: 'standalone' | 'browser' | null
  last_display_mode_at: string | null
  has_push: boolean
}

export async function fetchTeamClientInstallStatus(): Promise<{
  rows: TeamClientInstallRow[]
  error?: string
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { rows: [], error: 'No autenticado' }
  }

  const { data, error } = await supabase.rpc('get_team_client_install_status')

  if (error) {
    console.error('fetchTeamClientInstallStatus:', error)
    return { rows: [], error: error.message }
  }

  return { rows: (data ?? []) as TeamClientInstallRow[] }
}
