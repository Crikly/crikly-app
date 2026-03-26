# Crikly — Agentic Task Orchestration Guide

**Version:** 1.0
**Last Updated:** March 2026
**Read alongside CLAUDE.md before any multi-step task.**

---

## Purpose

This file defines how to orchestrate complex multi-step development
tasks for Crikly. It specifies which agent to invoke, in what order,
and what each agent is responsible for.

For single-file changes, go directly to the relevant agent.
For features that touch multiple layers, follow the orchestration
sequence defined here.

---

## The Agent Team

| Agent | Tag | Layer | File |
|---|---|---|---|
| Frontend Developer | `@FrontendDeveloper` | UI, pages, components | `docs/agents/frontend-developer.md` |
| Backend Developer | `@BackendDeveloper` | API routes, business logic | `docs/agents/backend-developer.md` |
| Database Architect | `@DatabaseArchitect` | Schema, migrations, RLS | `docs/agents/database-architect.md` |
| Payments Engineer | `@PaymentsEngineer` | Stripe, payouts, webhooks | `docs/agents/payments-engineer.md` |
| DevOps Engineer | `@DevOpsEngineer` | CI/CD, deployment, infra | `docs/agents/devops-engineer.md` |
| QA Engineer | `@QAEngineer` | Tests, quality, coverage | `docs/agents/qa-engineer.md` |

---

## Standard Feature Build Sequence

For any new feature, always follow this sequence.
Never skip steps. Never reverse the order.

```
Step 1: @DatabaseArchitect  → Design tables, RLS policies, migrations
Step 2: @BackendDeveloper   → API routes, business logic, types
Step 3: @PaymentsEngineer   → If feature involves money (optional)
Step 4: @FrontendDeveloper  → UI components, pages, hooks
Step 5: @QAEngineer         → Tests for all layers
Step 6: @DevOpsEngineer     → Deployment checks, env vars (optional)
```

**Why this order:**
Database first — everything else depends on the schema.
Backend before frontend — frontend calls the API, not the database.
Tests last — written against completed implementation.

---

## Orchestration Rules

```
RULE 1: Always read CLAUDE.md before starting any task.

RULE 2: Always read the relevant agent file before invoking that agent.

RULE 3: Database changes require docs/03_DATABASE_SCHEMA.md to be
        updated in the same commit. Schema doc is always in sync.

RULE 4: Never start frontend work until API routes are complete
        and tested.

RULE 5: Every feature must have tests before it is considered done.
        "Done" means: implemented + tested + documented.

RULE 6: Business rule changes require docs/05_BUSINESS_RULES.md
        to be updated in the same commit.

RULE 7: Security-sensitive changes require docs/06_SECURITY_COMPLIANCE.md
        review before implementation.

RULE 8: Never hardcode values that belong in the database.
        Commission rates, feature flags, tier limits → always DB.
```

---

## Feature Complexity Guide

### Simple Change (1-2 files)
Go directly to the relevant agent. No orchestration needed.

```
Example: Fix a UI bug in the coach profile card
→ @FrontendDeveloper directly
→ No sequence needed
```

### Medium Feature (2-4 files, one layer)
Read agent file, implement, write tests.

```
Example: Add a new filter to coach search
→ @BackendDeveloper (API route update)
→ @FrontendDeveloper (UI filter component)
→ @QAEngineer (tests for filter logic)
```

### Complex Feature (multiple layers, database changes)
Follow full sequence. Document as you go.

```
Example: Build the Training Passport feature
→ @DatabaseArchitect (new tables + RLS)
→ @BackendDeveloper (API routes)
→ @FrontendDeveloper (passport UI)
→ @QAEngineer (full test coverage)
```

### Payment Feature (always treated as high complexity)
Extra care required. Read payments agent file thoroughly.

```
Example: Implement booking payment flow
→ @DatabaseArchitect (transactions, payment_intents table)
→ @PaymentsEngineer (Stripe integration)
→ @BackendDeveloper (API routes + webhook handlers)
→ @FrontendDeveloper (checkout UI)
→ @QAEngineer (payment + refund + webhook tests)
```

---

## Standard Windsurf Prompt Template

Copy this for every Windsurf prompt. Never skip sections.

```
@[AgentName]

Context files:
- CLAUDE.md
- docs/09_WORKING_ETHICS.md
- docs/[only relevant doc]
- docs/[only relevant doc]

Task:
[One clear paragraph — what to build and why]

File(s) to create or modify:
- src/[exact/file/path.ts]

Requirements:
- [requirement 1]
- [requirement 2]

Must NOT modify:
- [locked file if any]

Business rules: [BR-XX if payment/booking logic]
Security rules: [ref docs/06 if child data or payments]

Commit to: feature/[name] branch
Risk: 🟢 Low | 🟡 Medium | 🔴 High
```

---

## Prompt Template — Database Change

```
Read CLAUDE.md and docs/agents/database-architect.md first.
Read docs/03_DATABASE_SCHEMA.md to understand current schema.

Agent: @DatabaseArchitect

Task:
[What database change is needed and why]

New tables needed:
- [table_name]: [purpose]

New columns needed:
- [table_name].[column_name]: [type] — [purpose]

RLS policies needed:
- [Who can SELECT / INSERT / UPDATE / DELETE]

After completing:
1. Update docs/03_DATABASE_SCHEMA.md with new tables/columns
2. Generate TypeScript types from Supabase
3. Commit migration file + updated schema doc together

Commit to: feature/[feature-name] branch
Message format: docs(schema): [description] v[new version]
```

---

## Prompt Template — Bug Fix

```
Read CLAUDE.md first.

Bug: [Description of the bug]
Reported in: [file path or user journey]

Expected behaviour:
[What should happen]

Actual behaviour:
[What is happening]

Likely cause:
[Your analysis if known]

Fix:
[What needs to change]

Test to add:
[Test that proves the bug is fixed and won't regress]

Commit to: fix/[bug-name] branch
Message: fix([scope]): [description]
```

---

## Locked Files — Never Modify Without Explicit Instruction

```
CLAUDE.md                         ← Update only when architecture changes
AGENTS.md                         ← Update only when process changes
PRD.md                            ← Update only when product changes
docs/06_SECURITY_COMPLIANCE.md    ← Update only with security review
supabase/migrations/              ← Never edit existing migrations
                                     Always create new migration files
.env.example                      ← Update when new env vars added
```

---

## Documentation Update Rules

When completing any task, check if these docs need updating:

| Task type | Docs to update |
|---|---|
| New DB table or column | `docs/03_DATABASE_SCHEMA.md` |
| New API route | `docs/04_API_REFERENCE.md` |
| New business rule | `docs/05_BUSINESS_RULES.md` |
| New env variable | `docs/02_TECH_ARCHITECTURE.md` + `.env.example` |
| New feature completed | `docs/09_BUILD_PLAN.md` (mark ✅) |
| Architecture decision | `docs/02_TECH_ARCHITECTURE.md` |
| Security change | `docs/06_SECURITY_COMPLIANCE.md` |

---

## Build Plan Discipline

At the start of every session:
1. Open `docs/09_BUILD_PLAN.md`
2. Find the first ⚪ Planned or 🟡 In Progress task
3. That is what you work on next
4. Mark 🟡 In Progress when you start
5. Mark ✅ Complete when done + tested + committed

Do not skip tasks. Do not work out of order without good reason.

---

## Quality Gate — Before Any Commit

```
□ TypeScript compiles with zero errors (npm run build)
□ No `any` types introduced
□ No console.log left in code
□ Tests written and passing
□ Relevant docs updated
□ .env.local not committed
□ Committing to correct branch (not main)
□ Commit message follows convention
□ RLS policies in place for any new DB tables
□ No secrets or keys in code
```

---

## Security Gate — Before Any Payment or Child Data Feature

```
□ Read docs/06_SECURITY_COMPLIANCE.md fully
□ Stripe webhook signature verified
□ No card data touched or logged
□ Child data access limited to authorised roles
□ RLS policies explicitly tested
□ Idempotency keys used on payment intents
□ All user inputs validated and sanitised
```

---

*Crikly AGENTS.md v1.0 — March 2026*
*Read this alongside CLAUDE.md for every multi-step task.*
