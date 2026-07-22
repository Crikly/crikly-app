import { shouldNudgeToWizard } from '@/lib/coach-onboarding-gate'

// BUG-34: the wizard nudge keys on wizard progress (display_name set by step
// 1), not is_profile_live — a returning coach who hasn't gone live yet must
// land on the dashboard, while a genuinely new coach (empty eager-created
// coach_profiles row) still gets nudged into the wizard.
describe('shouldNudgeToWizard (BUG-34)', () => {
  it('nudges a genuinely new coach (no coach_profiles row) into the wizard', () => {
    expect(
      shouldNudgeToWizard({
        hasCoachProfile: false,
        hasWizardProgress: false,
        pathname: '/coach/dashboard',
      })
    ).toBe(true)
  })

  it('nudges a coach with an empty eager-created row (role picked, wizard never started)', () => {
    expect(
      shouldNudgeToWizard({
        hasCoachProfile: true,
        hasWizardProgress: false,
        pathname: '/coach/dashboard',
      })
    ).toBe(true)
  })

  it('does NOT nudge a coach with wizard progress who has not gone live (the BUG-34 case)', () => {
    expect(
      shouldNudgeToWizard({
        hasCoachProfile: true,
        hasWizardProgress: true,
        pathname: '/coach/dashboard',
      })
    ).toBe(false)
  })

  it('does NOT nudge on any other coach route when wizard progress exists', () => {
    for (const pathname of ['/coach/schedule', '/coach/settings', '/coach/earnings']) {
      expect(
        shouldNudgeToWizard({ hasCoachProfile: true, hasWizardProgress: true, pathname })
      ).toBe(false)
    }
  })

  it('never nudges while already on a wizard route (would loop)', () => {
    for (const pathname of ['/coach/onboarding/profile', '/coach/onboarding/sport', '/coach/onboarding/go-live']) {
      expect(
        shouldNudgeToWizard({ hasCoachProfile: false, hasWizardProgress: false, pathname })
      ).toBe(false)
    }
  })
})
