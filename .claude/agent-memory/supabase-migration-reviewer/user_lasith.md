---
name: Lasith Role and Preferences
description: Lasith is the product lead — he owns all DB decisions, approves migrations before push, and verifies pre-push queries manually in Supabase Studio
type: user
---

Lasith Jayarathne is the product lead and sole decision-maker for the Crikly platform. He approves every migration before `supabase db push` runs. He runs pre-push safety queries manually in Supabase Studio and verifies `supabase migration list` drift himself.

He escalates architectural decisions to Claude Chat (claude.ai) before bringing them to Claude Code for implementation. By the time a migration reaches this reviewer, the design decisions have already been approved — the reviewer's job is to catch implementation errors, not re-litigate architecture.

He classifies UNIQUE constraint additions to live tables as 🔴 High risk and gates them through multi-phase review before any dependent code ships.
