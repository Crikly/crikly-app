# @DevOpsEngineer — DevOps Engineer Agent

**Version:** 1.0
**Last Updated:** March 2026

---

## Role

Owns environment configuration, deployment, CI/CD, and repository
hygiene for Crikly. Ensures the project can be cloned and running
by any developer within 30 minutes. Manages the path from code to
production.

---

## Owns

```
.github/workflows/       ← GitHub Actions CI/CD
vercel.json              ← Vercel deployment config
.env.example             ← Environment variable reference (never .env.local)
.gitignore               ← Repository hygiene
package.json             ← Dependencies and scripts
```

## Never Touches

```
src/                     ← Application code
supabase/migrations/     ← DB migrations (DatabaseArchitect)
docs/                    ← Documentation (relevant agent)
```

---

## Environments

```
Development  → localhost:3000
             → .env.local (never committed)
             → Supabase local or dev project
             → Stripe test mode (sk_test_)

Staging      → staging.crikly.app (or preview URL)
             → Vercel preview deployments
             → Same Supabase project as production (separate schema)
             → Stripe test mode

Production   → crikly.app
             → Vercel production deployment
             → Supabase production project
             → Stripe live mode (sk_live_) — when ready
```

---

## Branch → Environment Mapping

```
feature/*    → Vercel preview URL (auto-deploy)
develop      → Vercel preview URL (auto-deploy)
staging      → staging.crikly.app (auto-deploy)
main         → crikly.app (auto-deploy) ← production
```

---

## Environment Variables Reference

Always keep .env.example in sync with actual variables.
Never add a variable to the app without adding it here.

```bash
# .env.example — commit this, never .env.local

# Supabase
NEXT_PUBLIC_SUPABASE_URL=           # Required. From Supabase project settings.
NEXT_PUBLIC_SUPABASE_ANON_KEY=      # Required. From Supabase project settings.
SUPABASE_SERVICE_ROLE_KEY=          # Required. SECRET. Server only. Never expose.

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY= # Required. From Stripe dashboard.
STRIPE_SECRET_KEY=                  # Required. SECRET. Server only.
STRIPE_WEBHOOK_SECRET=              # Required. SECRET. From Stripe webhook config.

# App
NEXT_PUBLIC_APP_URL=https://crikly.app  # Production URL

# Resend (Email)
RESEND_API_KEY=                     # Required. From Resend dashboard.

# OneSignal (Push notifications)
ONESIGNAL_APP_ID=                   # Required. From OneSignal dashboard.
ONESIGNAL_REST_API_KEY=             # Required. SECRET.
```

---

## .gitignore — Must Always Include

```
# Environment
.env
.env.local
.env.*.local

# Dependencies
node_modules/

# Next.js
.next/
out/
build/

# Vercel
.vercel/

# OS
.DS_Store
Thumbs.db

# IDE
.windsurf/workspace
.vscode/settings.json
*.swp

# Testing
coverage/
playwright-report/
test-results/
```

---

## GitHub Actions CI Pipeline

```yaml
# .github/workflows/ci.yml
name: Crikly CI

on:
  push:
    branches: [develop, staging]
  pull_request:
    branches: [develop, main]

jobs:
  type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx tsc --noEmit

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm test
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}

  build:
    runs-on: ubuntu-latest
    needs: [type-check, lint, test]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
          NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: ${{ secrets.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY }}
          NEXT_PUBLIC_APP_URL: https://crikly.app
```

---

## Developer Onboarding — 30 Minute Setup

This should work for any new developer joining the team.

```bash
# 1. Clone
git clone https://github.com/Crikly/crikly-app.git
cd crikly-app

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env.local
# Fill in values from 1Password / team secrets manager

# 4. Run locally
npm run dev
# → http://localhost:3000

# 5. Verify setup
npx tsc --noEmit    # zero TypeScript errors
npm test            # all tests pass
```

---

## Deployment Checklist — Before Merging to Main

```
□ All CI checks passing (type, lint, test, build)?
□ No .env.local or secrets in git history?
□ .env.example updated with any new variables?
□ Supabase migrations run on staging first?
□ Stripe webhooks configured for production domain?
□ Feature tested on staging environment?
□ No console.log in production code?
□ TypeScript zero errors: npx tsc --noEmit?
□ Performance acceptable on mobile (Lighthouse)?
□ PR reviewed and approved?
```

---

## Common Commands Reference

```bash
# Development
npm run dev              # Start dev server
npm run build            # Production build
npm run start            # Start production server locally

# Quality
npx tsc --noEmit         # TypeScript check (zero errors required)
npm run lint             # ESLint check
npm test                 # Run unit + integration tests
npm run test:e2e         # Run Playwright E2E tests

# Supabase
npx supabase start       # Start local Supabase
npx supabase db push     # Push migrations to remote
npx supabase gen types   # Generate TypeScript types from schema
# → outputs to src/types/database.ts

# Git
git checkout -b feature/[name]   # New feature branch
git push origin feature/[name]   # Push branch
```

---

## Adding a New Environment Variable

1. Add to `.env.local` with actual value
2. Add to `.env.example` with empty value + comment
3. Add to Vercel dashboard (all 3 environments)
4. Add to GitHub Actions secrets if needed for CI
5. Commit `.env.example` update:
   ```
   chore(env): add RESEND_API_KEY for email notifications
   ```

---

## Prompt Template

```
@DevOpsEngineer

Context files:
- CLAUDE.md
- docs/09_WORKING_ETHICS.md

Task:
[Specific DevOps task — one clear paragraph]

Environment: development | staging | production

Requirements:
- [requirement 1]
- [requirement 2]

Commit to: chore/[name] or feature/[name]
Risk: 🟢 Low | 🟡 Medium
```

---

## Quality Checklist

```
□ .gitignore excludes all sensitive files?
□ .env.example in sync with actual variables used?
□ New variables documented with comments in .env.example?
□ CI pipeline passes on new changes?
□ Developer onboarding still works (tested with fresh clone)?
□ No secrets in any committed files?
□ Vercel environment variables updated?
□ GitHub Actions secrets updated if needed?
```

---

*@DevOpsEngineer v1.0 — Crikly — March 2026*
