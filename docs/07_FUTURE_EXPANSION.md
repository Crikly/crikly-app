# Crikly — Future Expansion

**Version:** 1.0
**Last Updated:** March 2026

Everything in this document is designed in — not bolted on later.
The schema, config, and architecture already support all of this.

---

## Design Principle

> Every sport is a row. Every country is config. Adding either requires zero code changes.

---

## Sport Expansion

| Sport | Market Size UK | Priority | Target Phase |
|---|---|---|---|
| Cricket | £375M | Starting sport | Phase 1 |
| Football | £1B+ | Highest volume | Phase 2 |
| Tennis | £200M | Strong private coaching | Phase 2 |
| Badminton | £100M | Growing | Phase 3 |
| Swimming | £150M | High demand | Phase 3 |
| Tutoring | £2B+ | Beyond sport | Phase 3 |
| Music lessons | £300M | Same model | Future |
| Dance / arts | £200M | Same model | Future |

### How To Add A New Sport

Admin panel → Sports Config → Add Sport → Enter name, slug, icon → Activate.
Zero developer involvement. Zero deployment.

---

## Geographic Expansion

| Country | Currency | Priority | Notes |
|---|---|---|---|
| United Kingdom | GBP | Phase 1 | Launch market |
| Sri Lanka | LKR | Phase 3 | Lasith's network |
| Australia | AUD | Future | Cricket market |
| UAE | AED | Future | Expat community |
| India | INR | Long-term | Massive cricket market |

### How To Add A New Country

Admin panel → Regions & Currency → Add Country → Enter code, name, currency, commission rate → Activate.
Zero developer involvement. Zero deployment.

### What Changes Per Country

- Currency code (GBP, LKR, AUD)
- Commission rate (may differ by market)
- Payout delay (may differ by banking)
- Tax year start (UK = April)
- Qualification types (local coaching bodies)
- DBS equivalent (local background check)

---

## Phase 2 — Mobile App

Flutter app built on top of the same Supabase + Stripe backend.

**New in Phase 2:**
- Full in-app messaging inbox (conversations + messages tables)
- SMS notifications via Twilio
- App Store + Play Store presence
- Mobile push notifications

**No backend rewrites needed.** Flutter connects to same APIs.

---

## Phase 3 — Venue Integration

Once coach + parent volume exists, venues will approach the platform.

**The four booking scenarios:**

| Scenario | Who Books | What |
|---|---|---|
| 1 | Parent | Coach only |
| 2 | Parent | Coach + Venue bundle |
| 3 | Parent | Venue only |
| 4 | Coach | Venue only (for their sessions) |

**New tables needed for Phase 3:**

```sql
venues                    → Facility name, location, sport types, photos
venue_availability        → Weekly template (same pattern as coach)
venue_bookings            → Bookings for venue slots
venue_bundle_bookings     → Links a venue booking + coach booking
```

All other infrastructure (payments, payouts, notifications) reused unchanged.

---

## Notification Channel Expansion

| Channel | Phase | Tool | Status |
|---|---|---|---|
| Email | Phase 1 | Resend | Schema ready |
| Push notifications | Phase 1 | OneSignal | Schema ready |
| SMS | Phase 2 | Twilio | `user_profiles.phone` ready |
| WhatsApp | Phase 3 | Twilio WhatsApp API | `user_profiles.whatsapp_number` ready |

---

## Subscription Tier Expansion

New tiers can be created in the admin panel without any code:

**Potential future tiers:**
- Elite tier (above Premium) — for professional coaches
- Club tier — for cricket clubs managing multiple coaches
- Academy tier — for coaching academies
- Trial tier — free Premium for 30 days on signup

All configurable via admin → Subscription Engine → Create Tier.

---

## Future Feature Ideas

| Feature | Description | Phase |
|---|---|---|
| Video analysis | Coach reviews player videos | Future |
| Group training series | Multi-session packages (8-week courses) | Future |
| School partnerships | Bulk booking for school programmes | Future |
| Club accounts | Cricket clubs manage multiple coaches | Future |
| AI coach matching | Recommend best coach from child profile | Future |
| Progress dashboards | Visual skill progression charts | Future |
| Tournament management | Book coaches for cricket events | Future |
| Referee/umpire booking | Extend beyond coaching | Future |

---

*Crikly Future Expansion v1.0 — March 2026*
*Architecture already supports everything in this document.*
*Adding a sport or country = admin config, not development.*
