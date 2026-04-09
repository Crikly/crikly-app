'use client'

export default function CoachLayout({
  children,
}: {
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div className="min-h-screen bg-white" 
         data-theme="light"
         style={{ colorScheme: 'light' }}>
      {children}
    </div>
  )
}
