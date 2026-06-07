---
name: Feedback — review scope discipline
description: Only flag issues introduced by the PR under review, not pre-existing code in the same file
type: feedback
---

When a PR touches an existing file (e.g. EditProgramme.tsx), only flag violations present in the NEW lines, not pre-existing code that was not touched by the change.

**Why:** Pre-existing violations are out of scope and create noise. Flagging them misleads the reviewer into thinking they must fix unrelated code before committing.

**How to apply:** For each finding, confirm it is introduced by the current change before including it. If the violation is pre-existing, note it as "pre-existing, out of scope" if at all.
