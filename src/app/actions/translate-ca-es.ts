'use server'

import { createClient } from '@/utils/supabase/server'
import { isProbablyCatalan, translateCaToEsIfNeeded } from '@/app/actions/import-legacy'

export async function translateCaToEsTextAction(input: { text: string }): Promise<{
  text: string
  translated: boolean
  warning?: string
}> {
  const raw = String(input?.text ?? '')
  const cleaned = raw.trim()
  if (!cleaned) return { text: '', translated: false }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { text: cleaned, translated: false, warning: 'Usuario no autenticado (no se tradujo).' }
  }

  const { data: profile, error: profErr } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profErr) {
    return { text: cleaned, translated: false, warning: `No se pudo verificar rol (no se tradujo): ${profErr.message}` }
  }
  if (profile?.role !== 'manager') {
    return { text: cleaned, translated: false, warning: 'Sin permisos de manager para traducir.' }
  }

  if (!isProbablyCatalan(cleaned)) {
    return { text: cleaned, translated: false }
  }

  if (!process.env.GEMINI_API_KEY) {
    return { text: cleaned, translated: false, warning: 'Parece catalán, pero falta GEMINI_API_KEY; no se tradujo.' }
  }

  try {
    const out = await translateCaToEsIfNeeded(cleaned)
    const outClean = String(out ?? '').trim() || cleaned
    const changed = outClean !== cleaned
    return { text: outClean, translated: changed }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { text: cleaned, translated: false, warning: `No se pudo traducir (se guarda original): ${msg}` }
  }
}

