# Vercel Environment Configuration

**Last Updated:** March 2026  
**Owner:** @DevOpsEngineer

---

## Overview

This document lists all environment variables that must be manually configured in the Vercel dashboard for each environment (Production, Preview, Staging).

Vercel automatically handles `NEXT_PUBLIC_APP_URL` via `vercel.json`, but all other variables must be set manually.

---

## How to Set Environment Variables in Vercel

1. Go to your project in the Vercel dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add each variable below for the appropriate environment(s)
4. Click **Save**

**Important:** 
- Variables marked **SECRET** must NEVER be committed to git
- Get actual values from your service dashboards (Supabase, Stripe, etc.)
- Production and Preview/Staging should use different API keys where possible

---

## Environment Variables by Service

### 🔹 Supabase

| Variable | Environment | Type | Where to Get It |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview | Public | Supabase Dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview | Public | Supabase Dashboard → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Production, Preview | **SECRET** | Supabase Dashboard → Project Settings → API |

**Notes:**
- Use your production Supabase project for Production environment
- Consider using a separate Supabase project for Preview/Staging if you want isolated data
- Service role key bypasses RLS — handle with extreme care

---

### 🔹 Stripe

| Variable | Environment | Type | Where to Get It |
|---|---|---|---|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Production, Preview | Public | Stripe Dashboard → Developers → API Keys |
| `STRIPE_SECRET_KEY` | Production, Preview | **SECRET** | Stripe Dashboard → Developers → API Keys |
| `STRIPE_WEBHOOK_SECRET` | Production, Preview | **SECRET** | Stripe Dashboard → Developers → Webhooks |

**Notes:**
- Use **Live** keys for Production
- Use **Test** keys for Preview/Staging
- Webhook secret is generated when you create a webhook endpoint
- Production webhook URL: `https://crikly.app/api/webhooks/stripe`
- Staging webhook URL: `https://staging.crikly.app/api/webhooks/stripe`

---

### 🔹 Email (Resend)

| Variable | Environment | Type | Where to Get It |
|---|---|---|---|
| `RESEND_API_KEY` | Production, Preview | **SECRET** | Resend Dashboard → API Keys |

**Notes:**
- You can use the same API key for both environments or create separate keys
- Recommended: Use separate keys to track email volume per environment

---

### 🔹 Push Notifications (OneSignal)

| Variable | Environment | Type | Where to Get It |
|---|---|---|---|
| `ONESIGNAL_APP_ID` | Production, Preview | Public | OneSignal Dashboard → Settings → Keys & IDs |
| `ONESIGNAL_REST_API_KEY` | Production, Preview | **SECRET** | OneSignal Dashboard → Settings → Keys & IDs |

**Notes:**
- Create separate OneSignal apps for Production and Staging
- This ensures test notifications don't go to production users

---

### 🔹 App Configuration

| Variable | Environment | Type | Value |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Production | Public | `https://crikly.app` |
| `NEXT_PUBLIC_APP_URL` | Preview | Public | `https://staging.crikly.app` |

**Notes:**
- This is automatically set via `vercel.json`
- No manual configuration needed in Vercel dashboard
- Development uses `http://localhost:3000` (set in `.env.local`)

---

## Environment Mapping

### Production Environment
- **Git Branch:** `main`
- **Domain:** `https://crikly.app`
- **Use:** Live keys only (Stripe Live, Production Supabase, etc.)

### Preview Environment (Staging)
- **Git Branch:** `staging`
- **Domain:** `https://staging.crikly.app`
- **Use:** Test keys where possible (Stripe Test, Staging Supabase, etc.)

### Development Environment
- **Git Branch:** `develop` or feature branches
- **Domain:** `http://localhost:3000`
- **Use:** `.env.local` file (never committed to git)

---

## Vercel Dashboard Configuration Checklist

Before deploying to production, ensure:

- [ ] All Supabase variables set for Production
- [ ] All Supabase variables set for Preview
- [ ] Stripe **Live** keys set for Production
- [ ] Stripe **Test** keys set for Preview
- [ ] Resend API key set for both environments
- [ ] OneSignal Production app configured for Production
- [ ] OneSignal Staging app configured for Preview
- [ ] Webhook endpoints created in Stripe for both environments
- [ ] Webhook secrets added to Vercel for both environments
- [ ] All **SECRET** variables are marked as sensitive in Vercel
- [ ] No secrets are exposed in client-side code

---

## Security Reminders

1. **Never commit `.env.local` to git** — it's in `.gitignore` for a reason
2. **Service role keys bypass RLS** — only use in server-side code
3. **Rotate keys immediately** if they are ever exposed
4. **Use different keys** for Production vs Preview/Staging
5. **Stripe webhook secrets** must match the webhook endpoint configuration
6. **Test in Preview first** before deploying to Production

---

## Troubleshooting

### Environment variables not working?
- Check the variable is set for the correct environment (Production vs Preview)
- Redeploy after adding new variables (Vercel requires a redeploy)
- Ensure `NEXT_PUBLIC_` prefix for client-side variables
- Server-only variables should NOT have `NEXT_PUBLIC_` prefix

### Webhook signature verification failing?
- Ensure `STRIPE_WEBHOOK_SECRET` matches the webhook endpoint in Stripe dashboard
- Check the webhook URL is correct for the environment
- Verify the webhook is enabled in Stripe

### Build failing due to missing variables?
- Some variables may be required at build time
- Set them in Vercel even if they're only used at runtime
- Check build logs for specific missing variable errors

---

*For questions or issues, contact @DevOpsEngineer or Lasith*
