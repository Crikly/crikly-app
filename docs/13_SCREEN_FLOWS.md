# Crikly — Screen Flows

**Version:** 1.0
**Last Updated:** March 2026
**Status:** Approved
**Applies to:** Web PWA (Phase 1) + Flutter Mobile (Phase 2)

Every user journey mapped. Review before building any screen.

---

## Flow 1 — Registration & Onboarding

**Email registration:**
Landing page
→ Register (full name, email, password)
→ Email verification (check your inbox)
→ Role selection (Parent / Player / Coach)
→ [Player] Date of birth screen (16+ gate)
→ Onboarding Step 1: Sport selection
→ Onboarding Step 2: Location (postcode)
→ Onboarding Step 3: Confirmation ("You're ready")
→ Home screen (role-specific)

**Social auth (Google / Apple):**
Landing page
→ Sign in with Google / Apple → OAuth → callback
→ Role selection (first time only)
→ [Player] Date of birth screen
→ Onboarding Step 1-3
→ Home screen

**Returning user:**
Landing page → Login → Home screen (last active role)

**Forgot password:**
Login → Forgot password → Enter email → Check inbox
→ Reset link → New password → Login

---

## Flow 2 — Parent: Book a Session
Parent home
→ Search / browse coaches
→ Filters: sport, location, price, DBS, rating
→ Coach profile
→ Photos, bio, qualifications, DBS badge, reviews
→ Select session type (individual / group)
→ Select sport
→ Availability picker (date → time slot)
→ Select child profile (or add new child)
→ Booking summary
→ Price breakdown (coach + fee + total)
→ Apply promo code (optional)
→ Payment (Stripe)
→ Booking confirmed
→ Session details + coach contact unlocked
→ Add to calendar option

**Edge cases:**
- Slot taken between selection and payment
  → error, return to availability picker
- Payment fails → retry, try different card
- No availability → "Save coach to be notified"

---

## Flow 3 — Parent: Manage Children
Profile tab → Children → Add child
→ Child name
→ Date of birth
→ Sport (primary)
→ Skill level
→ Medical notes (optional — coach sees on confirmed booking only)
→ Child photo (optional)
→ Done → child profile created

Edit: Profile → Children → tap child → Edit
Passport: Profile → Children → tap child → Passport tab

---

## Flow 4 — Player: Book a Session

Same as Flow 2 except:
- No child profile step
- Booking is for themselves
- Age verified at registration (16+)

---

## Flow 5 — Coach: Profile Setup
Coach home (incomplete profile)
→ Complete profile prompt
→ Profile photo
→ Bio
→ Sports offered (select + pricing per sport)
→ Qualifications (structured list + free text)
→ DBS verification (optional — upload, pay £29.99)
→ Session types (individual / group)
→ Stripe Connect onboarding (bank details)
→ Availability setup (weekly template)
→ Profile live

---

## Flow 6 — Coach: Manage Availability
Schedule tab
→ Weekly template view
→ Tap day → Add availability block
→ Start / end time
→ Session type
→ Repeat (weekly / this week only)
→ Tap existing block → Edit or Delete
→ Block dates
→ Select date(s) → Confirm

---

## Flow 7 — Coach: Receive & Manage Booking
Booking notification (push + email)
→ Bookings tab → Upcoming → Booking detail
→ Session info, parent/player, child name
→ Contact details (unlocked)
→ Add session notes (optional)
→ [After session] Mark as complete
→ Add performance report (Training Passport)
→ Review request sent automatically

**Coach cancels:**
Booking detail → Cancel session
→ Confirmation (parent receives full refund)
→ Reason (optional)
→ Confirmed → parent notified push + email

---

## Flow 8 — Parent: Cancel a Booking
Bookings → Upcoming → Booking detail → Cancel
→ Confirmation screen
→ [Outside window] Full refund shown
→ [Inside window] No refund — coach keeps payment
→ Confirm → cancelled → parent + coach notified

---

## Flow 9 — Role Switching
Profile tab → Role switcher
→ Current role highlighted
→ Tap different role → instant switch
→ Tab bar changes
→ Home reloads for new role

**Add a new role:**
Profile → Add role → role picker
→ [Player] Date of birth confirmation
→ Role added → switch to new role

---

## Flow 10 — Reviews
Post-session notification → "How was your session with [coach]?"
→ Review screen
→ Star rating (1–5)
→ Comment (optional)
→ Submit → Thank you screen

---

## Flow 11 — Admin: DBS Verification
Admin dashboard → DBS queue → Pending
→ View submission
→ Document preview + coach summary
→ Approve → badge appears immediately
→ Reject → reason required → coach notified

---

## Screen Inventory — Phase 1

### Auth (11 screens)
Landing, Register, Email verification, Login,
Forgot password, Reset password, Role selection,
Date of birth (player), Onboarding Step 1,
Onboarding Step 2, Onboarding Step 3

### Parent (14 screens)
Home, Coach search results, Coach profile,
Availability picker, Booking summary, Payment,
Booking confirmed, Bookings list, Booking detail,
Cancel booking, Children list, Add/edit child,
Child profile + Passport, Profile + settings

### Player (12 screens)
Home, Coach search results, Coach profile,
Availability picker, Booking summary, Payment,
Booking confirmed, Bookings list, Booking detail,
Training Passport, Profile + settings,
Cancel booking

### Coach (13 screens)
Home/dashboard, Schedule, Bookings list,
Booking detail, Session notes/performance report,
Earnings, Profile setup wizard, Profile edit,
DBS verification upload, Stripe Connect onboarding,
Subscription upgrade, Settings, Cancel booking

### Admin (13 screens)
Dashboard, Users list, User detail + suspend,
DBS verification queue, Bookings list,
Dispute management, Revenue overview,
Platform config, Subscription tiers,
Promo codes, Feature flags,
Content pages, Audit log

---

*Crikly Screen Flows v1.0 — March 2026*
*Review against docs/11_UX_PRINCIPLES.md and*
*docs/12_DESIGN_SYSTEM.md before building any screen.*
