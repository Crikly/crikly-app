---
name: Check 13 advisory deferral — API_REFERENCE not in brief scope
description: When a task brief does not request docs/04_API_REFERENCE.md update, Lasith explicitly defers check 13 to a follow-up task — this is not a blocking failure.
type: feedback
---

Check 13 (docs updated) is advisory, not blocking. When the task brief explicitly scopes out a doc update (e.g. "the brief did not request that doc be updated — defer to follow-up"), Lasith's authorisation to proceed is valid.

**Why:** Per Crikly discipline, scope creep is actively avoided. If a doc update was not in the brief, adding it to the commit is overreach. The correct flow is: note the advisory gap, present it to Lasith, and defer with a follow-up task reference.

**How to apply:** When check 13 fires as advisory-only (i.e. docs/04_API_REFERENCE.md not staged for a new API route), surface it clearly as WARN not FAIL, ask Lasith to confirm deferral and name a follow-up task. Once confirmed, proceed. Record the deferred doc in the gate output for audit trail.

First observed: PUB-API-01 commit, 2026-05-31. Follow-up task for docs/04_API_REFERENCE.md update deferred by Lasith.
