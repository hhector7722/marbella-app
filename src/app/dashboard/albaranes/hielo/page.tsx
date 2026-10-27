import { redirect } from 'next/navigation'

// The old standalone page is retired: all purchases live in Albaranes.
export default function LegacyAlbaranPage() {
  redirect('/dashboard/albaranes?scan=1')
}
