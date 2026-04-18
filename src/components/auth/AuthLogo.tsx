import Link from 'next/link'

export function AuthLogo() {
  return (
    <Link
      href="/"
      style={{
        display: 'inline-block',
        marginBottom: '32px',
      }}
    >
      <img
        src="/logo.jpeg"
        alt="Crikly"
        className="h-8 w-auto object-contain"
      />
    </Link>
  )
}
