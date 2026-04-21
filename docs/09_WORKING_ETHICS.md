# Crikly — Working Ethics & Collaboration Standards

**Version:** 1.4
**Last Updated:** 21 April 2026
**Changed:** SYNC-10 — Claude Code replaces Windsurf, Claude Design workflow added, browser dialogs rule added
**Maintainer:** Lasith Jayarathne
**Review:** After each phase completion

This file lives in the project root and is referenced at the
start of every Claude Code session. Read it before every prompt.

---

## Collaboration Model

```
LASITH (Product Lead)
  → Owns vision, priorities, and final decisions
  → Brings domain knowledge and business requirements
  → Reviews and approves all outputs before merge
  → Makes product trade-off decisions

CLAUDE (Strategic Partner — this chat)
  → Architecture decisions and design thinking
  → Generating and maintaining project documentation
  → Reviewing approach and trade-off analysis
  → Debugging complex cross-cutting problems
  → Brainstorming solutions before implementation
  → Red flag escalation — stop Claude Code, bring here first

CLAUDE CODE (Coding Agent)
  → Writing all actual code files
  → Following agent role instructions precisely
  → Referencing docs/ folder for context
  → Committing and managing git workflow
  → One task per session, plan shown before coding begins
  → Never proceeds without explicit approval of plan
```

**Rule:** Claude thinks and designs. Claude Code builds.
Never ask Claude Code to make architectural decisions.
Never ask Claude to write production code files.

---

## Session Flow

### Starting Every Claude Code Session

```
Step 1 → Open docs/10_BUILD_PLAN.md
         Find the first ⚪ or 🟡 task
         That is what you work on — no skipping

Step 2 → Identify which agent owns that task

Step 3 → Read the agent file: docs/agents/[agent].md

Step 4 → Send the prompt using the standard template below

Step 5 → Review output before accepting

Step 6 → Commit with correct message format

Step 7 → Mark task ✅ in docs/10_BUILD_PLAN.md

Step 8 → Mark task ✅ in Notion Build Plan (same ID)
         Add notes: what was done, any decisions made

Step 9 → Move to next task
```

### Standard Claude Code Prompt Template

```
@[AgentName]

Task ID: [e.g. M-01, A-03, C-14] ← from docs/10_BUILD_PLAN.md

Context files:
- CLAUDE.md
- docs/09_WORKING_ETHICS.md
- docs/[relevant doc only]
- docs/[relevant doc only]

Task:
[One clear paragraph describing exactly what to build]

File(s) to create or modify:
- src/[exact/file/path.ts]

Requirements:
- [requirement 1]
- [requirement 2]

Must NOT modify:
- [locked file if any]

Business rules to enforce:
- [BR-XX from docs/05_BUSINESS_RULES.md]

On completion:
1. Mark task [ID] ✅ Complete in docs/10_BUILD_PLAN.md
2. Update matching task in Notion Build Plan to ✅ Complete
3. Add a note in Notion: what was done, any decisions made
4. Commit docs/10_BUILD_PLAN.md in the same commit as the code

Commit to: feature/[name] branch
Risk: 🟢 Low | 🟡 Medium | 🔴 High
```

---

## Design Workflow — New UI Screens

For any new screen or major UI component, this order is
mandatory. Never build a new screen without an approved
Claude Design output first.

Step 1  — Claude writes a Claude Design prompt in this chat
Step 2  — Lasith opens Claude Design (new claude.ai
           conversation → click the paintbrush/design icon)
           and pastes the prompt
Step 3  — Claude Design generates the screens as an
           interactive HTML artifact
Step 4  — Lasith reviews and approves (7/10 minimum).
           Feedback shared here. Claude iterates if needed.
Step 5  — Claude validates the design against requirements
Step 6  — Claude writes the Claude Code prompt, including
           the approved HTML as a reference
Step 7  — Lasith pastes the prompt into Claude Code
Step 8  — Claude Code builds the Next.js implementation
Step 9  — Lasith tests in browser, shares screenshot here
Step 10 — Claude reviews, updates Notion + build plan

Rule: Design artifact must be approved before any Claude
      Code prompt is written.
Rule: Copy HTML from the Claude artifact directly when
      needed — the api.anthropic.com/v1/design/ handshake
      URL expires immediately and cannot be used.
Rule: Claude Design replaces Figma Make and v0 entirely.

---

## Context Optimisation — Golden Rules

These rules exist to minimise context window consumption
and maximise the quality of every Claude Code session.

### Rule 1 — Always Load Context Files First
Never assume Claude Code remembers previous sessions.
Every prompt must explicitly reference relevant docs.
A prompt without context files will produce generic output.

### Rule 2 — One Agent, One Task
Do not ask multiple agents to work simultaneously.
Complete one task, commit, then move to the next.
Never combine frontend + backend in one prompt.

### Rule 3 — Be Explicit About File Paths
Always specify exact file paths.
```
❌ "update the coach file"
✅ "update src/app/(coach)/profile/page.tsx"
```

### Rule 4 — Specify the Branch Always
Every prompt must name the target branch.
Default is `feature/[feature-name]`. Never `main`.

### Rule 5 — State What NOT to Touch
Locked files must be explicitly named.
Claude Code must not infer what is safe to modify.

### Rule 6 — One Commit Per Logical Unit
Never bundle unrelated changes in one commit.
Commit message must reference agent and module.

### Rule 7 — Small Scope, High Quality
Break large tasks into small, testable units.
A task that touches more than 3 files needs splitting.
"Build the entire booking flow" → bad prompt.
"Build the BookingConfirmation component" → good prompt.

---

## Context File Loading Strategy

Load only what is relevant to the task.
Loading everything wastes context window.

```
Task type                    → Load these docs
─────────────────────────────────────────────────────────
Any task (always)            → CLAUDE.md + 09_WORKING_ETHICS.md
DB table or migration        → 03_DATABASE_SCHEMA.md
API route or business logic  → 03_DATABASE_SCHEMA.md + 05_BUSINESS_RULES.md
UI component or page         → 02_TECH_ARCHITECTURE.md + docs/12_DESIGN_SYSTEM.md + docs/11_UX_PRINCIPLES.md
Payment or Stripe work       → 05_BUSINESS_RULES.md + 06_SECURITY_COMPLIANCE.md
Security-sensitive feature   → 06_SECURITY_COMPLIANCE.md
New feature (any layer)      → PRD.md (relevant section only)
Architecture decision        → 02_TECH_ARCHITECTURE.md
Testing                      → relevant agent file + implementation file
Multi-country expansion      → 07_FUTURE_EXPANSION.md
```

---

## Design System — Non-Negotiable Rules

All UI work must follow these rules. No exceptions.

**Where design decisions live:**
```
GitHub docs/11_UX_PRINCIPLES.md  → UX rules, gestures, states, navigation, onboarding
GitHub docs/12_DESIGN_SYSTEM.md  → Colours, typography, spacing, component specs
GitHub docs/13_SCREEN_FLOWS.md   → All user journeys and screen inventory
src/components/ui/               → Built components — use these, never rebuild
```

**Rules for every UI task:**
```
→ Read docs/12_DESIGN_SYSTEM.md before writing any UI code
→ Read docs/11_UX_PRINCIPLES.md before designing any screen
→ Use components from src/components/ui/ — never create duplicates
→ New component needed? Add spec to docs/12_DESIGN_SYSTEM.md first
→ No hardcoded hex colours — use Tailwind tokens only (brand-600, teal-50 etc.)
→ No hardcoded sizes — use tokens (radius-md, space-4, h-btn-mobile etc.)
→ Font: DM Sans only — already loaded in layout.tsx, do not re-import
→ Primary colour: brand-600 (#0077CC)
→ Trust signals (DBS badge, rating, sessions count) always visible on coach cards
→ One primary action per screen — never two competing CTAs at equal weight
```

**Figma screenshot rule — mandatory for every v0 prompt:**
```
VIOLATION LOGGED: April 9 2026 — Claude wrote a v0
prompt from memory without referencing approved
Figma screens. This rule was added to prevent recurrence.

Rule: No v0 prompt for any CF task is valid without
the approved Figma Make screenshot attached.

Process — no exceptions:
1. Lasith takes screenshot of approved screen from
   https://fluid-flow-42224954.figma.site
2. Shares screenshot with Claude
3. Claude studies every detail before writing prompt
4. Claude prompt includes "match this design exactly"
5. Screenshot attached in v0.dev alongside prompt
6. v0 output verified against approved design
   before Claude Code implementation

Claude checklist — if any unchecked, STOP:
□ Screenshot received for this specific screen?
□ Every layout detail studied carefully?
□ Prompt references specific visual details?
□ "Match this design exactly" in the prompt?
```

**Sync rule:**
```
GitHub docs/ = single source of truth for all design decisions
Notion       = human-readable mirror — Claude keeps updated
Claude AI    = queries Notion for current state each session
Claude Code  = reads GitHub docs/ before every UI task
```

---

## Prompt Quality Checklist

Before sending any Claude Code prompt, verify:

```
□ Agent role specified (@AgentName)?
□ CLAUDE.md listed in context files?
□ 09_WORKING_ETHICS.md listed in context files?
□ Only relevant docs included (not everything)?
□ Task described in one clear paragraph?
□ Exact file paths specified?
□ Branch specified?
□ Locked files named if relevant?
□ Expected deliverable clear?
□ Risk level assigned?
□ Business rules referenced if payment/booking logic?
□ Security rules referenced if child data or payments?
```

---

## Risk Classification

Every task must have a risk level assigned.

```
🟢 Low Risk
   → Single file change
   → UI components, styling, copy
   → New utility functions
   → Adding tests
   → Documentation updates
   → Auto-proceed: implement directly

🟡 Medium Risk
   → API route changes
   → New database columns (additive only)
   → New business logic
   → Third-party integration changes
   → Review approach first, then implement

🔴 High Risk
   → Database schema restructuring
   → Payment flow changes
   → Authentication changes
   → Cancellation/refund logic
   → Child data handling changes
   → Multi-role account logic
   → STOP → Bring to Claude first → Get explicit approval → Then implement
```

---

## Red Flags — Stop Claude Code, Come to Claude First

Stop Claude Code immediately and bring to Claude if:

```
→ Any change to payment processing logic
→ Any change to cancellation or refund flow
→ Any change to child data access patterns
→ Any change to RLS (Row Level Security) policies
→ Any change to authentication or session handling
→ Stripe webhook handler changes
→ Database migration that modifies existing columns
→ Any change affecting multi-role account switching
→ Business rule changes (commission rates, payout timing)
→ Adding new external dependencies (npm packages)
→ Anything that feels architecturally significant
→ Node.js version is not 20 LTS — check with: node --version
→ API route created as a stub with no wiring task scheduled to follow it
→ reactCompiler: true is present in next.config.ts
```

When in doubt — bring to Claude. It costs nothing.
Fixing a bad architectural decision costs weeks.

---

## Agent Responsibilities — Quick Reference

| Agent | Tag | Use For |
|---|---|---|
| Tech Lead | `@TechLead` | Complex feature analysis, risk assessment, orchestration |
| UI/UX Designer | `@UIUXDesigner` | Screen design, user flows, copy — always first for new UI |
| Frontend Architect | `@FrontendArchitect` | Component hierarchy, state plan — before any frontend build |
| Frontend Developer | `@FrontendDeveloper` | React components, pages, hooks, Tailwind UI |
| Backend Developer | `@BackendDeveloper` | API routes, business logic, server actions |
| Database Architect | `@DatabaseArchitect` | Supabase tables, migrations, RLS policies |
| Payments Engineer | `@PaymentsEngineer` | Stripe integration, webhooks, payouts |
| DevOps Engineer | `@DevOpsEngineer` | Vercel config, env vars, CI/CD, deployment |
| QA Engineer | `@QAEngineer` | Unit tests, integration tests, E2E tests |

---

## Standard Prompt Examples

### Database Task
```
@DatabaseArchitect

Context files:
- CLAUDE.md
- docs/09_WORKING_ETHICS.md
- docs/03_DATABASE_SCHEMA.md

Task:
Create the coach_profiles table migration. Coaches need a profile
separate from their user account that stores professional information,
sport offerings, location, and availability settings.

File: supabase/migrations/[timestamp]_create_coach_profiles.sql

Requirements:
- UUID primary key
- References auth.users
- Fields: bio, location, years_experience, stripe_account_id
- RLS: coaches can only read/write their own profile
- Soft delete using deleted_at

Must NOT modify: any existing migration files

Update docs/03_DATABASE_SCHEMA.md with the new table definition.

Commit to: feature/coach-onboarding
Risk: 🟡 Medium
```

### API Route Task
```
@BackendDeveloper

Context files:
- CLAUDE.md
- docs/09_WORKING_ETHICS.md
- docs/05_BUSINESS_RULES.md

Task:
Create the POST /api/bookings endpoint. When a parent selects a coach,
date, time and completes payment, this endpoint creates the booking
record and triggers the confirmation notification.

File: src/app/api/bookings/route.ts

Requirements:
- Validate parent is authenticated
- Validate coach slot is still available (prevent double booking)
- Create payment intent with Stripe before confirming booking
- Apply 10% commission using BR-01
- Return booking confirmation with reference number

Must NOT modify: src/app/api/payments/webhooks/stripe/route.ts

Business rules: BR-01 (commission), BR-06 (auto-confirm), BR-07 (messaging)

Commit to: feature/booking-flow
Risk: 🔴 High — payment logic involved
```

### Frontend Task
```
@FrontendDeveloper

Context files:
- CLAUDE.md
- docs/09_WORKING_ETHICS.md

Task:
Build the CoachCard component for search results. Each card shows the
coach's photo, name, sport, location, price, rating, and a Book button.
Featured coaches should have a visual badge.

File: src/components/shared/CoachCard.tsx

Requirements:
- Props: coach (CoachProfile type), featured (boolean)
- Show DBS verified badge if coach.dbs_verified is true
- Show featured badge if featured prop is true
- Price displayed as formatted GBP (e.g. £60/hr)
- Rating shows star count + review count
- Book button links to /coach/[id]/book
- Tailwind only — no inline styles
- Mobile first — works on 320px+

Commit to: feature/coach-search
Risk: 🟢 Low
```

### Bug Fix
```
@BackendDeveloper

Context files:
- CLAUDE.md
- docs/09_WORKING_ETHICS.md

Bug:
Parents are being charged the commission twice on group bookings.
The commission calculation is running once in the API route and
once in the Stripe webhook handler.

File: src/app/api/bookings/route.ts

Expected: Commission calculated once, at booking creation
Actual: Commission applied again when webhook confirms payment

Fix: Remove commission calculation from webhook handler.
     Commission must only be calculated in the booking API route.

Test to add: tests/integration/bookings/commission-calculation.test.ts

Commit to: fix/double-commission-charge
Risk: 🔴 High — payment logic
```

---

## Claude Code Optimisation — Getting The Best Results

### Model Selection
Always use Claude Sonnet for Claude Code tasks.
Use Claude Opus only for complex architectural analysis that Sonnet struggles with.
Never use Haiku for production code — output quality is insufficient.

### Session Length Rules
```
Keep each Claude Code session to ONE task (one task ID).
A session that tries to do M-01, M-02, M-03 in one go will degrade.
Context quality drops after ~30 minutes of coding in one session.
If a session goes long → commit what's done → start fresh session for next task.
```

### When Claude Code Goes Off Track
Signs Claude Code is going off track:
- It starts making architectural decisions
- It modifies files not listed in the prompt
- It asks questions instead of following the spec
- Output doesn't match the agent role

What to do:
1. Stop the session immediately
2. Do not accept the output
3. Come to Claude with the problem
4. Get a clearer prompt, then restart Claude Code

### Prompt Repair — When Output Is Wrong
If Claude Code produces wrong output, do NOT try to fix it in the same session.
Instead:
```
1. Reject the output (Ctrl+Z or discard)
2. Identify WHY the prompt was unclear
3. Rewrite the prompt with the missing clarity
4. Start a fresh Claude Code session
```
Trying to correct Claude Code mid-session produces worse results than starting clean.

### Context Window Management
Claude Code has no memory between sessions.
Every session must re-establish context via the context files in the prompt.

```
NEVER assume Claude Code remembers:
→ What was built last session
→ Any decisions made in previous sessions
→ Why something was done a certain way

ALWAYS include in context files:
→ CLAUDE.md (always)
→ docs/09_WORKING_ETHICS.md (always)
→ Only the docs relevant to THIS task
```

Loading too many docs is as bad as loading too few.
A bloated context produces generic, unfocused output.

### Signs A Prompt Needs Improving
```
Bad prompt symptoms:
→ Claude Code asks "what do you want me to do?"
→ Output is generic (not Crikly-specific)
→ Wrong file paths used
→ Claude Code modifies unrelated files
→ Output doesn't match the agent's role

Good prompt characteristics:
→ One task ID from the build plan
→ One agent
→ One paragraph task description
→ Exact file paths
→ Explicit requirements
→ Explicit "must NOT touch" files
→ Risk level assigned
```

---

## Coding Standards

### TypeScript — Non-Negotiable
```typescript
// Strict mode is ON. These apply everywhere:

// ❌ Never
const data: any = response
const user = session!.user

// ✅ Always
const data: BookingResponse = response
if (!session?.user) return null

// ❌ Never — implicit return type
async function createBooking(data) {

// ✅ Always — explicit return type
async function createBooking(data: CreateBookingInput): Promise<Booking> {
```

### Money — Always Integers
```typescript
// ❌ Never store as decimal
const price = 9.99

// ✅ Always store as pence (integer)
const price_pence = 999  // £9.99

// Display formatting
const display = formatCurrency(price_pence) // → "£9.99"
```

### Supabase — Two Clients, Never Mixed
```typescript
// Browser (client components) — respects RLS
import { createClient } from '@/lib/supabase/client'

// Server (API routes, server components) — bypasses RLS
// Use with extreme care — only for admin operations
import { createClient } from '@/lib/supabase/server'
```

### Error Handling
```typescript
// ❌ Never silent
} catch (error) {
  console.log(error)
}

// ✅ Always specific with context
} catch (error) {
  if (error instanceof StripeError) {
    return NextResponse.json(
      { error: 'Payment failed', code: error.code },
      { status: 402 }
    )
  }
  throw new BookingError('Failed to create booking', { cause: error })
}
```

---

## Git Commit Format

```
type(scope): description

Types: feat | fix | chore | docs | refactor | test | style

feat(coach): add availability template setup
fix(payments): prevent double commission on group bookings
chore(deps): update Stripe SDK to v15
docs(schema): add training_passport table v1.2
test(bookings): add cancellation refund flow tests
refactor(auth): simplify multi-role context switcher
```

---

## Branch Lifecycle Rule

Every feature branch must be merged into `develop` before
the next feature branch is started.
Rule: one feature branch active at a time.
Rule: merge to develop before opening the next branch.
Rule: develop is always the source of truth for docs/10_BUILD_PLAN.md.
Rule: never let a feature branch live longer than one build step.

**Why this rule exists:**
In March 2026, feature/auth and chore/design-system were left
unmerged while new work started on develop. This caused:
- docs/10_BUILD_PLAN.md on develop to show stale ⚪ statuses
  for completed tasks (DS-01 to DS-05, A-13 to A-15)
- A merge conflict when the branches were eventually merged
- Duplicate route files surviving because cleanup on feature/auth
  was invisible to develop

**The fix at end of every Claude Code session:**
Before closing Claude Code, always run:
git checkout develop
git merge feature/[current-branch] --no-ff
git push origin develop

Only THEN start the next feature branch.

---

## Quality Gate — Before Any Commit

```
□ Node version is 20 LTS (node --version shows v20.x.x)
□ If this task creates an API route — is it wired to real data, or explicitly marked STUB with a follow-up task in the build plan?
□ next.config.ts does NOT contain reactCompiler: true
□ TypeScript: zero errors (npx tsc --noEmit)
□ No `any` types introduced
□ No console.log in production code
□ Tests written and passing (npm test)
□ Relevant docs updated (schema, API ref, business rules)
□ .env.local not staged (git status check)
□ Committing to correct branch (not main, not staging)
□ Commit message follows convention
□ RLS policies in place for any new DB tables
□ No secrets or keys in code
□ If this task adds or modifies an auth path (email, OAuth, magic link,
  SSO) — verify that user_profiles row is created for the new user
  before marking complete. Auth path is not complete until
  user_profiles creation is confirmed in the database.
```

## UI Standards — Non-Negotiable Rules

### No Browser Dialogs — Ever
window.confirm() and window.alert() are FORBIDDEN in all
UI code. No exceptions.

Confirmations must use inline UI:
- First click: show inline [Cancel] + [Confirm action]
  buttons replacing the original button
- Cancel: gray outlined button, dismisses confirmation
- Confirm: red filled button for destructive actions,
  blue for non-destructive
- Only the affected item shows the confirmation state
- Other items remain interactive

Errors must show inline near the relevant action:
- Small red text below the action area, OR
- Dismissible red banner with × close button
- Never use alert() for errors

This rule was established after Fix-69 (21 April 2026)
when window.confirm() was used in Fix-68 and had to be
fixed immediately.

---

## Auth Path Rule — Non-Negotiable

Every authentication path must create a user_profiles row on
first sign-in. No exceptions.

Paths that must create user_profiles:
- Email + password registration → /api/auth/register
- Google OAuth → /auth/callback
- Apple OAuth → /auth/callback
- Magic link (future) → /auth/callback
- SSO (future) → /auth/callback

How to verify:
1. Sign up via the auth path being tested
2. Open Supabase → Table Editor → user_profiles
3. Confirm row exists with correct auth_user_id and full_name
4. If row missing → task is NOT complete

This rule exists because in April 2026, OAuth users had no
user_profiles rows created, causing all data queries to fail
silently and showing fallback data throughout the app.

## Security Gate — Payments & Child Data

```
□ Read docs/06_SECURITY_COMPLIANCE.md fully
□ Stripe webhook signature verified
□ Idempotency keys on all payment intents
□ No card data touched or logged anywhere
□ Child data access limited to confirmed coaches only
□ RLS policies explicitly tested
□ No SUPABASE_SERVICE_ROLE_KEY in client-side code
□ All user inputs validated server-side
```

---


---

## PRD Traceability — Non-Negotiable Rule

Before any database schema, feature specification, or build plan is considered complete, it must be cross-checked against the PRD systematically.

**The rule:**
> Every feature in PRD.md must map to a table, column, or API route. No exceptions. No assumptions.

**How:**
1. Read PRD.md section by section — not from memory
2. For each feature, verify the corresponding database entry exists
3. Update `docs/03_DATABASE_SCHEMA.md` Section 13 (traceability matrix)
4. Present matrix to Lasith for review before writing any migration

**What happens if a gap is found later:**
- Add the missing column/table via a new migration file
- Never edit existing migration files — always create new ones
- Update docs/03_DATABASE_SCHEMA.md and the traceability matrix
- Update Notion build plan with the new task
- This is normal — it happens in every product. The process handles it cleanly.

**The gap finding process is not a failure. Skipping the cross-check is.**

---

## Notion Maintenance — Exact Workflow

Notion is the living product brain. It must stay current as part of every session.
The rule is simple: **docs/10_BUILD_PLAN.md and Notion must always match.**

---

### Notion Build Plan URL
https://www.notion.so/b288473c2a4f47ebad99bf6bf3f7b041

---

### Every Claude Code Session — Exact Steps

**START of session (before touching any code):**
1. Open `docs/10_BUILD_PLAN.md`
2. Find the first ⚪ Planned or 🟡 In Progress task
3. Mark it 🟡 In Progress in the file
4. Open Notion Build Plan → find the SAME task by its ID (e.g. M-01, A-03)
5. Change Notion status to 🟡 In Progress
6. Only then start coding

**END of session (before closing Claude Code):**
1. Mark completed tasks ✅ Complete in `docs/10_BUILD_PLAN.md`
2. Open Notion Build Plan → find each completed task by ID
3. Change Notion status to ✅ Complete
4. Add notes field in Notion: what was done, any decisions made
5. If blocked → mark 🔴 Blocked in BOTH places with reason
6. Commit all code + doc changes together

---

### Task ID Mapping Rule

Every task in `docs/10_BUILD_PLAN.md` has a unique ID (F-01, D-03, M-07, A-12, etc.)
The same ID must appear in Notion as the Task name prefix.
This is how the two stay in sync — IDs are the shared key.

```
docs/10_BUILD_PLAN.md: | M-01 | Migration 001 — user_profiles | ✅ |
Notion:               | M-01 — Migration 001 — user_profiles | ✅ Complete |
```

---

### What Triggers a Notion Update

| Trigger | What to update in Notion | Urgency |
|---|---|---|
| Task started | Build Plan → 🟡 In Progress | Immediate |
| Task completed | Build Plan → ✅ Complete + add notes | Same session |
| Task blocked | Build Plan → 🔴 Blocked + reason | Immediate |
| Decision made | Decision Log → add new row | Same session |
| New feature idea | Feature Backlog → add row | Same session |
| Milestone hit | Analytics & KPIs → Milestone Log | Same session |
| Architecture change | Team & Development page | Same session |
| New business rule added | Decision Log + note in build plan | Same session |

---

### What Lasith Uses Notion For

Lasith tracks progress in Notion — not in Claude Code or GitHub.
This means:
- Notion is what Lasith opens to check what's been done
- Notion is what Lasith opens to see what's in progress
- Notion is what Lasith opens to raise blockers and questions

If a task is done in Claude Code but not marked in Notion — **it doesn't exist to Lasith.**

---

### Rule
> If it happened, it's in Notion.
> If it's not in Notion, it didn't happen.

---

## Document Maintenance

When completing any task, update relevant docs in same commit:

| Task type | Update this doc |
|---|---|
| New DB table or column | `docs/03_DATABASE_SCHEMA.md` |
| New API route | `docs/04_API_REFERENCE.md` |
| New/changed business rule | `docs/05_BUSINESS_RULES.md` |
| New env variable | `docs/02_TECH_ARCHITECTURE.md` + `.env.example` |
| Feature completed | `docs/10_BUILD_PLAN.md` → mark ✅ + update Notion |
| Architecture decision | `docs/02_TECH_ARCHITECTURE.md` |
| Security change | `docs/06_SECURITY_COMPLIANCE.md` |
| Future expansion impact | `docs/07_FUTURE_EXPANSION.md` |

Doc version format:
```markdown
**Version:** 1.2
**Last Updated:** March 2026
**Changed:** Added training_passport table in Section 4
```

---

## Process Lessons

These lessons were learned during development and validation sessions.
They document specific failures and the rules created to prevent recurrence.

---

### L-04 — Claude must always read current sources before summarising

**What happened:** Claude gave repeated incomplete and wrong status
summaries in a session — missed completed sprints, dropped the
Programmes module, gave stale task counts.

**Root cause:** Claude read the stale project knowledge file
(docs/10_BUILD_PLAN.md v2.0 from March 2026) instead of the actual
current source. Project knowledge attached to the chat was 2 versions
behind the develop branch.

**Rule:** Claude must always verify against Notion or the document
explicitly shared in the current conversation before giving any plan
or status summary. If project knowledge appears stale (version mismatch
or date mismatch), flag it immediately and do not use it as a source.
Never summarise from memory.

---

### L-05 — Claude must check Notion Fix Tracker before stating what is fixed

**What happened:** Claude listed Sprint 1 onboarding issues (Issues 2–10)
as remaining work when they had already been fixed and verified in the
Fix-16 and Fix-17 series before the session started.

**Root cause:** Claude did not check the Notion Fix Tracker before making
statements about what was or was not fixed. Lasith had explicitly stated
at session start that Fix-16 and Fix-17 series were all resolved, but
Claude did not cross-reference this against the tracker.

**Rule:** At the start of every session, Claude must check the Notion
Fix Tracker before making any statements about open or closed issues.
Lasith's verbal confirmation of completed work must be cross-referenced
against Notion — do not override it, but verify it is reflected correctly
before producing any plan or summary.

---

*Crikly Working Ethics v1.0 — March 2026*
*Review after each phase completion.*
*Any process change must be agreed with Lasith first.*
