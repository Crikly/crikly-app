---
name: Project — CF-PROG-SESSIONS-DB patterns
description: Patterns and decisions from the session-persistence + camp-mode DB task (migration 031) — May 2026
type: project
---

**Task:** CF-PROG-SESSIONS-DB — persisting `session_dates` (group_programme_sessions rows) and `camp_mode` (group_programmes column) to the database.

**Migration 031 decisions:**
- `slots` is `jsonb NULL` on `group_programme_sessions` — NULL = single block, array = camp-mode multi-slot day. slots[0] mirrors row's start_time/end_time.
- UNIQUE (group_programme_id, session_date) constraint enables safe UPSERT via onConflict.
- `camp_mode` is `boolean NOT NULL DEFAULT false` on `group_programmes`.
- Migration is additive-only — no DROPs, no backfill, no RLS changes.

**RLS bypass pattern (documented and accepted):**
- `group_programme_sessions` SELECT uses admin client because the existing public RLS only grants SELECT when parent programme is `status = 'active'` — drafts would return empty.
- Ownership is enforced by the prior `group_programmes` SELECT with `.eq('coach_profile_id', coachProfile.id)`.
- Inline justification comment required. Pattern approved by Lasith.

**`(entry.slots as unknown as Json)` cast:**
- Correct escape hatch. `SessionEntrySlot[]` is structurally JSON-compatible but TS won't unify it with `Json`'s index-signature without the intermediate `unknown` cast. Not a sign of a deeper typing issue.

**Orphan rollback on POST:**
- When session INSERT fails after programme INSERT, route hard-deletes the orphan programme via admin client and returns 500.
- This violates the soft-delete-only rule technically, but the programme was never delivered to the coach. Document the exception in the comment or use soft-delete + cleanup job in a follow-up.
- Lasith pre-approved this pattern during multi-phase gate review.

**`console.info` audit log:**
- `[programmeId]/route.ts:742` — intentional audit log for the locked-programme skip path. Acceptable per Lasith's explicit instruction in review brief.

**Interface mirroring pattern:**
- `SessionEntry` / `SessionEntrySlot` interfaces are intentionally duplicated inline in both API route files (option b — no import from client-side module).
- `validateSessionEntries` / `isHHMM` helpers also duplicated. Shapes confirmed identical to canonical `programmeConstants.ts`.
- Update comment `// MIRROR OF programmeConstants.SessionEntry — Update both if shape changes` is the sync mechanism.

**campMode hydration fallback in EditProgramme.tsx:**
- `data.camp_mode === true || (typeof data.campMode === 'boolean' ? data.campMode : false)`
- Transitional bridge: `camp_mode: false` returns false correctly; `camp_mode: undefined` + `campMode: true` returns true (legacy cache). Remove the fallback leg once migration 031 is live everywhere.

**Second adminSupabase instance in GET:**
- `[programmeId]/route.ts:198` creates a second `createAdminClient()` instance as `adminSupabaseForSessions` when the first (`adminSupabase` from line 173) is already in scope. Cosmetic — could reuse the first. Not a bug.
