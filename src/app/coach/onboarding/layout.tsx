export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // BUG-40b: h-full (fill the coach shell's <main>), not h-screen — 100vh
    // here re-asserted the full large-viewport height inside a mobile shell
    // that is now sized with dvh and ends above the bottom nav.
    <div className="h-full overflow-hidden flex">
      {children}
    </div>
  )
}
