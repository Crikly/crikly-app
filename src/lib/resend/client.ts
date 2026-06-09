import { Resend } from 'resend'

// Fix-BUILD-02: lazy getter. A module-level `new Resend(process.env.RESEND_API_KEY)`
// (and the top-level throw) ran at import time and crashed `next build` page-data
// collection with "Missing API key" when RESEND_API_KEY is absent (CI build env).
// Instantiate on first call instead; production has the key at runtime. Matches
// the PROD-FIX-01 / Fix-LINT-02 lazy-init pattern.
let _resend: Resend | null = null

export function getResend(): Resend {
  if (_resend) return _resend

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not set')
  }

  _resend = new Resend(apiKey)
  return _resend
}
