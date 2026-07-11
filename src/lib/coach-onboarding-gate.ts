// BUG-34: decides whether CoachLayoutClient nudges a coach into the
// onboarding wizard on first entry into /coach/*.
//
// The gate keys on WIZARD PROGRESS, not is_profile_live. Liveness is only set
// at the wizard's final go-live step (after Stripe get-paid), so keying on it
// force-bounced every returning not-yet-live coach into the wizard on each
// fresh page entry — observed on staging after a Google sign-in, but
// provider-agnostic. A coach with any wizard progress lands on the dashboard
// (REQ-C-001 dashboard-first), where the completeness panel and go-live modal
// prompt the remaining steps.
//
// display_name is the progress marker: the eager-created coach_profiles row
// (Fix-ROLES-01, at role selection) has it NULL; wizard step 1 (ProfileStep,
// Fix-COACH-UX-02) is what sets it. So "no display_name" = never started the
// wizard = genuinely new coach → nudge preserved (Fix-11i behaviour).

export interface CoachOnboardingGateInput {
  // A coach_profiles row exists for this coach.
  hasCoachProfile: boolean
  // coach_profiles.display_name is set — wizard step 1 completed.
  hasWizardProgress: boolean
  // Current pathname; wizard routes must never bounce (would loop).
  pathname: string
}

export function shouldNudgeToWizard({
  hasCoachProfile,
  hasWizardProgress,
  pathname,
}: CoachOnboardingGateInput): boolean {
  const neverStartedWizard = !hasCoachProfile || !hasWizardProgress
  const onOnboarding = pathname.startsWith('/coach/onboarding')
  return neverStartedWizard && !onOnboarding
}
