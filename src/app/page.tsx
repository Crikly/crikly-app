import Link from 'next/link'

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#F0F7FF',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'DM Sans, sans-serif',
        padding: '24px',
        textAlign: 'center',
      }}
    >
      {/* Logo */}
      <div
        style={{
          fontSize: '32px',
          fontWeight: 700,
          color: '#0F172A',
          letterSpacing: '-0.5px',
          marginBottom: '16px',
        }}
      >
        crik<span style={{ color: '#0077CC' }}>ly</span>
      </div>

      {/* Tagline */}
      <p
        style={{
          fontSize: '20px',
          fontWeight: 500,
          color: '#0F172A',
          marginBottom: '8px',
          maxWidth: '480px',
          lineHeight: 1.3,
          letterSpacing: '-0.3px',
        }}
      >
        Find and book verified cricket coaches near you
      </p>

      {/* Sub */}
      <p
        style={{
          fontSize: '15px',
          color: '#475569',
          marginBottom: '40px',
          maxWidth: '400px',
          lineHeight: 1.6,
        }}
      >
        Instant booking, secure payment, DBS-verified coaches.
        Starting in the UK.
      </p>

      {/* CTA */}
      <Link
        href="/register"
        style={{
          display: 'inline-block',
          background: '#0077CC',
          color: '#fff',
          borderRadius: '10px',
          padding: '16px 32px',
          fontSize: '16px',
          fontWeight: 500,
          textDecoration: 'none',
          marginBottom: '16px',
        }}
      >
        Get started
      </Link>

      {/* Login link */}
      <p style={{ fontSize: '13px', color: '#64748B' }}>
        Already have an account?{' '}
        <Link
          href="/login"
          style={{ color: '#0077CC', fontWeight: 500, textDecoration: 'none' }}
        >
          Log in
        </Link>
      </p>

      {/* Coming soon note */}
      <div
        style={{
          position: 'absolute',
          bottom: '24px',
          fontSize: '11px',
          color: '#94A3B8',
          letterSpacing: '0.3px',
        }}
      >
        Full site coming soon · crikly.app
      </div>
    </main>
  )
}
