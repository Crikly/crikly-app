import type { Metadata } from 'next'
import { JoinPageClient } from './JoinPageClient'

// PUB-03: pre-auth role chooser. Server component just owns metadata —
// JoinPageClient handles all interactivity. The ?role= URL param landing
// CTAs pass is no-op'd; we kept it on the landing links for analytics
// breadcrumbing.

export const metadata: Metadata = {
  title: 'Join Crikly',
  description: 'Tell us how you want to use Crikly — coach, parent, or player.',
}

export default function JoinPage() {
  return <JoinPageClient />
}
