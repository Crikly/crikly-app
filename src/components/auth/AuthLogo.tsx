import Link from 'next/link'

export function AuthLogo() {
  return (
    <Link
      href="/"
      style={{
        display: 'inline-block',
        fontSize: '24px',
        fontWeight: 700,
        color: '#0F172A',
        letterSpacing: '-0.5px',
        textDecoration: 'none',
        marginBottom: '32px',
      }}
    >
      crik<span style={{ color: '#0077CC' }}>ly</span>
    </Link>
  )
}
