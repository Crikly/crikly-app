'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, AlertCircle, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fetchCoachProfileCached, clearCoachProfileCache } from '@/lib/onboarding-cache'
import { clearAllCoachCaches } from '@/lib/auth-cleanup'

// C-Settings-01-UI: 3 notification rows backed by 3 DB columns.
// Drops design's "New booking" row (no email_booking_received column —
// flagged BUG-NOTIF-NEW-BOOKING-COL for follow-up).
interface NotifPrefs {
  email_booking_confirmed: boolean
  email_booking_cancelled: boolean
  email_payout_processed: boolean
}
type NotifKey = keyof NotifPrefs

export default function CoachSettingsPage() {
  const router = useRouter()
  const supabase = createClient()

  // ─── Initial load ─────────────────────────────────────────────────
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  // Fix A: renamed from showPasswordRow to isOAuth (intent clearer; password row shown when !isOAuth).
  const [isOAuth, setIsOAuth] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs | null>(null)
  const [userProfileId, setUserProfileId] = useState<string>('')

  // ─── Pause toggle ─────────────────────────────────────────────────
  const [pauseSaving, setPauseSaving] = useState(false)
  const [pauseError, setPauseError] = useState<string | null>(null)

  // ─── Notification toggles ─────────────────────────────────────────
  const [notifSaving, setNotifSaving] = useState<NotifKey | null>(null)
  const [notifError, setNotifError] = useState<string | null>(null)

  // ─── Delete account flow ─────────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteBlock, setDeleteBlock] = useState<{ kind: 'upcoming' | 'payouts'; message: string } | null>(null)

  // ─── Change password flow (C-Settings-PWD-CHANGE) ────────────────
  // Email/password users only — gated below behind !isOAuth.
  const [pwdFormOpen, setPwdFormOpen] = useState(false)
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [pwdSaving, setPwdSaving] = useState(false)
  const [pwdError, setPwdError] = useState<string | null>(null)
  const [pwdSuccess, setPwdSuccess] = useState(false)

  // ─── Change email flow (C-Settings-EMAIL-CHANGE) ─────────────────
  // Available to all users (OAuth + password). Supabase auth.updateUser
  // triggers the verification email; old email stays active until verified.
  const [emailFormOpen, setEmailFormOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailPendingTo, setEmailPendingTo] = useState<string | null>(null)

  // ─── Sign out (BUG-SETTINGS-SIGNOUT-MISSING) ──────────────────────
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [profile, { data: userData }] = await Promise.all([
          fetchCoachProfileCached(),
          supabase.auth.getUser(),
        ])
        if (cancelled) return
        if (!profile) throw new Error('Profile not found')
        const user = userData?.user
        if (!user) throw new Error('Not authenticated')

        setIsPaused(!!profile.is_paused)
        setEmail(user.email ?? '')
        setUserProfileId(profile.user_profile_id)

        // Fix A: detect OAuth via user.identities — more reliable than app_metadata.provider,
        // which can be empty/unset for email/password users (causing the password row to disappear
        // for legitimate email users).
        const identities = user.identities ?? []
        const providers = identities.map((i) => i.provider)
        setIsOAuth(providers.some((p) => p === 'google' || p === 'apple'))

        // notification_preferences (own record per RLS — no API endpoint needed).
        const { data: prefs } = await supabase
          .from('notification_preferences')
          .select('email_booking_confirmed, email_booking_cancelled, email_payout_processed')
          .eq('user_profile_id', profile.user_profile_id)
          .maybeSingle()
        if (cancelled) return
        setNotifPrefs(prefs ?? {
          email_booking_confirmed: true,
          email_booking_cancelled: true,
          email_payout_processed: true,
        })
      } catch (err) {
        if (cancelled) return
        console.error('[settings] mount error:', err)
        setLoadError('Failed to load settings. Please refresh.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [supabase])

  // C-Settings-PWD-CHANGE: auto-clear the "Password updated." toast after 3s
  useEffect(() => {
    if (!pwdSuccess) return
    const t = setTimeout(() => setPwdSuccess(false), 3000)
    return () => clearTimeout(t)
  }, [pwdSuccess])

  async function handleTogglePause() {
    if (pauseSaving) return
    const newValue = !isPaused
    setPauseSaving(true)
    setPauseError(null)
    try {
      const res = await fetch('/api/coaches/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_paused: newValue }),
      })
      if (!res.ok) throw new Error('Failed')
      setIsPaused(newValue)
      // Clear the cached profile so the dashboard banner picks up the new state on next mount.
      clearCoachProfileCache()
    } catch (err) {
      console.error('[settings] pause toggle error:', err)
      setPauseError('Could not update. Please try again.')
    } finally {
      setPauseSaving(false)
    }
  }

  // C-Settings-PWD-CHANGE: inline change-password flow.
  // Only rendered for email/password users (gated by !isOAuth in JSX).
  async function handleChangePassword() {
    if (pwdSaving) return
    setPwdError(null)

    // Client-side validation — keep matching the register-form rules.
    if (!currentPwd || !newPwd || !confirmPwd) {
      setPwdError('Please fill in all fields.')
      return
    }
    if (newPwd.length < 8) {
      setPwdError('New password must be at least 8 characters.')
      return
    }
    if (newPwd !== confirmPwd) {
      setPwdError('New passwords do not match.')
      return
    }
    if (newPwd === currentPwd) {
      setPwdError('New password must be different from current password.')
      return
    }

    setPwdSaving(true)
    try {
      // BUG-PWD-CHANGE-RATE-LIMIT (follow-up): re-using signInWithPassword as a
      // current-password verifier shares Supabase's auth rate-limit bucket. A
      // user typing the wrong current password 5–6 times in quick succession
      // can lock themselves out of *login* for ~minutes. Acceptable for now
      // (typo rate on own password is low), but we should switch to a
      // dedicated server-side verify endpoint once available.
      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email,
        password: currentPwd,
      })
      if (verifyErr) {
        // Supabase returns "Invalid login credentials" for wrong password —
        // present this as a current-password error rather than a generic one.
        if (verifyErr.message.toLowerCase().includes('invalid login')) {
          setPwdError('Current password is incorrect.')
        } else {
          setPwdError('Could not verify current password. Please try again.')
        }
        return
      }

      // BUG-PWD-CHANGE-INVALIDATE-OTHER-SESSIONS (follow-up): updateUser
      // rotates the password but does NOT sign out other devices/sessions.
      // A stolen-laptop scenario means the attacker keeps their session
      // even after the victim "changes the password". We need a follow-up
      // task to call /auth/v1/logout?scope=others (or admin signOut) right
      // after updateUser succeeds, ideally with a confirmation modal
      // "Sign out everywhere else? [Yes] [No]" matching the Settings spec.
      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPwd,
      })
      if (updateErr) {
        console.error('[settings] password update error:', updateErr)
        setPwdError('Could not update password. Please try again.')
        return
      }

      setPwdSuccess(true)
      setCurrentPwd('')
      setNewPwd('')
      setConfirmPwd('')
      setPwdFormOpen(false)
    } catch (err) {
      console.error('[settings] handleChangePassword error:', err)
      setPwdError('Something went wrong. Please try again.')
    } finally {
      setPwdSaving(false)
    }
  }

  function handleCancelPwd() {
    setPwdFormOpen(false)
    setCurrentPwd('')
    setNewPwd('')
    setConfirmPwd('')
    setPwdError(null)
  }

  // C-Settings-EMAIL-CHANGE: inline change-email flow.
  // Open to all users (email/password and OAuth).
  async function handleChangeEmail() {
    if (emailSaving) return
    setEmailError(null)

    const trimmed = newEmail.trim().toLowerCase()
    if (!trimmed) {
      setEmailError('Please enter a new email address.')
      return
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmed)) {
      setEmailError('Please enter a valid email address.')
      return
    }
    if (trimmed === email.toLowerCase()) {
      setEmailError('New email must be different from your current email.')
      return
    }

    setEmailSaving(true)
    try {
      // BUG-EMAIL-CHANGE-RATE-LIMIT (follow-up): repeated email-change
      // attempts share Supabase's email-send rate-limit bucket — the same
      // bucket that throttles signUp verification mails. A user hammering
      // this can lock themselves out of triggering legitimate auth mails
      // for ~minutes. Acceptable for now; revisit if we see complaints.
      const { error } = await supabase.auth.updateUser({ email: trimmed })
      if (error) {
        console.error('[settings] email update error:', error)
        if (error.message.toLowerCase().includes('already')) {
          setEmailError('That email is already in use.')
        } else if (error.message.toLowerCase().includes('rate limit')) {
          setEmailError('Too many attempts. Please wait a few minutes and try again.')
        } else {
          setEmailError('Could not update email. Please try again.')
        }
        return
      }
      // BUG-EMAIL-CHANGE-PENDING-PERSIST (follow-up): the "pending verification"
      // banner is in-memory only — refreshing the page hides it. Supabase
      // exposes user.new_email on the session once the change is pending;
      // we should rehydrate emailPendingTo from that on mount so the banner
      // survives page reloads until the user confirms.
      setEmailPendingTo(trimmed)
      setNewEmail('')
      setEmailFormOpen(false)
    } catch (err) {
      console.error('[settings] handleChangeEmail error:', err)
      setEmailError('Something went wrong. Please try again.')
    } finally {
      setEmailSaving(false)
    }
  }

  function handleCancelEmail() {
    setEmailFormOpen(false)
    setNewEmail('')
    setEmailError(null)
  }

  // BUG-SETTINGS-SIGNOUT-MISSING: standalone sign-out from Settings.
  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    try {
      await supabase.auth.signOut()
    } catch (err) {
      // Even if signOut throws, still redirect — the user asked to leave.
      console.error('[settings] sign out error:', err)
    } finally {
      // BUG-QA-04: wipe coach-scoped sessionStorage so the next user on this
      // tab doesn't inherit our cached profile / completeness / etc. Runs in
      // finally so it executes even when signOut itself throws.
      clearAllCoachCaches()
      // Reset state before navigation — if router.push is intercepted
      // (middleware redirect loop, etc.) the button stays usable instead
      // of being stuck disabled.
      setSigningOut(false)
      router.push('/login')
    }
  }

  async function handleToggleNotif(key: NotifKey) {
    if (!notifPrefs || notifSaving) return
    const newValue = !notifPrefs[key]
    const prev = notifPrefs
    setNotifSaving(key)
    setNotifError(null)
    // Optimistic update; rollback below on failure.
    setNotifPrefs({ ...notifPrefs, [key]: newValue })
    try {
      // Fix 4: check-then-update-or-insert (was upsert with onConflict).
      // Migration 009 has SELECT + UPDATE RLS policies on notification_preferences
      // but NO INSERT policy — so a fresh upsert can silently fail RLS-deny on
      // the INSERT branch. By checking first, we get a clearer outcome:
      //   - Row exists → UPDATE works (UPDATE policy allows own-record).
      //   - Row missing → INSERT will fail RLS until BUG-NOTIF-RLS-INSERT lands;
      //     surface a concrete error so the user knows.
      const { data: existing, error: lookupErr } = await supabase
        .from('notification_preferences')
        .select('id')
        .eq('user_profile_id', userProfileId)
        .maybeSingle()
      if (lookupErr) throw lookupErr

      if (existing) {
        const { error: updateErr } = await supabase
          .from('notification_preferences')
          .update({ [key]: newValue, updated_at: new Date().toISOString() })
          .eq('user_profile_id', userProfileId)
        if (updateErr) throw updateErr
      } else {
        // First-time write — INSERT requires a row not blocked by RLS.
        // If RLS denies, the error message will surface in the catch below.
        const { error: insertErr } = await supabase
          .from('notification_preferences')
          .insert({
            user_profile_id: userProfileId,
            [key]: newValue,
          })
        if (insertErr) throw insertErr
      }
    } catch (err) {
      // Improve error visibility — Supabase error objects sometimes serialise as `{}`.
      const errMsg = (err as { message?: string; details?: string; hint?: string; code?: string })?.message
        ?? JSON.stringify(err)
      console.error('[settings] notif toggle error:', errMsg, err)
      setNotifPrefs(prev)
      setNotifError('Could not update. Please try again.')
    } finally {
      setNotifSaving(null)
    }
  }

  async function handleDelete() {
    if (deleteText.trim() !== 'DELETE' || deleteSubmitting) return
    setDeleteSubmitting(true)
    setDeleteError(null)
    setDeleteBlock(null)
    try {
      const res = await fetch('/api/coaches/account', { method: 'DELETE' })
      const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string }
      if (res.status === 409) {
        const code = data.code
        const message = data.error ?? 'Cannot delete account.'
        if (code === 'UPCOMING_BOOKINGS') {
          setDeleteBlock({ kind: 'upcoming', message })
        } else if (code === 'PENDING_PAYOUTS') {
          setDeleteBlock({ kind: 'payouts', message })
        } else {
          setDeleteError(message)
        }
        return
      }
      if (!res.ok) throw new Error(data.error ?? 'Failed to delete account')
      // Sign out then redirect (Ambiguity 8 → sequential).
      await supabase.auth.signOut()
      // BUG-QA-04: same cache wipe as handleSignOut — keeps the next tab user clean.
      clearAllCoachCaches()
      router.push('/')
    } catch (err) {
      console.error('[settings] delete error:', err)
      setDeleteError('Could not delete account. Please try again.')
    } finally {
      setDeleteSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={28} className="text-brand-600 animate-spin" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <p className="text-[14px] text-danger text-center">{loadError}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-5 pt-8 pb-10 lg:px-12 lg:pb-20">
      <div className="max-w-[600px] mx-auto">

        {/* Page title — Fix 2: icon badge removed; matches other coach screens */}
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-neutral-900 mb-7">Settings</h1>

        <div className="flex flex-col gap-6">

          {/* ===== ACCOUNT ===== */}
          <Card title="Account">
            <Row
              label="Email address"
              value={emailFormOpen ? '' : email}
              action={
                emailFormOpen ? null : (
                  <button
                    type="button"
                    onClick={() => {
                      setEmailFormOpen(true)
                      setEmailError(null)
                    }}
                    className="text-brand-600 hover:text-brand-700 text-[13px] font-medium cursor-pointer bg-transparent border-0 p-0 py-1.5"
                  >
                    Change
                  </button>
                )
              }
            />
            {emailPendingTo && !emailFormOpen && (
              <div
                role="status"
                aria-live="polite"
                className="rounded-md border border-brand-100 bg-brand-50 p-3 mt-2"
              >
                <p className="text-[13px] text-neutral-800">
                  <strong className="font-semibold">Verification email sent to {emailPendingTo}.</strong>{' '}
                  Click the link in your inbox to confirm the new address. Your current address remains active until then.
                </p>
              </div>
            )}
            {emailFormOpen && (
              <div className="flex flex-col gap-3 py-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[12px] text-neutral-600">New email address</span>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    autoComplete="email"
                    disabled={emailSaving}
                    placeholder="you@example.com"
                    className="h-11 px-3 rounded-md border border-neutral-300 text-[14px] focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 disabled:bg-neutral-50"
                  />
                  <span className="text-[12px] text-neutral-500">
                    We&apos;ll send a verification link to this address. Your current email stays active until you confirm.
                  </span>
                </label>

                {emailError && (
                  <p role="alert" className="text-[12px] text-danger">{emailError}</p>
                )}

                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    onClick={handleChangeEmail}
                    disabled={emailSaving}
                    className="h-11 px-4 rounded-md bg-brand-600 hover:bg-brand-700 text-white text-[14px] font-medium disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    {emailSaving ? 'Sending…' : 'Send verification email'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEmail}
                    disabled={emailSaving}
                    className="h-11 px-4 rounded-md border border-neutral-300 hover:bg-neutral-50 text-neutral-800 text-[14px] font-medium disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {!isOAuth && (
              <>
                <Row
                  label="Password"
                  value={pwdFormOpen ? '' : '••••••••'}
                  action={
                    pwdFormOpen ? null : (
                      <button
                        type="button"
                        onClick={() => {
                          setPwdFormOpen(true)
                          setPwdError(null)
                          setPwdSuccess(false)
                        }}
                        className="text-brand-600 hover:text-brand-700 text-[13px] font-medium cursor-pointer bg-transparent border-0 p-0 py-1.5"
                      >
                        Change password
                      </button>
                    )
                  }
                />
                {pwdSuccess && !pwdFormOpen && (
                  <p
                    role="status"
                    aria-live="polite"
                    className="text-[12px] text-success mt-1"
                  >
                    Password updated.
                  </p>
                )}
                {pwdFormOpen && (
                  <div className="flex flex-col gap-3 py-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-[12px] text-neutral-600">Current password</span>
                      <input
                        type="password"
                        value={currentPwd}
                        onChange={(e) => setCurrentPwd(e.target.value)}
                        autoComplete="current-password"
                        disabled={pwdSaving}
                        className="h-11 px-3 rounded-md border border-neutral-300 text-[14px] focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 disabled:bg-neutral-50"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[12px] text-neutral-600">New password</span>
                      <input
                        type="password"
                        value={newPwd}
                        onChange={(e) => setNewPwd(e.target.value)}
                        autoComplete="new-password"
                        disabled={pwdSaving}
                        className="h-11 px-3 rounded-md border border-neutral-300 text-[14px] focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 disabled:bg-neutral-50"
                      />
                      <span className="text-[12px] text-neutral-500">At least 8 characters.</span>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[12px] text-neutral-600">Confirm new password</span>
                      <input
                        type="password"
                        value={confirmPwd}
                        onChange={(e) => setConfirmPwd(e.target.value)}
                        autoComplete="new-password"
                        disabled={pwdSaving}
                        className="h-11 px-3 rounded-md border border-neutral-300 text-[14px] focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 disabled:bg-neutral-50"
                      />
                    </label>

                    {pwdError && (
                      <p role="alert" className="text-[12px] text-danger">{pwdError}</p>
                    )}

                    <div className="flex gap-2 mt-1">
                      <button
                        type="button"
                        onClick={handleChangePassword}
                        disabled={pwdSaving}
                        className="h-11 px-4 rounded-md bg-brand-600 hover:bg-brand-700 text-white text-[14px] font-medium disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer transition-colors"
                      >
                        {pwdSaving ? 'Saving…' : 'Update password'}
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelPwd}
                        disabled={pwdSaving}
                        className="h-11 px-4 rounded-md border border-neutral-300 hover:bg-neutral-50 text-neutral-800 text-[14px] font-medium disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>

          {/* ===== PROFILE VISIBILITY ===== */}
          <Card title="Profile visibility">
            {isPaused && (
              <AmberCallout>
                <strong className="text-[#713F12] font-semibold">Your profile is paused.</strong>
                <br />
                Parents cannot find you in search results.
              </AmberCallout>
            )}
            <Row
              label="Pause profile"
              sub="Hide your profile from search results. Existing bookings are not affected."
              action={
                <Toggle
                  on={isPaused}
                  onClick={handleTogglePause}
                  disabled={pauseSaving}
                  ariaLabel="Pause profile"
                />
              }
              borderTop={!isPaused}
            />
            {pauseError && (
              <p className="text-[12px] text-danger mt-2">{pauseError}</p>
            )}
          </Card>

          {/* ===== NOTIFICATIONS ===== */}
          <Card title="Notifications">
            <SubHead>Email</SubHead>
            <Row
              label="Booking confirmed"
              sub="Payment received"
              action={
                <Toggle
                  on={notifPrefs?.email_booking_confirmed ?? true}
                  onClick={() => handleToggleNotif('email_booking_confirmed')}
                  disabled={notifSaving === 'email_booking_confirmed'}
                  ariaLabel="Booking confirmed"
                />
              }
            />
            <Row
              label="Cancellation"
              sub="When a booking is cancelled"
              action={
                <Toggle
                  on={notifPrefs?.email_booking_cancelled ?? true}
                  onClick={() => handleToggleNotif('email_booking_cancelled')}
                  disabled={notifSaving === 'email_booking_cancelled'}
                  ariaLabel="Cancellation"
                />
              }
            />
            <Row
              label="Payout released"
              sub="When earnings are transferred"
              action={
                <Toggle
                  on={notifPrefs?.email_payout_processed ?? true}
                  onClick={() => handleToggleNotif('email_payout_processed')}
                  disabled={notifSaving === 'email_payout_processed'}
                  ariaLabel="Payout released"
                />
              }
            />
            <SubHead className="mt-[18px]">Push notifications</SubHead>
            <Row
              label={
                <span className="flex items-center gap-2.5">
                  Push notifications
                  <span className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-gray-100 text-neutral-600">
                    Coming soon
                  </span>
                </span>
              }
              action={<Toggle on={false} disabled ariaLabel="Push notifications" />}
            />
            {notifError && (
              <p className="text-[12px] text-danger mt-2">{notifError}</p>
            )}
          </Card>

          {/* ===== DANGER ZONE ===== */}
          {deleteBlock ? (
            <DangerCard title="Delete account">
              <AmberCallout>
                {deleteBlock.message}
                {deleteBlock.kind === 'upcoming' && (
                  <>
                    <br />
                    <Link
                      href="/coach/bookings"
                      className="inline-flex items-center gap-1 text-brand-600 text-[13px] font-medium mt-1.5 no-underline hover:underline"
                    >
                      View bookings →
                    </Link>
                  </>
                )}
              </AmberCallout>
              <button
                type="button"
                onClick={() => { setDeleteBlock(null); setDeleteOpen(false); setDeleteText('') }}
                className="text-[13px] text-neutral-600 hover:text-neutral-900 bg-transparent border-0 p-0 cursor-pointer"
              >
                Close
              </button>
            </DangerCard>
          ) : !deleteOpen ? (
            <DangerCard title="Danger zone">
              <Row
                label="Delete account"
                sub="Permanently delete your account and all data."
                action={
                  <button
                    type="button"
                    onClick={() => setDeleteOpen(true)}
                    // Fix 6: inline style guarantees 1.5px red border (border-[1.5px] arbitrary value was
                    // not rendering reliably; default Tailwind has no half-pixel border width).
                    style={{ border: '1.5px solid #B91C1C' }}
                    className="bg-white text-danger h-10 px-4 rounded-[10px] text-[13px] font-medium hover:bg-[#FEE2E2] transition-colors cursor-pointer shrink-0"
                  >
                    Delete account
                  </button>
                }
                borderTop={false}
              />
            </DangerCard>
          ) : (
            <DangerCard title="Delete account">
              <div className="flex items-start gap-2 text-danger text-[14px] font-medium mb-3.5 leading-[1.5]">
                <AlertCircle size={18} strokeWidth={1.8} className="shrink-0 mt-0.5" />
                <span>This will permanently delete your Crikly account.</span>
              </div>
              <input
                type="text"
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
                placeholder="Type DELETE to confirm"
                className="w-full h-11 px-3.5 bg-white border border-neutral-100 rounded-[10px] text-[14px] text-neutral-900 placeholder:text-neutral-400 outline-none mb-3.5 tracking-[0.04em] focus:border-danger focus:shadow-[0_0_0_3px_rgba(185,28,28,0.15)] transition-[border,box-shadow] duration-150 disabled:opacity-50"
                disabled={deleteSubmitting}
              />
              {deleteError && (
                <p className="text-[12px] text-danger mb-3">{deleteError}</p>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { setDeleteOpen(false); setDeleteText(''); setDeleteError(null) }}
                  disabled={deleteSubmitting}
                  className="bg-white text-neutral-600 border border-[#CBD5E1] h-10 px-4 rounded-[10px] text-[13px] font-medium hover:bg-[#F8FAFC] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleteText.trim() !== 'DELETE' || deleteSubmitting}
                  // Fix C: bg-[#B91C1C] arbitrary value (was bg-danger). Arbitrary values are always
                  // JIT-emitted; the safelisted bg-danger was apparently not rendering for this button.
                  // Disabled state remains visible (just dimmed via opacity-40), enabled = full red.
                  className="bg-[#B91C1C] hover:bg-[#991414] text-white border-none h-10 px-[18px] rounded-[10px] text-[13px] font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {deleteSubmitting ? 'Deleting…' : 'Delete my account'}
                </button>
              </div>
            </DangerCard>
          )}

          {/* ===== SIGN OUT (BUG-SETTINGS-SIGNOUT-MISSING) ===== */}
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="h-11 px-6 rounded-md border border-danger bg-white text-danger text-[14px] font-medium hover:bg-[#FEE2E2] transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Helper Components ─────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-[14px] shadow-[0_1px_3px_rgba(15,23,42,0.05)] border border-neutral-100 px-6 pt-6 pb-2">
      <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-neutral-900 m-0 mb-1">{title}</h2>
      <div className="pb-4">{children}</div>
    </div>
  )
}

function DangerCard({ title, children }: { title: string; children: React.ReactNode }) {
  // Fix 5: explicit per-side border declarations. Tailwind's `border` shorthand
  // followed by `border-l-[3px] border-l-danger` was inconsistently overriding
  // (especially the left-color override). Inline style guarantees the red 3px
  // left border renders against the rounded card edge.
  return (
    <div
      className="bg-white rounded-[14px] shadow-[0_1px_3px_rgba(15,23,42,0.05)] border-t border-r border-b border-neutral-100 px-6 pt-6 pb-2"
      style={{ borderLeft: '3px solid #B91C1C' }}
    >
      <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-danger m-0 mb-1">{title}</h2>
      <div className="pb-4 pt-2">{children}</div>
    </div>
  )
}

function Row({
  label,
  value,
  sub,
  action,
  borderTop = true,
}: {
  label: React.ReactNode
  value?: string
  sub?: string
  action: React.ReactNode
  borderTop?: boolean
}) {
  return (
    <div className={`flex items-center gap-4 py-3.5 ${borderTop ? 'border-t border-neutral-100 first:border-t-0' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium text-neutral-900">{label}</div>
        {value && <div className="text-[13px] text-neutral-600 mt-0.5">{value}</div>}
        {sub && <div className="text-[13px] text-neutral-600 mt-0.5 leading-[1.45]">{sub}</div>}
      </div>
      {action}
    </div>
  )
}

function Toggle({
  on,
  onClick,
  disabled = false,
  ariaLabel,
}: {
  on: boolean
  onClick?: () => void
  disabled?: boolean
  ariaLabel?: string
}) {
  // CF-R04: Tailwind classes (bg-brand-600 / bg-neutral-100) now in safelist, so
  // the JIT bypass via inline style is no longer needed.
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      className={`relative w-[42px] h-6 rounded-full shrink-0 transition-colors duration-150 border-0 p-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${on ? 'bg-brand-600' : 'bg-neutral-100'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-[0_1px_3px_rgba(15,23,42,0.15)] transition-transform duration-[180ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
          on ? 'translate-x-[18px]' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

function SubHead({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`text-[11px] font-semibold text-neutral-400 uppercase tracking-[0.06em] mt-3.5 mb-1 first:mt-0 ${className}`}>
      {children}
    </div>
  )
}

function AmberCallout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#FEF3C7] border border-[#FDE68A] rounded-[10px] p-3 flex gap-2.5 items-start mb-3.5">
      <span className="text-warning shrink-0 mt-0.5">
        <AlertTriangle size={18} strokeWidth={1.8} />
      </span>
      <div className="text-[13px] text-[#854D0E] leading-[1.5]">{children}</div>
    </div>
  )
}
