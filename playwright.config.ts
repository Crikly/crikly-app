import { defineConfig } from '@playwright/test'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// TEST-E2E-01: load .env.local into process.env for local Playwright runs.
// Playwright workers are fresh Node processes that don't inherit Next.js's
// .env.local loading. CI sets these env vars directly via GitHub Secrets and
// the loader is a no-op when NEXT_PUBLIC_SUPABASE_URL is already set.
function loadDotEnvLocal(): void {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) return
  const path = resolve(process.cwd(), '.env.local')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}
loadDotEnvLocal()

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  // TEST-E2E-01: 60s per test gives Next.js dev-mode first-hit compilation
  // room to finish (the production build is much faster — CI uses prebuilt
  // pages in webServer warmup).
  timeout: 60_000,
  // TEST-E2E-01: serial workers — parallel runs starve the single-process
  // dev server's compiler and cause timeouts on first hits.
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60000,
  },
})
