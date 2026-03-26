# Crikly — Product Requirements Document

**Version:** 1.0  
**Date:** March 2026  
**Status:** CONFIDENTIAL

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [User Personas](#2-user-personas)
3. [User Journeys](#3-user-journeys)
4. [Feature List](#4-feature-list)
5. [Business Model](#5-business-model)
6. [Notifications Strategy](#6-notifications-strategy)
7. [Technical Architecture](#7-technical-architecture)
8. [Non-Functional Requirements](#8-non-functional-requirements)
9. [Dashboards](#9-dashboards)
10. [Phased Roadmap](#10-phased-roadmap)
11. [Open Items](#11-open-items)
12. [Glossary](#12-glossary)

---

## 1. Introduction

### 1.1 Purpose

This document defines the product requirements for Crikly, a three-sided sports coaching marketplace connecting parents, adult players, coaches, and sports facilities. It serves as the definitive reference for design, development, testing, and stakeholder communication.

### 1.2 Problem Statement

> Finding and booking a sports coach is fragmented, trust is low, and payment is handled informally. There is no single platform that makes it as easy as booking a hotel.

Today, parents and players rely on word of mouth, club noticeboards, and fragmented websites to find coaches. There is no centralised platform for discovery, trust verification, booking, or secure payment. Coaches manage their schedules informally via WhatsApp and collect payment via cash or bank transfer — creating friction for both sides of the transaction.

### 1.3 Vision

Crikly is the Airbnb of sports coaching — a self-service marketplace where any parent or player can instantly find, trust, book, and pay for a verified coach, and where coaches can professionally manage and grow their coaching business.

### 1.4 Scope

| Phase | Scope | Timeline |
|---|---|---|
| Phase 1 | Web App (PWA) — Parent & Player booking, Coach onboarding, Admin panel | MVP Launch |
| Phase 2 | Flutter Mobile App (iOS & Android) | Post-validation |
| Phase 3 | Venue / Facility listings & three-sided marketplace | At scale |

---

## 2. User Personas

### 2.1 Parent

| Attribute | Detail |
|---|---|
| Who | Any parent with a child under 16 interested in sport or activity coaching |
| Current behaviour | Word of mouth, club websites, Facebook groups — no centralised platform |
| Pain points | Hard to find coaches, low trust, awkward cash or bank transfer payments |
| Goal | Find a reliable, verified coach and book effortlessly |
| Books for | Their child (via child profile) |
| Child profiles | Unlimited — one per child |

### 2.2 Player (Adult)

| Attribute | Detail |
|---|---|
| Who | Any individual aged 16+ seeking coaching for themselves |
| Current behaviour | Same fragmented approach as parents |
| Pain points | Same core frustrations — trust, discovery, informal payments |
| Goal | Self-manage their coaching journey independently |
| Books for | Themselves |
| Age gate | Must be 16 or older to register as a Player |

### 2.3 Coach

| Attribute | Detail |
|---|---|
| Who | Verified sports coach offering 1-on-1 or group coaching sessions |
| Current behaviour | Referral-based client acquisition, informal scheduling, cash payments |
| Pain points | No professional tools, no visibility, unreliable payments |
| Goal | Grow client base, get paid reliably, manage schedule professionally |
| Account tiers | Free (default) and Premium (subscription) |
| DBS verification | Optional — paid one-off badge to build parent trust |

### 2.4 Super Admin

| Attribute | Detail |
|---|---|
| Who | Platform operator responsible for configuration and governance |
| Interface | Separate web-based admin panel |
| Access levels | Full Access, User Management, Finance, Content (role-based) |
| Responsibilities | Sports config, business rules, user management, analytics, disputes |

### 2.5 Multi-Role Accounts

A single account can hold multiple roles simultaneously. A parent can also be a player. A coach can also be a parent. Role switching is handled via a context switcher in the app, similar to Airbnb's host/guest mode. Each role maintains its own profile and dashboard independently.

---

## 3. User Journeys

### 3.1 Parent — Booking a Coach

| Step | Action | Notes |
|---|---|---|
| 1 | Land on platform | Web PWA, mobile browser or desktop |
| 2 | Sign up / Log in | Email/password or social login via Supabase Auth |
| 3 | Select role → Parent | Can add more roles later |
| 4 | Create child profile(s) | Unlimited profiles per parent |
| 5 | Search for a coach | Filter by sport, location, price, availability, session type |
| 6 | View coach profile | Bio, qualifications, reviews, rating, pricing, availability |
| 7 | Select session type | 1-on-1 or Group |
| 8 | Select date & time | From coach availability slots |
| 9 | Select child for this booking | Links booking to child profile |
| 10 | Review booking summary | Session details, coach price, platform fee (10%) |
| 11 | Pay securely | Stripe — card payment |
| 12 | Instant confirmation | Coach notified automatically — no approval needed |
| 13 | Session happens | Coach arrives prepared with child profile details |
| 14 | Leave a review | Parent rates and reviews coach post-session |
| 15 | Payout to coach | 48 hours after session completion (admin configurable) |

### 3.2 Player — Booking a Coach

The Player journey mirrors the Parent journey with the following differences:

| Difference | Parent | Player |
|---|---|---|
| Books for | Child (via child profile) | Themselves |
| Profile type | Child profile attached | Own Training Passport used |
| Age gate | None | Must be 16+ at registration |
| Medical notes | On child profile | On own player profile |

### 3.3 Coach — Onboarding

| Step | Action | Notes |
|---|---|---|
| 1 | Sign up / Log in | Single account, add Coach role |
| 2 | Basic profile | Name, photo, bio, location |
| 3 | Professional details | Sport(s) offered, qualifications, certifications |
| 4 | Session setup | Session types, skill levels, max group size per sport |
| 5 | Pricing | Rate per session type and sport |
| 6 | Availability template | Weekly recurring — multiple time blocks per day |
| 7 | Block-out dates | Holidays or personal unavailability |
| 8 | Cancellation policy | Define window: 24 / 48 / 72 hours |
| 9 | Stripe Connect | Bank details for automated payouts |
| 10 | Profile live | Visible in search on Free tier immediately |
| 11 | Optional: DBS verification | Submit certificate — pay one-off £29.99 fee |
| 12 | Optional: Upgrade to Premium | Unlock premium features — £9.99/month or £89.99/year |

### 3.4 Coach — Managing Bookings

| Step | Action | Notes |
|---|---|---|
| 1 | Booking received | Auto-confirmed instantly |
| 2 | Notification sent | Push notification and email |
| 3 | View session details | Date, time, session type, sport |
| 4 | View child/player profile | Full profile including medical notes and Training Passport (if shared) |
| 5 | Message parent/player | Messaging unlocked only after confirmed booking |
| 6 | Cancel if needed | Coach cancels → full refund triggered automatically |
| 7 | Mark session complete | Triggers review request to parent/player |
| 8 | Write performance report | Premium feature — added to player Training Passport |
| 9 | Payout processed | 48 hours after session completion |

### 3.5 Child → Player Transition

When a child profile holder turns 16, the platform initiates an automated transition:

| Step | Detail |
|---|---|
| Detection | Platform detects 16th birthday from DOB on child profile |
| Parent notification | Email and in-app — invited to initiate transition |
| Child invitation | Invite sent to child's email to create their own Player account |
| Parent approval | Parent approves data transfer |
| Passport migration | Full Training Passport migrated to new Player account |
| Data ownership | Parent loses access — player owns their own data (GDPR) |
| Transition window | 30 days to complete before child profile is locked |
| Edge case — existing account | Training Passports merged if child already has an account |
| Edge case — active booking | Transition waits until current booking cycle completes |

---

## 4. Feature List

### 4.1 Child Profile

| Field | Required | Notes |
|---|---|---|
| Full name | Yes | |
| Date of birth | Yes | Used for age gate and transition trigger |
| Sport / Activity | Yes | Multi-select from admin-configured list |
| Skill level | Yes | Beginner, Intermediate, Advanced |
| Medical notes | Yes | Safety critical — visible to all confirmed coaches |
| Notes for coach | No | Parent can add session context |
| Number of profiles | Unlimited | One per child under the parent account |

### 4.2 Training Passport

A portable coaching history attached to every child or player profile. Accumulates automatically with every session booked on the platform.

| Feature | Free | Premium (Coach) |
|---|---|---|
| Basic session history visible to coach | ✓ | ✓ |
| Structured performance reports | ✗ | ✓ |
| Skills progression tracking over time | ✗ | ✓ |
| Coach can add notes to passport | ✗ | ✓ |
| Full coaching history across all coaches | ✗ | ✓ |

**Privacy controls (set by parent/player):**

| Setting | Effect |
|---|---|
| Open | All coaches on platform can view full history |
| Booking only | Only coaches with a confirmed booking can view |
| Private | No history shared — coach sees basic profile only |

### 4.3 Search & Discovery

**Filters:**

| Filter | Type |
|---|---|
| Sport / Activity | Dropdown — admin configured |
| Location | Postcode or city + radius — defaults to parent saved location |
| Date & Time | Date picker |
| Session type | 1-on-1 / Group / Both |
| Skill level | Beginner / Intermediate / Advanced |
| Price range | Min / Max slider |
| Coach gender | Optional preference |
| Minimum rating | Star filter |
| DBS verified only | Toggle filter |

**Sort options:** Nearest first (default), Highest rated, Price low to high, Most available.

Featured coaches appear above organic results. Featured placement is a Premium subscription feature. Admin controls the number of featured slots per search page.

### 4.4 Parent Features

| Feature | Phase 1 | Phase 2 |
|---|---|---|
| Sign up / Log in | ✓ | |
| Create & manage child profiles (unlimited) | ✓ | |
| Search coaches by sport, location, price | ✓ | |
| Filter & sort search results | ✓ | |
| View coach profile | ✓ | |
| Instant booking — 1-on-1 & Group | ✓ | |
| Secure payment via Stripe | ✓ | |
| Booking confirmation & notifications | ✓ | |
| Booking history | ✓ | |
| Cancel booking within cancellation window | ✓ | |
| Refund processing | ✓ | |
| Message coach (post-booking only) | ✓ | |
| Leave review & rating for coach | ✓ | |
| Apply promo codes at checkout | ✓ | |
| Child Training Passport — view | ✓ | |
| Training Passport privacy controls | ✓ | |
| Child to Player transition management | ✓ | |
| Notification preferences | ✓ | |
| Book venue only | | ✓ |
| Book coach + venue bundle | | ✓ |

### 4.5 Player Features

| Feature | Phase 1 | Phase 2 |
|---|---|---|
| Sign up / Log in (16+ age gate) | ✓ | |
| Create & manage own profile | ✓ | |
| Own Training Passport — view | ✓ | |
| Training Passport privacy controls | ✓ | |
| Search & filter coaches | ✓ | |
| Instant booking — 1-on-1 & Group | ✓ | |
| Secure payment via Stripe | ✓ | |
| Booking history | ✓ | |
| Cancel booking within window | ✓ | |
| Message coach (post-booking only) | ✓ | |
| Leave review & rating for coach | ✓ | |
| Apply promo codes | ✓ | |
| Notification preferences | ✓ | |
| Book venue only | | ✓ |

### 4.6 Coach Features — Free Tier

| Feature | Phase 1 | Phase 2 |
|---|---|---|
| Sign up / Log in | ✓ | |
| Create & manage profile | ✓ | |
| List multiple sports / activities | ✓ | |
| Set pricing per sport & session type | ✓ | |
| Weekly availability template (multiple blocks per day) | ✓ | |
| Block out specific dates | ✓ | |
| Define cancellation policy window | ✓ | |
| Auto-confirmed bookings | ✓ | |
| View booking details & child/player profile | ✓ | |
| View child medical notes (safety) | ✓ | |
| Cancel booking — triggers refund | ✓ | |
| Message parent/player (post-booking only) | ✓ | |
| Basic session notes | ✓ | |
| Receive reviews — rating always visible to parents | ✓ | |
| Stripe Connect — automated payouts | ✓ | |
| Payout 48hrs after session (admin configurable) | ✓ | |
| Apply for DBS verified badge (one-off fee) | ✓ | |
| Notification preferences | ✓ | |
| Book venue on platform | | ✓ |

### 4.7 Coach Features — Premium Tier

| Feature | Notes |
|---|---|
| Featured placement in search results | Appears above organic results |
| Structured performance reports | Written after each session |
| Training Passport — view & contribute | Full history + add notes |
| Skills progression tracking | Tracked across all sessions |
| Advanced analytics & earnings insights | Booking trends, retention rates |
| Financial dashboard for tax filing | HMRC-ready annual summary, CSV/PDF export |
| Payout history & commission breakdown | Full transaction log |

### 4.8 Super Admin Features

| Category | Features |
|---|---|
| Admin Users | Create admins, assign permission levels (Full / User Mgmt / Finance / Content) |
| Sports Config | Add, edit, archive sports & activities; skill levels; session types per sport |
| Regions & Currency | Configure countries, currencies, regional commission rates |
| Business Rules | Commission rates, payout schedule, cancellation windows |
| Subscription Engine | Create tiers, toggle features on/off, set usage limits, set pricing per currency |
| Special Tiers | Trial periods, regional tiers, partner tiers, legacy/grandfathered pricing |
| User Management | View all users, approve/reject DBS, suspend/ban accounts |
| Dispute Management | Handle disputes, issue manual refunds |
| Promotions | Create promo codes (% or fixed), expiry, usage limits, scope |
| Featured Coaches | Manually feature coaches in search results |
| Analytics | Revenue, bookings, growth by sport & region, Free to Premium conversion |
| Feature Flags | Toggle any platform feature on/off without deployment |
| Content Management | Static pages, email notification templates, announcements |
| Audit Log | Every admin action logged with user and timestamp |
| Venue Management (Phase 2) | Facility listings, venue onboarding, availability |

---

## 5. Business Model

### 5.1 Revenue Streams

| Stream | Who Pays | Default Value | Configurable |
|---|---|---|---|
| Booking commission | Parent (added on top of coach price) | 10% | Yes — via admin |
| Premium subscription (monthly) | Coach | £9.99 / month | Yes — via admin |
| Premium subscription (annual) | Coach | £89.99 / year (~25% saving) | Yes — via admin |
| DBS verification fee | Coach | £29.99 one-off | Yes — via admin |
| Featured listing | Coach | Included in Premium | Yes — via admin |

### 5.2 Booking Commission — How It Works

> Coach sets price: £60. Parent pays: £60 + 10% = £66. Platform earns: £6. Coach receives: £60 (paid out 48hrs after session).

The coach's price is inclusive of any costs they incur (e.g. venue hire). The platform does not track the internal breakdown of the coach's rate. Stripe's processing fees are deducted from the platform's commission.

### 5.3 Cancellation Policy

| Scenario | Outcome |
|---|---|
| Parent cancels before cancellation window | Full refund to parent |
| Parent cancels within cancellation window | No refund — coach keeps payment |
| Coach cancels at any time | Full refund to parent — coach earns nothing |
| Coach cancels repeatedly | Account flagged for admin review |
| Default cancellation window | 24 hours before session (admin configurable) |

### 5.4 Payout Schedule

| Setting | Default | Configurable |
|---|---|---|
| Payout timing | 48 hours after session completion | Yes — via admin (24hrs, 72hrs, 7 days) |
| Payout method | Stripe Connect — direct to coach bank account | No |
| Payout currency | GBP (Phase 1) — multi-currency Phase 2 | Yes — per country config |

### 5.5 Subscription Tier Engine

Subscription tiers are fully configurable via the admin panel. Each tier can have features toggled on/off or set to a usage limit. New tiers can be created without any development work.

| Feature | Free | Premium |
|---|---|---|
| 1-on-1 sessions | Unlimited | Unlimited |
| Group sessions per month | Configurable (default: 2) | Unlimited |
| Sports listed | Configurable (default: 1) | Unlimited |
| Performance reports | Off | On |
| Training Passport | Off | On |
| Featured in search | Off | On |
| Advanced analytics | Off | On |
| Tax filing dashboard | Off | On |
| Profile photos | Configurable (default: 1) | Unlimited |

---

## 6. Notifications Strategy

### 6.1 Channels

| Channel | Tool | Best For |
|---|---|---|
| Email | Resend | Confirmations, receipts, reports, reminders |
| Push notification | OneSignal | Real-time alerts, session reminders |
| In-app | Built-in | Activity feed, messages, alerts |

### 6.2 Parent / Player Notification Triggers

| Trigger | Email | Push | In-App |
|---|---|---|---|
| Booking confirmed | ✓ | ✓ | ✓ |
| Booking cancelled by coach | ✓ | ✓ | ✓ |
| Refund processed | ✓ | ✓ | ✓ |
| Session reminder (24hrs before) | ✓ | ✓ | ✓ |
| New message from coach | ✗ | ✓ | ✓ |
| Performance report available | ✓ | ✓ | ✓ |
| Review reminder (after session) | ✓ | ✓ | ✓ |
| Child transition to player (age 16) | ✓ | ✗ | ✓ |
| Promotional announcements | ✓ | ✓ | ✗ |

### 6.3 Coach Notification Triggers

| Trigger | Email | Push | In-App |
|---|---|---|---|
| New booking received | ✓ | ✓ | ✓ |
| Booking cancelled by parent/player | ✓ | ✓ | ✓ |
| Session reminder (24hrs before) | ✓ | ✓ | ✓ |
| New message from parent/player | ✗ | ✓ | ✓ |
| Payout processed | ✓ | ✓ | ✓ |
| Payout failed | ✓ | ✓ | ✓ |
| Review received | ✓ | ✓ | ✓ |
| DBS verification approved | ✓ | ✓ | ✓ |
| Subscription renewal reminder | ✓ | ✓ | ✗ |
| Usage limit approaching (Free tier) | ✓ | ✓ | ✓ |
| Platform announcements | ✓ | ✓ | ✗ |

### 6.4 Admin Notification Triggers

| Trigger | Email | In-App |
|---|---|---|
| New DBS verification request | ✓ | ✓ |
| New dispute raised | ✓ | ✓ |
| Failed payout | ✓ | ✓ |
| Flagged account | ✓ | ✓ |
| New coach signup | ✗ | ✓ |

### 6.5 Notification Principles

- Users can manage notification preferences per channel and category
- Admin can toggle notification types globally via feature flags
- Maximum one reminder per event — no spam
- Every notification includes a clear call to action

---

## 7. Technical Architecture

### 7.1 Tech Stack

| Layer | Technology | Phase |
|---|---|---|
| Web App & Admin Panel | Next.js (PWA) | Phase 1 |
| API & Business Logic | Next.js API Routes | Phase 1 |
| Serverless Functions | Supabase Edge Functions | Phase 1 |
| Mobile App | Flutter (iOS & Android) | Phase 2 |
| Database & Authentication | Supabase (PostgreSQL) | Phase 1 |
| File Storage | Supabase Storage | Phase 1 |
| Payments & Payouts | Stripe Connect | Phase 1 |
| Email Notifications | Resend | Phase 1 |
| Push Notifications | OneSignal | Phase 1 |
| Hosting & Deployment | Vercel | Phase 1 |

### 7.2 Backend Architecture

| Layer | Technology | Purpose |
|---|---|---|
| API & Business Logic | Next.js API Routes | Booking creation, payment processing, Stripe webhooks, cancellation & refund logic, notification triggers |
| Serverless Functions | Supabase Edge Functions | Payout scheduling, usage limit checks, Training Passport aggregation |
| Database | Supabase (PostgreSQL) | All data persistence |

Everything deploys as a single unit on Vercel — no separate server to manage. Ideal for solo development with Claude + Windsurf.

### 7.3 Estimated Infrastructure Cost

| Service | Free Tier | Paid Estimate |
|---|---|---|
| Vercel | Free for MVP | ~£15/month at scale |
| Supabase | Free for MVP | ~£20/month at scale |
| Stripe | No monthly fee | 1.4% + 20p per transaction |
| Resend | 3,000 emails/month free | ~£15/month at scale |
| OneSignal | Generous free tier | Free for extended period |
| **Total** | **£0 to launch** | **~£50–£70/month at scale** |

### 7.4 Multi-Currency Architecture

Phase 1 operates in GBP only. The data architecture is designed from day one to support multi-currency and multi-country expansion without structural changes.

| Design Principle | Detail |
|---|---|
| Currency code stored on all prices | Every price record includes ISO currency code (e.g. GBP, LKR, USD) |
| Country code on every user | Enables regional pricing and configuration |
| Region on every coach listing | Enables geographic filtering and commission rules |
| Admin-configurable per country | Adding a new country is a configuration task, not development |

### 7.5 Feature Flags

All platform features are controlled via feature flags manageable in the admin panel. Features can be toggled on or off without a code deployment, enabling gradual rollouts, A/B testing, and rapid response to issues.

### 7.6 Environments

| Environment | Purpose |
|---|---|
| Development | Local development and testing |
| Staging | Pre-release validation — mirrors production |
| Production | Live platform |

---

## 8. Non-Functional Requirements

### 8.1 Security

| Requirement | Detail |
|---|---|
| Authentication | Supabase Auth — email/password and social login |
| Role-based access control | Strict separation between Parent, Player, Coach, Admin roles |
| Data encryption | All data encrypted at rest and in transit (HTTPS/TLS) |
| Payment security | Stripe handles all card data — PCI DSS compliant |
| Child data protection | GDPR and COPPA compliant — enhanced controls for under-16 data |
| Admin audit log | Every admin action logged with user ID and timestamp |
| Session tokens | Auto-expire after period of inactivity |

### 8.2 Performance

| Requirement | Target |
|---|---|
| Page load time (mobile) | Under 3 seconds |
| Search results | Under 2 seconds |
| Booking confirmation | Real-time — under 5 seconds end-to-end |
| Platform uptime | 99.9% — managed by Vercel and Supabase SLAs |
| Image optimisation | Automatic compression on upload |

### 8.3 Scalability

| Requirement | Detail |
|---|---|
| User capacity | Architecture supports 10,000+ users without rewrite |
| Concurrent bookings | No double-booking — real-time slot locking |
| Database | Supabase PostgreSQL — horizontally scalable |
| Multi-country | Region and currency architecture built in from Phase 1 |

### 8.4 Compliance & Legal

| Requirement | Detail |
|---|---|
| GDPR | UK data protection — mandatory for all users |
| COPPA | Enhanced protection for child profiles (under 16) |
| PCI DSS | Payment card security — handled entirely by Stripe |
| Terms & Conditions | Must be accepted before account creation |
| Privacy Policy | Required — managed via admin content panel |
| Cookie Consent | Required for UK/EU users |
| Right to Deletion | Users can delete their account and all associated data |

### 8.5 Compatibility

| Requirement | Detail |
|---|---|
| Desktop browsers | Chrome, Safari, Firefox, Edge (latest 2 versions) |
| Mobile browsers | iOS Safari, Android Chrome |
| PWA | Installable to home screen on iOS and Android |
| Responsive design | Mobile-first — optimised for 320px and above |
| Phase 2 mobile | Flutter — iOS 14+ and Android 8+ |

---

## 9. Dashboards

### 9.1 Super Admin Dashboard

| Section | Metrics & Actions |
|---|---|
| Overview | Total revenue, active coaches (Free vs Premium), total bookings, refunds issued, DBS pending |
| Analytics | Revenue over time, bookings by sport & region, tier distribution, top coaches, retention |
| Alerts | Pending DBS verifications, open disputes, failed payouts, flagged accounts |
| Quick Actions | Approve DBS, resolve dispute, manually refund, feature a coach |

### 9.2 Coach Financial Dashboard (Premium)

| Section | Detail |
|---|---|
| Earnings Overview | Total, gross, net earnings — all-time and by period |
| Pending Payouts | Sessions awaiting 48hr payout window |
| Booking Summary | Completed vs cancelled — 1-on-1 vs Group breakdown |
| Earnings by Sport | Revenue breakdown per sport (multi-sport coaches) |
| Tax Filing — Annual Summary | Financial year summary (UK: April to April — admin configurable) |
| Downloadable Reports | CSV and PDF — HMRC self-assessment ready |
| Commission Breakdown | Platform commission paid — deductible expense for tax purposes |
| Performance Insights | Booking conversion rate, repeat client rate, peak booking times, rating trends |

---

## 10. Phased Roadmap

| Phase | Deliverable | Key Milestone |
|---|---|---|
| Phase 1 — MVP | Next.js PWA web app + Admin panel, Parent & Player booking, Coach onboarding, Stripe payments, Supabase backend | First real booking on platform |
| Phase 2 — Mobile | Flutter mobile app (iOS & Android), Push notifications, App Store & Play Store presence | 1,000 active users |
| Phase 3 — Venues | Facility listings & self-onboarding, Coach can book venues on-platform, Parent can book venues independently, Bundle bookings (coach + venue) | Venues approach platform for listing |

### 10.1 Go-To-Market Strategy

| Stage | Activity |
|---|---|
| Supply first | Recruit 30–50 coaches before launch via direct outreach at cricket clubs and sports events |
| Demand activation | Organic social media, school partnerships, parent Facebook groups |
| Hyper-local density | Achieve liquidity in one city before expanding to next |
| Venue expansion | Once volume exists, venues approach platform — leverage demand to onboard supply |
| Geographic expansion | UK first → Sri Lanka → other markets (multi-currency built in from Phase 1) |

---

## 11. Open Items

| Item | Status | Priority |
|---|---|---|
| Platform name & branding | Placeholder Crikly in use — to be defined | High |
| Specific Free tier usage limits | To be configured in admin at launch (e.g. group session cap) | Medium |
| DBS renewal period | Annual renewal — to be confirmed with legal | Medium |
| Financial year configuration per country | UK April–April default — others configurable | Low |
| Social login providers | Google and Apple — to be confirmed | Medium |
| Dispute resolution process | Manual via admin — detailed SLA to be defined | Medium |
| Coach identity verification beyond DBS | Self-declared credentials for Phase 1 | Low |

---

## 12. Glossary

| Term | Definition |
|---|---|
| Seeker | Generic term for Parent or Player — the person booking a session |
| Provider | Generic term for Coach — the expert delivering the session |
| Venue | A physical facility such as cricket nets, football pitch or sports hall |
| Training Passport | A portable coaching history record attached to every child or player |
| DBS | Disclosure and Barring Service — UK background check for working with children |
| PWA | Progressive Web App — a web app installable to a phone home screen |
| Stripe Connect | Stripe's marketplace payment product enabling automated coach payouts |
| Feature Flag | A toggle to enable or disable a platform feature without code deployment |
| Subscription Engine | Admin-configurable system for creating and managing coach subscription tiers |
| HMRC | His Majesty's Revenue and Customs — UK tax authority |

---

*Crikly PRD v1.0 — March 2026 — CONFIDENTIAL*
