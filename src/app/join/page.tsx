import type { Metadata } from 'next'
import { JoinPageClient } from './JoinPageClient'

// PUB-03: pre-auth role chooser. Server component so we can read the
// ?role= deep-link param SSR-side and pass initialExpanded down — avoids
// the Suspense fallback → resolved-render flash the useSearchParams
// pattern would otherwise produce on every landing CTA click-through.
// Awaiting searchParams makes this route dynamic, which is the correct
// trade-off for a deep-linkable interactive page.

export const metadata: Metadata = {
  title: 'Join Crikly',
  description: 'Tell us how you want to use Crikly — parent, player, or coach.',
}

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>
}) {
  const params = await searchParams
  const r = params.role
  const initialExpanded = r === 'parent' || r === 'player' ? r : null
  return <JoinPageClient initialExpanded={initialExpanded} />
}
