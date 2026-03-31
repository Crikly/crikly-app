# Crikly — UX Principles

**Version:** 1.0
**Last Updated:** March 2026
**Applies to:** Web PWA (Phase 1) + Flutter Mobile (Phase 2)

These principles govern every screen, every interaction, every word in
Crikly. They are non-negotiable. Any new screen or feature must be
reviewed against these before being built.

---

## The Core Emotion

Every design decision must serve one thing: **trust**.

When a parent opens Crikly for the first time, they should feel:
"I can find a good, reliable coach here. This platform looks after my
child. I can rely on this."

When a coach opens Crikly for the first time, they should feel:
"This is a platform I can build my reputation on. This replaces the
WhatsApp chaos. This helps me coach, not manage software."

If a design decision does not serve trust — reconsider it.

---

## Principle 1 — Three Tap Rule

Any core action must be reachable in 3 taps or fewer from home.

- Book a session: Home → Coach profile → Book → 3 taps
- View upcoming bookings: Home → Bookings tab → 2 taps
- Add a child: Home → Profile tab → Add child → 3 taps
- Check earnings (coach): Home → Dashboard tab → 2 taps

If an action requires more than 3 taps, the navigation structure is
wrong — not the user.

---

## Principle 2 — Zero Jargon

Crikly is used by parents who may not be tech-confident and coaches
who are experts at sport, not software.

Never use:
- Technical terms (API, sync, cache, payload)
- Sports admin jargon (fixture, block booking, slot matrix)
- App-specific terms that require learning

Always use:
- Plain English a 12-year-old could understand
- Action-first labels (Book, Cancel, Edit — not Manage, Configure)
- Concrete specifics (Tomorrow at 10am — not Session scheduled)

---

## Principle 3 — Familiar Gestures

| Gesture | Behaviour |
|---|---|
| Tap | Primary action |
| Long press | Secondary options (edit, delete, share) |
| Swipe left | Destructive action — always with confirmation |
| Swipe right | Positive action (confirm, mark complete) |
| Pull to refresh | Reload current screen data |
| Swipe up | Dismiss bottom sheet |

No custom gestures that require learning. Every gesture must match
iOS and Android conventions.

---

## Principle 4 — One Question at a Time

All data entry flows use one question per screen.

- One field, full attention, Continue button
- Progress indicator shown at top (Step 2 of 4)
- Back always available — never trap the user
- Keyboard shown automatically for text fields
- Skip only for genuinely optional fields

Applies to: onboarding, child profile creation, coach profile setup,
booking flow, review submission.

---

## Principle 5 — Every State Has a Design

Every screen must have a defined design for all four states:

**Loading state**
- Skeleton screens (not spinners) for content areas
- Spinner only for actions (button press, form submit)
- Never show an empty screen while loading

**Empty state**
- Always explain why it's empty
- Always give a clear next action
- Example: "No bookings yet — find a coach to get started"
  + Find a coach button

**Error state**
- Human language — never show error codes
- Always tell the user what to do next
- Example: "We couldn't load this page. Check your connection
  and try again." + Retry button

**Success state**
- Confirm clearly what happened
- Tell the user what happens next
- Example: "Booking confirmed. Ravi will be at Oval Cricket Ground
  tomorrow at 10am."

---

## Principle 6 — Mobile First, Desktop Enhanced

Every screen is designed for mobile first (375px minimum width).

Desktop (1024px+) adds:
- Left sidebar navigation replacing bottom tabs
- Wider content columns with more information density
- Hover states on interactive elements
- Keyboard shortcuts for coaches managing availability

Tablet (768px): mobile layout with slightly increased density.

No feature is desktop-only. Everything on mobile is on desktop.

---

## Principle 7 — Trust Signals Are Always Visible

The following must be visible wherever coaches are shown:
- DBS verified badge (if applicable)
- Star rating + review count
- Sessions completed count
- Response time indicator

These are not optional. They are how trust is built before a booking.

---

## Principle 8 — Payments Feel Safe

- Clean, minimal layout — no distractions
- Price breakdown always shown before confirmation
  (coach price + platform fee + total)
- Lock icon visible near payment action
- Stripe branding visible
- No hidden fees, no auto-renewals without clear labelling

---

## Principle 9 — Destructive Actions Require Confirmation

Any action that cannot be undone requires a confirmation step:
- Cancel booking — confirmation with refund amount shown
- Delete child profile — confirmation with data warning
- Remove availability block — confirmation
- Suspend account (admin) — confirmation

Confirmation dialogs use red for destructive CTAs.
Cancel is always available.

---

## Principle 10 — Accessibility is Non-Negotiable

- Minimum touch target: 44×44px on mobile
- Minimum contrast ratio: 4.5:1 body text, 3:1 large text
- All images have alt text
- All interactive elements keyboard accessible (web)
- Screen reader labels on all icon-only buttons
- Never rely on colour alone to convey meaning

---

## Navigation Structure

### Mobile — Bottom Tab Bar (role-specific)

| Role | Tabs |
|---|---|
| Parent | Home · Search · Bookings · Children · Profile |
| Player | Home · Search · Bookings · Passport · Profile |
| Coach | Home · Schedule · Programmes · Bookings · Earnings · Profile |
| Admin | Dashboard · Users · Bookings · Finance · Settings |

### Desktop/Web — Left Sidebar

Same sections as mobile tabs at 240px width.
Collapses to icon-only (64px) on smaller desktops.

---

## Onboarding Flow — Structured (3 Steps)

Every new user completes 3 focused steps after registration:

1. Role confirmed (shown as confirmation screen)
2. Primary sport selection
3. Location (postcode or city)

Then: home screen, personalised.

Coaches have extended onboarding (profile setup) as a separate flow.

---

## Role Switching

- Role switcher in profile tab / sidebar top
- Airbnb host/guest model — one tap to switch
- Active role shown as pill badge on avatar
- Switching role changes tab bar and home screen immediately
- No full reload — state preserved where possible

---

*Crikly UX Principles v1.0 — March 2026*
*Applies to Web (Phase 1) and Mobile (Phase 2).*
*Review before building any new screen.*
