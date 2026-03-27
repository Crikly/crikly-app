# Crikly — Project Overview

**Version:** 1.0
**Last Updated:** March 2026

---

## What Is Crikly?

Crikly is a three-sided sports coaching marketplace at **crikly.app**.

It connects parents and adult players with verified coaches for instant booking and secure payment. Starting with cricket in the UK, expanding to all sports and activities globally.

> "The Airbnb of sports coaching."

---

## The Problem

Finding and booking a sports coach is fragmented, trust is low, and payment is handled informally. There is no single platform that makes it as easy as booking a hotel.

- Parents rely on word of mouth, club noticeboards, Facebook groups
- No centralised platform for discovery or trust verification
- Coaches manage schedules via WhatsApp, collect cash or bank transfers
- No professional tools for coaches to grow their business

---

## The Three Users

| Role | Who | Books |
|---|---|---|
| Parent | Any parent with a child under 16 | Coach sessions for their child |
| Player | Adult 16+, self-managing | Coach sessions for themselves |
| Coach | Verified sports coach | Delivers sessions, gets paid |

Plus a **Super Admin** web panel for platform operators (Lasith).

**Multi-role accounts:** One account can hold multiple roles simultaneously. Role switching via context switcher — Airbnb host/guest model.

---

## Key Product Decisions

| Decision | Choice |
|---|---|
| Phase 1 platform | Web PWA (Next.js) |
| Phase 2 | Flutter mobile app (iOS + Android) |
| Phase 3 | Venue / facility marketplace |
| Starting sport | Cricket (UK) |
| Commission model | 10% added on top of coach price |
| Payout timing | 48hrs after session (admin configurable) |
| Messaging Phase 1 | Flag + email + push (no inbox) |
| Group bookings | Both coach-created AND parent-requested |
| Coach qualifications | Structured list + free text notes |
| Training Passport | Auto-created + coach adds performance report |
| Availability | Weekly template — slots calculated on demand |
| Booking window | Coach sets min advance hours + max advance days |

---

## Revenue Model

| Stream | Default |
|---|---|
| Booking commission | 10% added on top of coach price |
| Premium subscription | £9.99/month or £89.99/year |
| DBS verification fee | £29.99 one-off |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Web App + Admin | Next.js 15 (PWA) |
| Database + Auth | Supabase (PostgreSQL) |
| Payments + Payouts | Stripe Connect |
| Email | Resend |
| Push Notifications | OneSignal |
| Hosting | Vercel |
| Mobile (Phase 2) | Flutter (iOS + Android) |

---

## Key URLs

| Resource | URL |
|---|---|
| Production | https://crikly.app |
| GitHub | github.com/Crikly/crikly-app |
| Supabase | https://gzehxfnlfogkhadejowo.supabase.co |
| Vercel | vercel.com/lasith-projects/crikly-app |
| Notion HQ | https://www.notion.so/32f163fe25cf81e39558d8868da3fc66 |

---

## The Build Journey

```
Step 1 → Database migrations     (real tables in Supabase)
Step 2 → DevOps setup            (CI, branches)
Step 3 → Auth & roles            (sign up, log in, role switching)
Step 4 → Coach module            (first UI design begins)
Step 5 → Parent & Player module  (search, child profiles)
Step 6 → Booking & payments      (highest risk step)
Step 7 → Admin panel             (configuration, governance)
Step 8 → QA, testing & launch    (first real booking)
```

Full task breakdown: see `docs/10_BUILD_PLAN.md`

---

*Crikly Project Overview v1.0 — March 2026*
