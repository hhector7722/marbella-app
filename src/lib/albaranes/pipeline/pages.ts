export type PageJob = { id: string; status: string }

/** Una recepción solo se intenta cuando todas las hojas declaradas tienen evidencia. */
export function documentPagesReady(input: {
  expectedPages: number
  attachmentCount: number
  jobs: PageJob[]
  currentJobId: string
}): boolean {
  const { expectedPages, attachmentCount, jobs, currentJobId } = input
  if (!Number.isInteger(expectedPages) || expectedPages < 1 || expectedPages > 20) return false
  if (attachmentCount + 1 < expectedPages || jobs.length < expectedPages) return false
  if (!jobs.some((job) => job.id === currentJobId && job.status === 'leased')) return false
  return jobs.every((job) => job.id === currentJobId || job.status === 'completed')
}


export type ExpectedDocumentPage = { attachmentId: string | null; fileHash: string }
export type EvidencePageJob = PageJob & {
  source_attachment_id: string | null
  file_version_hash: string
  extractor_version: string
  replay_mode: string
  evidence_extraction_id: string | null
}
export type VerifiedExtraction = { id: string; file_version_hash: string; status: string }

/** Gate estricto antes de K4: una extracción válida por cada página física,
 * sin aceptar trabajos históricos ni contar un job de otra hoja.
 * null indica que se puede continuar; cualquier código bloquea la recepción.
 */
export function documentPageEvidenceBlockReason(input: {
  expectedPages: number
  pages: ExpectedDocumentPage[]
  jobs: EvidencePageJob[]
  extractions: VerifiedExtraction[]
  currentJobId: string
  currentExtractionId: string
  extractorVersion: string
}): string | null {
  const { expectedPages, pages, jobs, extractions, currentJobId,
    currentExtractionId, extractorVersion } = input
  if (!Number.isInteger(expectedPages) || expectedPages < 1 || expectedPages > 20
    || pages.length !== expectedPages) return 'document_page_count_mismatch'

  const pageIds = new Set<string>()
  let currentMatched = false
  for (const page of pages) {
    const key = page.attachmentId ?? 'main'
    if (pageIds.has(key) || !/^[a-f0-9]{64}$/i.test(page.fileHash)) {
      return 'document_page_identity_invalid'
    }
    pageIds.add(key)
    const matches = jobs.filter((job) => job.replay_mode === 'live'
      && job.extractor_version === extractorVersion
      && (job.source_attachment_id ?? null) === page.attachmentId
      && job.file_version_hash === page.fileHash)
    if (matches.length !== 1) return 'document_page_jobs_missing_or_ambiguous'
    const job = matches[0]!
    const isCurrent = job.id === currentJobId
    if (isCurrent) currentMatched = true
    if (isCurrent ? job.status !== 'leased' : job.status !== 'completed') {
      return 'document_page_job_not_completed'
    }
    const extractionId = isCurrent ? currentExtractionId : job.evidence_extraction_id
    if (!extractionId || !extractions.some((extraction) =>
      extraction.id === extractionId
      && extraction.file_version_hash === page.fileHash
      && extraction.status === 'success')) return 'document_page_extraction_missing'
  }
  if (!currentMatched) return 'document_current_job_missing'
  return null
}
