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
