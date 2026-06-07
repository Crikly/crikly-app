---
name: Bash unavailable in gatekeeper — file-inspection fallback procedure
description: When Bash is denied, gate proceeds on file inspection + git status snapshot + pre-flight declarations; branch confirmed via .git/HEAD direct read
type: feedback
---

Bash is not always available to the gatekeeper agent (known AGENT-FIX-GATEKEEPER-BASH
limitation). When denied:

1. Node version — accept pre-flight declaration from the invoking agent or user.
2. Branch — read `.git/HEAD` directly (Read tool). More reliable than system context
   git status, which is a snapshot captured at conversation start and can be stale.
   Confirmed on 2026-05-11: system context showed `fix/header-modal-mode` but
   `.git/HEAD` showed `fix/bug-go-live-path` (correct).
3. Staged files — rely on system context git status + task pre-flight diff description.
4. TypeScript errors — accept pre-flight `npx tsc --noEmit` result.
5. secrets / .env — scan staged file content directly with Read tool.
6. reactCompiler — read `next.config.ts` directly with Read tool.

**Why:** The gate must still run to completion even without Bash. File inspection
covers the most critical checks (secrets, reactCompiler, hex-parity, branch).

**How to apply:** Always try `.git/HEAD` for branch confirmation when system context
may be stale. State "Bash unavailable — proceeding on file inspection" in the gate output.
