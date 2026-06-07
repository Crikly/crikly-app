---
name: Commit subject 72-char limit — common overrun pattern
description: Proposed commit subjects frequently exceed 72 chars when the task ID suffix is included; always count before approving
type: feedback
---

Always measure the commit subject character count before declaring PASS on check [S2].
Task ID suffixes of the form `— TASK-ID` add 22–30 characters, which frequently pushes
an otherwise reasonable subject over the 72-char limit.

**Why:** The first FIX-THEME-BRAND-TOKENS gate run (2026-05-11) had a proposed subject of
84 characters. The user had explicitly asked for a character count check, which is the
correct instinct — the gate should always verify, never assume.

**How to apply:** Count the full subject including the em-dash + task ID suffix.
If over 72: shorten the descriptive phrase, not the task ID or em-dash convention.
Typical shortening: "register brand colour tokens for Tailwind v4" → "register Tailwind v4 colour vars" (saves 14 chars).
