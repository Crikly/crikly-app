import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Find a cricket coach — Crikly',
  description:
    'Browse verified cricket coaches near you. Instant booking, secure payment, free cancellation.',
}

export default function CoachesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
