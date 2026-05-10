'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, AlertCircle, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fetchCoachProfileCached, clearCoachProfileCache } from '@/lib/onboarding-cache'

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
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 size={28} className="text-brand-600 animate-spin" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-6">
        <p className="text-[14px] text-danger text-center">{loadError}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white px-5 py-10 lg:px-12 lg:pb-20">
      <div className="max-w-[600px] mx-auto">

        {/* Page title — Fix 2: icon badge removed; matches other coach screens */}
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-neutral-900 mb-7">Settings</h1>

        <div className="flex flex-col gap-6">

          {/* ===== ACCOUNT ===== */}
          <Card title="Account">
            <Row
              label="Email address"
              value={email}
              action={
                // Fix A: stub buttons now visible/active (no disabled, no opacity-50). Title tooltip carries the "coming soon" hint.
                <button
                  type="button"
                  title="Coming soon"
                  className="text-brand-600 hover:text-brand-700 text-[13px] font-medium cursor-pointer bg-transparent border-0 p-0 py-1.5"
                >
                  Change
                </button>
              }
            />
            {!isOAuth && (
              <Row
                label="Password"
                value="••••••••"
                action={
                  <button
                    type="button"
                    title="Coming soon"
                    className="text-brand-600 hover:text-brand-700 text-[13px] font-medium cursor-pointer bg-transparent border-0 p-0 py-1.5"
                  >
                    Change password
                  </button>
                }
              />
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
  // Fix B: inline backgroundColor guarantees both ON (#0077CC) and OFF (#CBD5E1) render
  // reliably regardless of Tailwind JIT pickup for bg-brand-600 / bg-slate-300.
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      style={{ backgroundColor: on ? '#0077CC' : '#CBD5E1' }}
      className="relative w-[42px] h-6 rounded-full shrink-0 transition-colors duration-150 border-0 p-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
