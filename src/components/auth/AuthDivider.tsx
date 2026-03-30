export function AuthDivider() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        margin: '24px 0',
      }}
    >
      <div style={{ flex: 1, height: '1px', background: '#E2E8F0' }} />
      <span
        style={{
          fontSize: '12px',
          color: '#94A3B8',
          whiteSpace: 'nowrap',
          fontFamily: 'DM Sans, sans-serif',
        }}
      >
        or continue with
      </span>
      <div style={{ flex: 1, height: '1px', background: '#E2E8F0' }} />
    </div>
  )
}
