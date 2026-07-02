# Crikly — Working Ethics & Collaboration Standards

**Version:** 1.11
**Last Updated:** 2 July 2026
**Changed:** DOCS-01 — environment discipline. Migration flow Steps 7–9
  rewritten: task migrations are LOCAL ONLY; hosted `supabase db push`
  is Lasith-only, and any Lasith-instructed hosted push requires
  stating the linked project ref + full migration list first. "Hosted
  dev" terminology replaced with staging (`gzehxfnlfogkhadejowo`). New
  "Environment Ownership" section added (canonical rules in CLAUDE.md →
  Environment & Deployment Discipline).
  v1.10 (12 May 2026): L-07-RM-NEXT-BAN — `rm -rf .next` permanently
  banned from all Claude Code workflows. Two tasks on 11 May 2026
  destroyed Turbopack's RocksDB cache (Next.js 16.2.1) and
  required a full `npm install` (3–5 min downtime) to recover.
  New "Banned Commands" section added; L-07 added to Process
  Lessons.
**Maintainer:** Lasith Jayarathne
**Review:** After each phase completion

This document complements **CLAUDE.md** (Claude Code's session
briefing). Both must be read at the start of every session.
CLAUDE.md governs how Claude Code starts; this file governs how
Claude Code behaves throughout. Read this file before every prompt.

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

## Local Development Environment

These tools are required for local development. Some workflows
(UI polish, docs) don't need them; database and migration work
always does.

| Tool | Purpose | When required |
|---|---|---|
| Node 20 LTS | Run Next.js, run npm scripts | Always |
| Docker Desktop | Hosts local Supabase containers | Migrations, seed, API testing against local DB |
| Supabase CLI | Manages local Supabase stack | Same as Docker |
| psql (optional) | Direct DB queries from terminal | Optional — `docker exec` works as fallback |

### Verifying each tool works

```
node --version       # Expect: v20.x.x
docker ps            # Expect: empty list (no containers) or list (containers running)
supabase --version   # Expect: any 2.x version
```

### When Docker is needed

- Applying migrations locally: `supabase migration up` requires Docker
- Running tests against local DB: required
- API smoke testing against local DB: required
- UI-only polish work (no DB writes): NOT required
- Documentation-only commits: NOT required

### Stopping Docker when done

Always run `supabase stop` after a session that started Supabase.
Containers continue consuming RAM until explicitly stopped.

---

## Local-First Migration Discipline

Every migration runs locally first. This is non-negotiable.

### The flow

```
Step 1 → Write migration SQL in supabase/migrations/
Step 2 → Start Docker Desktop
Step 3 → Run: supabase start (or supabase db reset to wipe + reapply)
Step 4 → Run: supabase migration up
Step 5 → Verify the schema change with docker exec or Supabase Studio
Step 6 → Run any related app code locally — confirm no errors
Step 7 → ONLY THEN: commit the migration file to the task branch
Step 8 → Stop containers: supabase stop
```

Task migrations are LOCAL ONLY. Claude Code never runs `supabase db push`
against a hosted project (staging or production) — hosted pushes are
Lasith-only operations. When Lasith explicitly instructs a hosted push,
Claude Code must FIRST verify and state the linked project ref
(`supabase projects list` / `supabase/.temp/project-ref`) and list every
migration the push would apply (`supabase migration list`), then wait
for confirmation. After any hosted push, confirm local and remote
columns match for every migration — if they don't, STOP and reconcile.

### Why this matters

- Staging (`gzehxfnlfogkhadejowo`) is shared. A broken migration breaks every preview deployment.
- Local Postgres is disposable. You can wipe and rebuild it without consequences.
- The fastest path to "shipped" is the path that catches problems early.

### Anti-patterns

- Running `supabase db push` against any hosted project (staging or production) without explicit Lasith instruction — ever.
- Skipping `supabase migration up` because "it'll be fine."
- Running migrations against production directly. Never.

### Studio is for inspection, not creation

Never create tables, columns, or RLS policies in hosted Supabase
via the Studio web UI (Table Editor or SQL Editor).

Why: Studio writes to the database directly without going through
a migration file. The schema_migrations bookkeeping table doesn't
reflect the change. Result: drift between what migrations say is
applied and what's actually in the DB. This drift is invisible
until someone runs `supabase migration list` weeks later (see
3 May 2026 session — 11 migrations had to be repaired via
`supabase migration repair --status applied <timestamp>`).

Acceptable Studio uses (read-only):

- Inspecting table schemas
- Running SELECT queries to debug
- Browsing data
- Reading RLS policies

Forbidden Studio uses:

- CREATE TABLE / ALTER TABLE / DROP TABLE
- CREATE / DROP INDEX
- CREATE / DROP POLICY
- INSERT / UPDATE / DELETE on production data (use migrations or
  explicit one-off SQL with audit trail)

Recovery if Studio was used (urgency exception):

1. Immediately write the corresponding migration file in
   `supabase/migrations/` with the SQL that was executed
2. Apply locally via `supabase migration up` to verify it matches
3. Run `supabase migration repair --status applied <timestamp>`
   against hosted to align bookkeeping
4. Confirm via `supabase migration list` that local + remote agree
5. Commit the migration file with a Fix-NN entry in Notion noting
   the Studio-then-repair flow

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

Every prompt to Claude Code follows this structure. The Step 0
plan-approval gate is mandatory. Do not skip it.

```
@[AgentName]
Task ID: [from docs/10_BUILD_PLAN.md]

Context files:
- CLAUDE.md
- docs/09_WORKING_ETHICS.md
- docs/agents/[matching-agent-file].md
- docs/[task-specific docs]

Task:
[One paragraph describing what to build/fix/change]

━━━ STEP 0 — PLAN APPROVAL GATE ━━━

Before any file changes, output a plan covering:
- Files you will create or modify
- Files you will read for context only
- Order of operations
- Any deviations from this prompt's spec, with reasons
- Anything ambiguous that needs Lasith's clarification

Then STOP. Do NOT proceed until Lasith replies "approved" or
equivalent. If Lasith requests changes, revise the plan and
re-submit.

━━━ STEP 1 onward — execution ━━━

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

Branch: [target branch]
Risk: 🟢 Low | 🟡 Medium | 🔴 High

PAUSE before push.
```

### Rule on approval gates

Claude Code approval popups will sometimes offer:

1. Yes
2. Yes, and don't ask again for X
3. No

ALWAYS pick option 1. Never pick option 2 ("don't ask again").
Each operation gets reviewed individually. Speed gains from
blanket-allows are not worth the discipline loss.

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
→ No hardcoded hex colours — use Tailwind tokens.
  All tokens are defined and safelisted in tailwind.config.js.
  MANDATORY mapping — never use hex, always use the token:

  COLOUR TOKENS:
  #0077CC → bg-brand-600 / text-brand-600 / border-brand-600
  #0099AA → bg-teal-600  / text-teal-600
  #1A7A4A → bg-success   / text-success
  #B45309 → bg-warning   / text-warning
  #B91C1C → bg-danger    / text-danger
  #475569 → text-neutral-600
  #94A3B8 → text-neutral-400
  #E2E8F0 → border-neutral-100
  #F0F7FF → bg-neutral-50
  #E6F3FB → bg-brand-50
  #0F172A → text-neutral-900

  KNOWN TOKEN GAPS — keep inline as `bg-[#hex]` until added:
  #0066AA — brand-700 hover shade (used 50+ times, no token yet)
  #166534 — green-800 (status-success-darker)
  #1D9E75 / #0F6E56 / #085041 — insight-card greens (3 shades)

  FONT SIZE TOKENS — no arbitrary px values:
  text-[11px] → text-xs   (11px)
  text-[13px] → text-sm   (13px)
  text-[15px] → text-base (15px)
  text-[9px] / text-[10px] / text-[12px] →
    use text-xs for ≤11px, text-sm for 12–13px

  UI AUDIT RULE:
  If you see any bg-[#...] or text-[#...] pattern
  in a file you are already editing, replace it
  with the correct token in the same commit.
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

## Banned Commands — Never Run

Commands listed here have caused operational damage in prior
sessions. They must never appear in Claude Code prompts, agent
files, or be executed at the terminal. Any prompt containing
a banned command must be rejected before execution.

```
BANNED: rm -rf .next
  Reason: Destroys Turbopack's RocksDB persistent cache on
          Next.js 16. Recovery requires a full `npm install`
          (3–5 min downtime). Affected: FIX-GO-LIVE-CACHE and
          FIX-THEME-BRAND-TOKENS, 11 May 2026.
  Use instead: `npx tsc --noEmit` only — TypeScript checks do
               not require the `.next` directory to be removed.
               Next.js auto-invalidates stale cache entries on
               source change.
  See: L-07 in Process Lessons below.
```

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

### Plan Approval — Non-Negotiable Rule

When a prompt says "tell me your plan, wait for approval" — Claude Code
MUST stop after presenting the plan and wait for an explicit approval
message from Lasith before writing any code.

The following do NOT count as approval:
- Claude Code writing "Approved — building now" in its own plan
- Claude Code interpreting its own plan as approved
- Any self-generated approval text

The ONLY valid approval is an explicit message from Lasith such as:
"approved", "go ahead", "looks good, proceed", or similar.

If Claude Code proceeds without explicit approval it has violated
this rule. The output must be discarded and the task restarted.

This rule was added after Fix-42b (25 April 2026) when Claude Code
self-approved its own plan and proceeded without waiting.

What to do:
1. Stop the session immediately
2. Do not accept the output
3. Come to Claude with the problem
4. Get a clearer prompt, then restart Claude Code

### Agent MD File — Always Required

Every Claude Code prompt MUST include the relevant agent MD
file in the context files list. No exceptions — even for
quick fixes, hotfixes, or single-line changes.

Required format:
```
Context files:
1. CLAUDE.md
2. docs/09_WORKING_ETHICS.md
3. docs/agents/frontend-developer.md  ← always required
```

Which agent file to use:
- UI/component work → docs/agents/frontend-developer.md
- API routes → docs/agents/backend-developer.md
- DB migrations → docs/agents/database-architect.md
- Payments → docs/agents/payments-engineer.md
- Tests → docs/agents/qa-engineer.md
- Infra/deploy → docs/agents/devops-engineer.md
- Multi-file tasks → include all relevant agent files

Omitting the agent file was identified as a recurring problem
during the Fix-73 through Fix-82 debug series (April 2026)
where quick-fix prompts skipped agent context, leading to
lower quality output and missed patterns.

This rule was added after SYNC-13 (26 April 2026).

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

## Git Operations Policy (PROD-FIX-01, June 2026)

Claude Code MAY run `git add`, `git commit`, and `git push` on
`feature/*`, `fix/*`, and `develop` branches after plan approval.
Claude Code MUST use `gh pr create` + `gh pr merge` for merges into
`main`. Claude Code must NEVER push directly to `main`.

(TypeScript type checks remain `npx tsc --noEmit` only — see the
Banned Commands and Quality Gate sections.)

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

## Branch Promotion — Enforced Flow

Every change — including temp diagnostics, hotfixes, and docs — must
flow through this chain and no other:

develop → validate in develop → staging → validate in staging → main

Rules:
1. Never commit or merge directly to staging or main — they are
   promotion-only targets.
2. Validate in develop before promoting (CI must pass: build ✅ lint ✅
   type-check ✅).
3. Validate in staging before promoting to main (full manual E2E
   verification).
4. A session that merges code to develop must promote to staging before
   closing — develop never stays ahead of staging overnight.
5. Temp diagnostic branches are discarded locally — never merged to
   any branch.

---

## Environment Ownership

Canonical rules live in CLAUDE.md → "Environment & Deployment
Discipline". Summary — these are absolute:

- Promotion path is LOCAL → STAGING → PRODUCTION. No skipping.
- Lasith is the sole owner of: all pushes, merges to staging/main,
  hosted `supabase db push`, `supabase link` changes, Vercel
  deployments, and hosted environment variables.
- Task migrations are LOCAL ONLY (`supabase db push --local` /
  `supabase migration up`).
- Before any Lasith-instructed hosted DB operation: verify and state
  the linked project ref and list every migration the push would apply.
- The Supabase CLI stays linked to staging (`gzehxfnlfogkhadejowo`)
  by default. Never relink without Lasith's instruction.

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

## Build Plan DB — Update Responsibility

Claude Code updates the Build Plan DB (Notion) as the primary updater
on task completion. Claude (chat) cross-checks the update and updates
block/phase-level status as tasks complete. Lasith is the final arbiter
of all status decisions.

SHA-logging is mandatory on completion — branch commit SHA, develop
merge SHA, staging merge SHA, and PR number, logged immediately after
the merge.

Bug fixes (Fix-XX) go in the Bug & Fix Log, never the Build Plan.
Same SHA-logging rule applies.

---

## Notion Page Placement — Enforced Rule

NEVER create a Notion page at the Crikly HQ root level.
NEVER create a Notion page outside of Crikly HQ.
Every page must be created under the correct section parent.

Section parent IDs (use these as parent_id when creating pages):
- Test cases / QA:       333163fe25cf818ca6c8e469ba661bc5
- Design specs:          33c163fe25cf8149a596d4ec5bdbc55d
- Session handoffs:      33c163fe25cf814a9197d71d59c5ac2e
- Engineering / tech:    378163fe25cf816fbf59c6df21c0fe42
- Operations / releases: 378163fe25cf81d08ab6e946063187b4
- Build Plan database:   7cfc25c3-01b8-414d-81f7-15670dac53cd
- Product / backlog:     32f163fe25cf81709728e05f85f669e7
- Crikly HQ root:        32f163fe25cf81e39558d8868da3fc66 (never use as parent)

Full structure map: Notion page 33c163fe25cf81b4800fe9c46298cadb

---

## Claude Code Prompt Quality — Mandatory Rule

Before writing ANY Claude Code prompt, Claude must:
1. Load the crikly-prompt-builder skill
2. Verify all 9 checklist items pass
3. Only then post the prompt

The 9 items: @AgentName, Task ID, CLAUDE.md, working ethics,
agent .md file, relevant docs only, one-paragraph task,
Step 0 gate, risk level.

No exceptions regardless of task size or session urgency.

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

### L-07 — `rm -rf .next` destroys Turbopack RocksDB cache

**What happened:** Two Claude Code tasks on 11 May 2026
(FIX-GO-LIVE-CACHE and FIX-THEME-BRAND-TOKENS) ran
`rm -rf .next` as part of their TypeScript-check workflow.
This destroyed Turbopack's RocksDB persistent cache on
Next.js 16.2.1. Recovery required a full `npm install`
(3–5 minutes of downtime).

**Root cause:** The prompts did not explicitly ban
`rm -rf .next`. Claude approved both prompts without
flagging the command. The agent files and working-ethics
doc did not list it as a banned command — the `.next`
directory was implicitly treated as disposable build
output, which is wrong under Next.js 16 with Turbopack
caching.

**Rule added:** `rm -rf .next` is permanently banned from
all Claude Code prompts and agent files. TypeScript checks
must use `npx tsc --noEmit` only. Any prompt containing
`rm -rf .next` must be rejected before execution. Added to
the new "Banned Commands" section above.

---

## Common Pitfalls — Lessons from real sessions

### macOS Finder duplicates

macOS sometimes creates duplicate files with " 2.tsx" / " 3.sql"
/ " 4.png" naming when files are moved or copied. These are junk
but they break tools that glob directories.

Symptom: `supabase start` fails with "duplicate key value violates
unique constraint schema_migrations_pkey".

Fix: Find them with `find . -type f \( -name "* 2.*" -o -name "* 3.*"
-o -name "* 4.*" \)` and delete after verifying byte-identity to
the canonical file.

Reference: SYNC-15 (3 May 2026) cleaned up 47 dupes across the repo.

### Backup branch before risky operations

Before any cleanup task that deletes 10+ files, create a safety
branch:

```
git branch backup/pre-[task-id]
```

Costs nothing. Provides a one-command rollback (`git reset --hard
backup/pre-[task-id]`) if something goes wrong.

### Never blanket-allow Claude Code approvals

See "Rule on approval gates" in Standard Claude Code Prompt Template above.

### Fix ID assignment

Before assigning a Fix-NN number to any new bug fix, ALWAYS check
Notion's Bug & Fix Log for the highest existing Fix-NN. The next
number is highest + 1.

Why: Memory-based assignment causes ID collisions. Tonight's
Fix-91 and Fix-92 (venue lineage and seed alignment) were
committed to git as "Fix-86" and "Fix-87" because earlier sessions
assumed those numbers were available — but MS-23 marketing fixes
on 28 April had already claimed them. Result: git commit messages
reference one Fix ID, Notion canonical ID is different. Audit
trail confused.

How to check (30 seconds):

- Open https://www.notion.so/2fe61720904e4640a01378039e6b088a
- Sort by Fix ID descending
- First row = highest existing
- Your new Fix = highest + 1

If there's an ID collision in git commits already (like Fix-91/92
in develop history), document it explicitly in the Notion Notes
field: "Git commit XXX says 'Fix-NN' due to collision with [other
Fix]. Canonical Fix ID is Fix-MM in this log."

---

## Step Context Summary — Required on Every Step

Before executing any step, output this header:
📍 Where we are:  [Task ID] | [Block or Phase name]

📌 This step:     Step [N] — [Step name]

🎯 Why:           [One sentence — the purpose of this step]

Applies to Step 0, Step 1, and every subsequent step. No step executes
without this header.

---

## Module Protection Rule

The following surfaces are live in production and must not be touched
without explicit blast radius analysis in the Step 0 plan:

- Coach Module routes: /coaches/[id], /dashboard/coach/*, /onboarding/*
- Auth routes: /login, /register, /verify-email, /auth/callback
- Any shared component imported by the Coach Module

Every Step 0 plan for a task that could touch a protected surface must include:

1. Files I will modify that are used by live modules: [list or "none"]
2. Blast radius: [what live behaviour could change, or "zero"]
3. If blast radius is anything other than zero → STOP and escalate to
   Lasith before Step 1 proceeds.

This rule applies regardless of the task risk level — even 🟢 tasks.

---

## Regression Gate — Required Before Every Commit

No code is committed without passing the following:

🟢 All tasks:
- npx tsc --noEmit — zero errors
- npm run lint — zero errors

🟡/🔴 Any route or component change:
- npm run test — all Jest pass

🟡/🔴 Any change touching live UI routes:
- npm run test:e2e — 38/39 pass (T1.4 known flaky skip)

🔴 Any DB/RLS change:
- Manually verify RLS policies still protect data before committing

If any gate fails → fix before committing. Never commit failing tests.

---

## Build Plan Structure & Status Rule

### Task Hierarchy

Every Build Plan item follows this three-level hierarchy:

  Level 1 — Block / Phase    (e.g. Block 0 — Guest Booking MVP)
  Level 2 — Task             (e.g. P-00b — Coach public profile fixes)
  Level 3 — User Stories     (e.g. US-P00b-01 — CTA clarity)

Every task must have user stories written and added to its Build Plan
page before build begins.
User story format: "As a [role], I want to [action] so that [benefit]."

### Status Update Rule — All Levels

Status must be kept current at every level:

- User Story: marked ✅ as each story is delivered and verified.
- Task: updated to ✅ Complete when all its user stories are delivered.
- Block / Phase: updated to ✅ Complete when all tasks within it complete.

Claude Code updates task-level status (primary).
Claude (chat) cross-checks and updates block/phase-level status.
No level is left stale — all three levels must reflect current build state.

---

## Local Testing Gate — Required Before Any Branch Promotion

Local testing is the primary QA environment. Every feature is tested
locally by Lasith before any branch promotion.

### Feature branch → develop
- CC runs the regression gate (npx tsc --noEmit, npm run lint,
  npm run test, npm run test:e2e)
- Lasith pulls the feature branch locally and tests
  (npm run dev → localhost:3000)
- Lasith gives explicit approval before CC merges to develop

### Develop → staging
- Lasith tests the integrated develop branch locally
  (git checkout develop, npm run dev → localhost:3000)
- Lasith gives explicit approval before staging promotion

### Staging → main
- Lasith validates on staging.crikly.app
- Milestone complete (see Milestone Release Rule below)
- Lasith gives explicit milestone release sign-off
- This is the only path to main

---

## Milestone Release Rule

Main is a milestone release branch only.

Main is updated ONLY when ALL of the following are true:
1. All tasks in the milestone are complete and merged to develop
2. The integrated feature set is validated locally by Lasith
3. The feature set is validated on staging.crikly.app by Lasith
4. Lasith gives explicit milestone release sign-off

No individual feature task ever merges directly to main.
Staging accumulates validated features until a milestone is ready to ship.
Milestone definitions live in the Release Plan (Notion — Product section).

---

## Progress Tracker — Update Rule

The Progress Tracker is the top-level summary view of the Parent &
Player build. It must be kept current alongside the Build Plan DB.

**Page:** Notion `388163fe25cf814c80acf83787b66b38`
**Updated by:** Claude (chat) — sole updater.

After every task merge:
- Flip the task row Status to ✅ Complete
- Update any associated user story statuses (✅ / ⚠️ / ⚪)

After every block complete:
- Flip the Epic row to ✅ Complete

After a bug is fixed:
- Flip the Fix-XX bug row from 🔴 Open to 🐛 Fixed

No task is considered done until both the Build Plan DB
and the Progress Tracker reflect the same ✅ status.

---

## Bug Tracking Rule

When a bug is found during any task:

1. Claude Code (or Claude chat) creates a Fix-XX entry in the
   Bug & Fix Log DB (234b073a-27a6-4d8d-9103-58290accc850).
2. Claude (chat) adds a 🔴 Bug row to the Progress Tracker.
3. When the fix is merged: Fix-XX → ✅ Fixed in Bug & Fix Log +
   Progress Tracker bug row → 🐛 Fixed.

Bug fixes (Fix-XX) never go in the Build Plan DB.
SHA-logging applies to bug fixes exactly as it does to feature tasks.

---

*Crikly Working Ethics v1.11 — 2 July 2026 — DOCS-01 environment discipline*
*Review after each phase completion.*
*Any process change must be agreed with Lasith first.*
