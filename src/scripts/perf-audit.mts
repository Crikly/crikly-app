// PERF-AUDIT-01 — throwaway script (NOT committed)
// Measures GET response times for coach API routes against localhost:3000.
// Usage: npx tsx src/scripts/perf-audit.ts
//
// Requires in .env.local:
//   NEXT_PUBLIC_SUPABASE_URL
//   NEXT_PUBLIC_SUPABASE_ANON_KEY
//   PERF_AUDIT_EMAIL
//   PERF_AUDIT_PASSWORD
//   NEXT_PUBLIC_APP_URL (optional, defaults to http://localhost:3000)

import { createServerClient, type CookieMethodsServer } from '@supabase/ssr'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

// ── .env.local parser (minimal — handles KEY=value, strips quotes, ignores #) ──
const envPath = resolve(process.cwd(), '.env.local')
const env: Record<string, string> = {}
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const m = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const EMAIL = env.PERF_AUDIT_EMAIL
const PASSWORD = env.PERF_AUDIT_PASSWORD
const BASE_URL = env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !EMAIL || !PASSWORD) {
  console.error('Missing env. Need: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, PERF_AUDIT_EMAIL, PERF_AUDIT_PASSWORD')
  process.exit(1)
}

// ── Cookie jar populated by @supabase/ssr signIn ──
const cookieJar: Record<string, string> = {}

const cookieMethods: CookieMethodsServer = {
  getAll() {
    return Object.entries(cookieJar).map(([name, value]) => ({ name, value }))
  },
  setAll(cookies) {
    cookies.forEach(({ name, value }) => {
      cookieJar[name] = value
    })
  },
}

const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, { cookies: cookieMethods })

console.log(`→ Signing in as ${EMAIL}...`)
const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
  email: EMAIL,
  password: PASSWORD,
})

if (signInError) {
  console.error('Sign-in failed:', signInError.message)
  process.exit(1)
}

console.log(`✓ Signed in: ${signInData.user?.email} (id=${signInData.user?.id?.slice(0, 8)}…)`)
console.log(`  Cookies set: ${Object.keys(cookieJar).join(', ')}`)

// ── Build Cookie header for fetch ──
const cookieHeader = Object.entries(cookieJar)
  .map(([n, v]) => `${n}=${v}`)
  .join('; ')

// ── Routes to test ──
const ROUTES = [
  '/api/coaches/profile',
  '/api/coaches/sports',
  '/api/coaches/availability',
  '/api/coaches/bookings?tab=upcoming',
  '/api/coaches/bookings?tab=today',
  '/api/coaches/bookings?tab=pending_approval',
  '/api/coaches/bookings?tab=past',
  '/api/coaches/qualifications',
  '/api/coaches/earnings',
  '/api/coaches/programmes',
  '/api/payments/connect/onboard',
  '/api/coaches/notifications',
]

const RUNS = 3

interface RunResult {
  ms: number
  status: number
}
interface RouteResult {
  route: string
  runs: RunResult[]
}

const results: RouteResult[] = []

console.log(`\n→ Running ${RUNS} sequential requests per endpoint against ${BASE_URL}\n`)

for (const route of ROUTES) {
  const runs: RunResult[] = []
  for (let i = 0; i < RUNS; i++) {
    const start = Date.now()
    let status = 0
    try {
      const res = await fetch(`${BASE_URL}${route}`, {
        headers: { cookie: cookieHeader },
        // Avoid keep-alive surprises — match a real browser session shape:
        // cookie auth means no Authorization header needed.
      })
      status = res.status
      // Drain body so server-side timer reflects full completion
      await res.text()
    } catch (err) {
      status = -1
      console.error(`  ${route} run ${i + 1} fetch error:`, (err as Error).message)
    }
    const ms = Date.now() - start
    runs.push({ ms, status })
    process.stdout.write(`  ${route.padEnd(48)} run ${i + 1}: ${String(ms).padStart(5)}ms [${status}]\n`)
  }
  results.push({ route, runs })
}

// ── Compute per-route stats ──
const stats = results.map(r => {
  const allMs = r.runs.map(x => x.ms)
  const cold = r.runs[0]?.ms ?? 0
  const warmRuns = r.runs.slice(1).map(x => x.ms)
  const warmAvg = warmRuns.length > 0
    ? Math.round(warmRuns.reduce((a, b) => a + b, 0) / warmRuns.length)
    : 0
  const min = Math.min(...allMs)
  const max = Math.max(...allMs)
  const avg = Math.round(allMs.reduce((a, b) => a + b, 0) / allMs.length)
  const statuses = [...new Set(r.runs.map(x => x.status))].sort().join(',')
  return { route: r.route, cold, warmAvg, min, max, avg, statuses }
})

// Sort by avg desc (slowest first)
stats.sort((a, b) => b.avg - a.avg)

// ── Render Markdown table ──
const lines: string[] = []
lines.push('')
lines.push('# PERF-AUDIT-01 — Coach API Response Times')
lines.push('')
lines.push(`**Environment:** local dev (\`next dev\`, Turbopack memory-only post FIX-TURBOPACK-CACHE)`)
lines.push(`**Authenticated as:** ${signInData.user?.email}`)
lines.push(`**Runs per endpoint:** ${RUNS} sequential`)
lines.push(`**Timestamp:** ${new Date().toISOString()}`)
lines.push('')
lines.push('Sorted by avg latency (slowest first). Cold = run 1 (includes Turbopack route compile + cache misses). Warm avg = mean of runs 2–3 (steady-state).')
lines.push('')
lines.push('| # | Endpoint | Cold (run 1) | Warm avg | Min | Max | Avg of 3 | Status |')
lines.push('|---|---|---|---|---|---|---|---|')
stats.forEach((s, i) => {
  lines.push(`| ${i + 1} | \`${s.route}\` | ${s.cold}ms | ${s.warmAvg}ms | ${s.min}ms | ${s.max}ms | **${s.avg}ms** | ${s.statuses} |`)
})

const output = lines.join('\n')
console.log(output)

// Also write to /tmp for later diff
const tsLabel = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = `/tmp/perf-audit-${tsLabel}.md`
writeFileSync(outPath, output, 'utf-8')
console.log(`\n→ Saved: ${outPath}`)

// Sign out cleanly
await supabase.auth.signOut().catch(() => { /* ignore */ })
process.exit(0)
