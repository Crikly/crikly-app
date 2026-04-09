'use client'

export default function CoachLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        fontFamily: "'DM Sans', sans-serif",
        backgroundColor: '#ffffff',
        minHeight: '100vh',
        colorScheme: 'light',
      }}
    >
      {children}
    </div>
  )
}
