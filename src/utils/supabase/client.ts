import { createBrowserClient } from '@supabase/ssr'

const READ_ONLY_RPCS = new Set([
  'get_cash_closings_summary',
  'get_daily_sales_chart',
  'get_daily_sales_stats',
  'get_financial_statement',
  'get_hourly_sales',
  'get_operational_box_status',
  'get_period_card_payments',
  'get_product_margin_ranking',
  'get_product_sales_ranking',
  'get_ticket_lines',
  'get_ticket_sales_summary',
  'get_tickets_marbella_page',
  'get_treasury_period_summary',
  'get_weekday_ticket_analysis',
])

const QUERY_WRITE_METHODS = new Set(['delete', 'insert', 'upsert', 'update'])
const STORAGE_WRITE_METHODS = new Set([
  'copy',
  'move',
  'remove',
  'update',
  'upload',
  'createSignedUploadUrl',
])
const AUTH_WRITE_METHODS = new Set([
  'enroll',
  'linkIdentity',
  'reauthenticate',
  'resetPasswordForEmail',
  'signInWithPassword',
  'signOut',
  'unlinkIdentity',
  'updateUser',
])

type SandboxWrite = {
  operation: string
  resource?: string
}

function isSandboxRuntime(): boolean {
  return typeof window !== 'undefined' && window.__MARBELLA_SANDBOX__ === true
}

function announceWrite(write: SandboxWrite): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('marbella-sandbox-write', { detail: write }))
}

function simulatedQuery(operation: string, payload?: unknown) {
  let wantsSingle = false
  const payloadItem = Array.isArray(payload) ? payload[0] ?? null : payload ?? null
  const target: Record<string, unknown> = {}
  const proxy: Record<string, unknown> = new Proxy(target, {
    get(_target, property) {
      if (property === 'then') {
        return (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
          const data = operation === 'delete' ? null : wantsSingle ? payloadItem : payloadItem === null ? null : [payloadItem]
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        }
      }
      if (property === 'catch') {
        return (reject: (reason: unknown) => unknown) => Promise.resolve({ data: null, error: null }).catch(reject)
      }
      if (property === 'finally') {
        return (callback: () => void) => Promise.resolve({ data: null, error: null }).finally(callback)
      }
      return () => {
        if (property === 'single' || property === 'maybeSingle') wantsSingle = true
        return proxy
      }
    },
  })

  return proxy
}

function guardQueryBuilder(builder: unknown, resource: string) {
  return new Proxy(builder as object, {
    get(target, property, receiver) {
      if (typeof property === 'string' && QUERY_WRITE_METHODS.has(property)) {
        return (payload: unknown) => {
          announceWrite({ operation: `Supabase ${property}`, resource })
          return simulatedQuery(property, payload)
        }
      }
      return Reflect.get(target, property, receiver)
    },
  })
}

function guardStorage(storage: unknown) {
  return new Proxy(storage as object, {
    get(target, property, receiver) {
      if (property === 'from') {
        return (bucket: string) => {
          const bucketApi = (target as { from: (name: string) => unknown }).from(bucket)
          return new Proxy(bucketApi as object, {
            get(bucketTarget, bucketProperty, bucketReceiver) {
              if (typeof bucketProperty === 'string' && STORAGE_WRITE_METHODS.has(bucketProperty)) {
                return () => {
                  announceWrite({ operation: `Storage ${bucketProperty}`, resource: bucket })
                  return Promise.resolve({ data: null, error: null })
                }
              }
              return Reflect.get(bucketTarget, bucketProperty, bucketReceiver)
            },
          })
        }
      }
      return Reflect.get(target, property, receiver)
    },
  })
}

function guardAuth(auth: unknown) {
  return new Proxy(auth as object, {
    get(target, property, receiver) {
      if (typeof property === 'string' && AUTH_WRITE_METHODS.has(property)) {
        return () => {
          announceWrite({ operation: `Auth ${property}` })
          return Promise.resolve({ data: { user: null }, error: null })
        }
      }
      return Reflect.get(target, property, receiver)
    },
  })
}

function createSandboxClient(client: unknown) {
  return new Proxy(client as object, {
    get(target, property, receiver) {
      if (property === 'from') {
        return (table: string) => {
          const builder = (target as { from: (name: string) => unknown }).from(table)
          return guardQueryBuilder(builder, table)
        }
      }
      if (property === 'rpc') {
        return (fn: string, args?: unknown, options?: unknown) => {
          if (READ_ONLY_RPCS.has(fn)) {
            return (target as { rpc: (name: string, params?: unknown, opts?: unknown) => unknown }).rpc(fn, args, options)
          }
          announceWrite({ operation: 'Supabase rpc', resource: fn })
          return simulatedQuery('rpc', args)
        }
      }
      if (property === 'storage') return guardStorage((target as { storage: unknown }).storage)
      if (property === 'auth') return guardAuth((target as { auth: unknown }).auth)
      if (property === 'functions') {
        announceWrite({ operation: 'Supabase Function', resource: 'functions.invoke' })
        return {
          invoke: () => Promise.resolve({ data: null, error: null }),
        }
      }
      return Reflect.get(target, property, receiver)
    },
  })
}

declare global {
  interface Window {
    __MARBELLA_SANDBOX__?: boolean
  }
}

type BrowserClient = ReturnType<typeof createBrowserClient>

// El cliente de navegador es deliberadamente singleton. Varios componentes usan
// el cliente en dependencias de useEffect; recrearlo en cada render hace que esas
// dependencias cambien y puede relanzar lecturas innecesariamente.
let browserClient: BrowserClient | null = null
let sandboxClient: BrowserClient | null = null

export function createClient(): BrowserClient {
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
  }

  if (!isSandboxRuntime()) return browserClient

  if (!sandboxClient) {
    sandboxClient = createSandboxClient(browserClient) as BrowserClient
  }

  return sandboxClient
}
