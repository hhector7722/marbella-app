import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.95.3"

type ClaimPayload = {
  job_id: string
  invoice_id: string
  storage_bucket: string
  storage_path: string
  file_version_hash: string
  extractor_version: string
  correlation_id: string
}

type CompletionPayload = {
  jobId: string
  leaseToken: string
  status: "success" | "no_table" | "failed"
  rawArtifact: unknown
  tables: unknown[] | null
  metrics?: Record<string, unknown>
  error?: string | null
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  })

function timingSafeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left)
  const b = new TextEncoder().encode(right)
  if (a.length !== b.length) return false
  let delta = 0
  for (let index = 0; index < a.length; index += 1) delta |= a[index] ^ b[index]
  return delta === 0
}

function hasWorkerToken(request: Request): boolean {
  const expected = Deno.env.get("DOCLING_WORKER_TOKEN")
  const authorization = request.headers.get("authorization")
  if (!expected || !authorization?.startsWith("Bearer ")) return false
  return timingSafeEqual(authorization.slice("Bearer ".length), expected)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Error inesperado"
}

function isCompletionPayload(value: unknown): value is CompletionPayload {
  if (!value || typeof value !== "object") return false
  const input = value as Record<string, unknown>
  return (
    typeof input.jobId === "string" &&
    typeof input.leaseToken === "string" &&
    (input.status === "success" || input.status === "no_table" || input.status === "failed")
  )
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Método no permitido" }, 405)
  if (!hasWorkerToken(request)) return json({ error: "No autorizado" }, 401)

  const url = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !serviceRoleKey) return json({ error: "Configuración de servidor incompleta" }, 500)

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const action = new URL(request.url).pathname.split("/").filter(Boolean).at(-1)

  try {
    if (action === "claim") {
      const leaseToken = crypto.randomUUID()
      const { data, error } = await supabase.rpc("claim_docling_evidence_job", {
        p_lease_token: leaseToken,
        p_lease_seconds: 900,
      })
      if (error) throw new Error(`claim_docling_evidence_job: ${error.message}`)
      if (!data) return json({ job: null })

      const job = data as ClaimPayload
      const { data: signed, error: signedError } = await supabase.storage
        .from(job.storage_bucket)
        .createSignedUrl(job.storage_path, 600)

      if (signedError || !signed?.signedUrl) {
        const reason = `No se pudo firmar el documento: ${signedError?.message ?? "sin URL"}`
        const { error: completeError } = await supabase.rpc("complete_docling_evidence_job", {
          p_job_id: job.job_id,
          p_lease_token: leaseToken,
          p_evidence_extraction_id: null,
          p_succeeded: false,
          p_metrics: { stage: "sign_url" },
          p_error: reason,
        })
        if (completeError) throw new Error(`complete_docling_evidence_job: ${completeError.message}`)
        return json({ job: null })
      }

      return json({
        job: {
          id: job.job_id,
          leaseToken,
          invoiceId: job.invoice_id,
          documentUrl: signed.signedUrl,
          fileVersionHash: job.file_version_hash,
          extractorVersion: job.extractor_version,
          correlationId: job.correlation_id,
        },
      })
    }

    if (action === "complete") {
      const payload = await request.json()
      if (!isCompletionPayload(payload)) return json({ error: "Payload de finalización inválido" }, 400)

      const { data: job, error: jobError } = await supabase
        .from("document_processing_jobs")
        .select("id, invoice_id, file_version_hash, extractor_version, status, lease_token")
        .eq("id", payload.jobId)
        .eq("status", "leased")
        .eq("lease_token", payload.leaseToken)
        .maybeSingle()
      if (jobError) throw new Error(`Carga del job: ${jobError.message}`)
      if (!job) return json({ error: "Job no adquirido o lease caducada" }, 409)

      const metrics = payload.metrics ?? {}
      const failure = payload.status === "failed"
      let evidenceExtractionId: string | null = null

      if (payload.rawArtifact !== undefined) {
        const { data: evidence, error: evidenceError } = await supabase.rpc("persist_document_evidence", {
          p_invoice_id: job.invoice_id,
          p_file_version_hash: job.file_version_hash,
          p_extractor_version: job.extractor_version,
          p_raw_json_artifact: payload.rawArtifact,
          p_status: payload.status,
          p_tables: payload.status === "success" ? payload.tables : null,
        })
        if (evidenceError) throw new Error(`persist_document_evidence: ${evidenceError.message}`)
        evidenceExtractionId = String((evidence as { extraction_id?: string } | null)?.extraction_id ?? "") || null
      }

      const { error: completionError } = await supabase.rpc("complete_docling_evidence_job", {
        p_job_id: payload.jobId,
        p_lease_token: payload.leaseToken,
        p_evidence_extraction_id: evidenceExtractionId,
        p_succeeded: !failure,
        p_metrics: metrics,
        p_error: payload.error?.slice(0, 5000) ?? null,
      })
      if (completionError) throw new Error(`complete_docling_evidence_job: ${completionError.message}`)

      return json({ ok: true, evidenceExtractionId })
    }

    return json({ error: "Ruta no encontrada" }, 404)
  } catch (error) {
    console.error("docling-evidence-worker", error)
    return json({ error: errorMessage(error) }, 500)
  }
})
