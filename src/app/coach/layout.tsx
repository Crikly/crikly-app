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
        colorScheme: 'light',
        minHeight: '100vh'
      }}
    >
      {children}
    </div>
  )
}
