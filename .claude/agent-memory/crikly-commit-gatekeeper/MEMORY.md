# Crikly Commit Gatekeeper — Memory Index

- [Tailwind v4 colour token migration status](project_tailwind_v4_migration.md) — colour tokens migrated to globals.css @theme inline; non-colour tokens still pending FIX-THEME-NON-COLOR-TOKENS
- [Commit subject 72-char limit overrun pattern](feedback_commit_subject_length.md) — task ID suffixes frequently push subjects over 72 chars; always count before passing
- [Bash unavailable — file-inspection fallback procedure](feedback_bash_unavailable.md) — read .git/HEAD for branch; accept pre-flight for node/tsc; state limitation in output
- [fix/* branch BUILD_PLAN exemption for check 12](feedback_fix_branch_build_plan_exemption.md) — FIX-*/BUG-*/DEBUG-* task IDs with no BUILD_PLAN line item are exempt from check 12
- [Check 12 explicit-authorisation exemption pattern](feedback_check12_explicit_authorisation_exemption.md) — Lasith can explicitly authorise skipping BUILD_PLAN.md in a commit when using a separate-sync pass
- [Design token audit pattern (CF-TOKEN-AUDIT)](project_design_token_audit.md) — visual hex→token sweeps use CF-TOKEN-AUDIT task ID; brand-700 token now exists; gray-* is canonical; DOM mutations + SVG strokes are out of scope
- [Check 13 advisory deferral — API_REFERENCE not in brief scope](feedback_check13_advisory_deferral.md) — when brief excludes doc update, Lasith defers check 13 to follow-up; surface as WARN not FAIL
