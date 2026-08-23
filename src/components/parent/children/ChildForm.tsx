'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { User } from 'lucide-react'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import { CriklyAvatar } from '@/components/ui/CriklyAvatar'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { firstNameOf } from '@/constants/childIdentity'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import type { ChildFormInitialValues, SportOption } from './types'

// P-07 (Screens 08 + 09): shared add/edit child form from the approved
// Parent Flow v2 design. Step 0 decisions applied:
//   B — no colour picker, no avatar cycling, no photo upload; identity
//       colour comes in via props (index-derived), avatar seed = first name
//   C — optional "Safety note for coaches" textarea → medical_notes
//   D — required: name + DOB only; gender optional; sport optional with
//       skill required once a sport is selected (single sport in v1 — the
//       API accepts many, the approved design shows one)
//   E — gender pills Boy / Girl / Prefer not to say
//   F — DOB must be a past date, age under 16 (Player-account copy)
// Screen 09 remove = inline two-button confirmation (window.confirm is
// forbidden). DOB uses a native date input on purpose: its value is a plain
// YYYY-MM-DD string (no Date conversion, so the BST hazard that motivated
// ui/DatePicker.tsx doesn't apply) and ui/DatePicker only steps
// month-by-month — unusable for a date ~10 years back.

const GENDER_OPTIONS = [
  { label: 'Boy', value: 'male' },
  { label: 'Girl', value: 'female' },
  { label: 'Prefer not to say', value: 'prefer_not_to_say' },
] as const

const SKILL_OPTIONS = ['beginner', 'intermediate', 'advanced'] as const
type SkillOption = (typeof SKILL_OPTIONS)[number]

const CHILD_MAX_AGE_EXCLUSIVE = 16
const TOO_OLD_MESSAGE = `Children must be under ${CHILD_MAX_AGE_EXCLUSIVE}. If they're ${CHILD_MAX_AGE_EXCLUSIVE} or over, they can create their own Player account.`

function skillLabel(skill: string): string {
  return skill.charAt(0).toUpperCase() + skill.slice(1)
}

/** Whole-year age from a YYYY-MM-DD string; NaN-safe for partial input. */
function ageFromDob(dob: string, today: Date): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null
  const [year = 0, month = 0, day = 0] = dob.split('-').map(Number)
  let age = today.getFullYear() - year
  const birthdayPassed =
    today.getMonth() + 1 > month ||
    (today.getMonth() + 1 === month && today.getDate() >= day)
  if (!birthdayPassed) age -= 1
  return age
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

interface ChildFormProps {
  mode: 'create' | 'edit'
  sports: SportOption[]
  /** Identity colour for this child (index-derived, never randomised). */
  colour: string
  initial?: ChildFormInitialValues
}

export function ChildForm({ mode, sports, colour, initial }: ChildFormProps) {
  const router = useRouter()
  const prefersReduced = usePrefersReducedMotion()
  const rootRef = useRef<HTMLDivElement>(null)
  const avatarRef = useRef<HTMLDivElement>(null)

  const [name, setName] = useState(initial?.fullName ?? '')
  const [dob, setDob] = useState(initial?.dateOfBirth ?? '')
  const [gender, setGender] = useState<string | null>(initial?.gender ?? null)
  const [sportId, setSportId] = useState<string | null>(initial?.sportId ?? null)
  const [skill, setSkill] = useState<SkillOption | null>(
    initial?.skillLevel && SKILL_OPTIONS.includes(initial.skillLevel as SkillOption)
      ? (initial.skillLevel as SkillOption)
      : null,
  )
  const [notes, setNotes] = useState(initial?.medicalNotes ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const firstName = firstNameOf(name)
  const today = useMemo(() => new Date(), [])
  const todayStr = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`

  const age = ageFromDob(dob, today)
  const dobError =
    age === null
      ? null
      : age < 0
        ? 'Date of birth must be in the past'
        : age >= CHILD_MAX_AGE_EXCLUSIVE
          ? TOO_OLD_MESSAGE
          : null

  const ready =
    firstName.length > 0 &&
    age !== null &&
    dobError === null &&
    (sportId === null || skill !== null)

  // Mount choreography: form rows fade up staggered (design note: "sections
  // fade up staggered"). Skipped under reduced motion.
  useGSAP(
    () => {
      if (prefersReduced || !rootRef.current) return
      // clearProps scoped to the tweened properties only — 'all' wipes the
      // whole inline style attribute (see the ChildProfileCard hero bug).
      gsap.from('[data-form-row]', {
        y: 16,
        opacity: 0,
        duration: 0.35,
        stagger: 0.06,
        ease: 'power2.out',
        clearProps: 'transform,opacity',
      })
    },
    { scope: rootRef },
  )

  // Avatar cross-fades 200ms as the DiceBear seed changes with the name.
  useGSAP(
    () => {
      if (prefersReduced || !avatarRef.current) return
      gsap.fromTo(
        avatarRef.current,
        { opacity: 0.3 },
        { opacity: 1, duration: 0.2, ease: 'power1.out', clearProps: 'opacity' },
      )
    },
    { scope: rootRef, dependencies: [firstName], revertOnUpdate: false },
  )

  const selectSport = (id: string) => {
    if (sportId === id) {
      // Sport is optional — tapping the active pill deselects it.
      setSportId(null)
      setSkill(null)
      return
    }
    setSportId(id)
  }

  const buildPayload = () => ({
    full_name: name.trim(),
    date_of_birth: dob,
    gender,
    medical_notes: notes.trim().length > 0 ? notes.trim() : null,
    sports: sportId && skill ? [{ sport_id: sportId, skill_level: skill }] : [],
  })

  const handleSubmit = async () => {
    if (!ready || submitting) return
    setSubmitting(true)
    setServerError(null)
    try {
      const url = mode === 'create' ? '/api/children' : `/api/children/${initial?.id}`
      const res = await fetch(url, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })
      const body = (await res.json()) as {
        id?: string
        error?: string
        details?: string[]
      }
      if (!res.ok) {
        setServerError(body.details?.join(' ') || body.error || 'Something went wrong. Please try again.')
        setSubmitting(false)
        return
      }
      const childId = mode === 'create' ? body.id : initial?.id
      router.push(childId ? `/parent/children/${childId}` : '/parent/dashboard')
      router.refresh()
    } catch {
      setServerError("We couldn't save this right now. Check your connection and try again.")
      setSubmitting(false)
    }
  }

  const handleRemove = async () => {
    if (removing || !initial?.id) return
    setRemoving(true)
    setServerError(null)
    try {
      const res = await fetch(`/api/children/${initial.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        setServerError(body.error || "We couldn't remove this profile. Please try again.")
        setRemoving(false)
        return
      }
      router.push('/parent/dashboard')
      router.refresh()
    } catch {
      setServerError("We couldn't remove this profile. Check your connection and try again.")
      setRemoving(false)
    }
  }

  const ctaLabel =
    mode === 'edit'
      ? 'Save changes'
      : firstName
        ? `Add ${firstName} to your account`
        : 'Add your child to your account'

  return (
    <div ref={rootRef} className="mx-auto flex w-full max-w-lg flex-col gap-6 pb-28">
      {/* Avatar preview — generates live from the first name (Screen 08). */}
      <div data-form-row className="flex flex-col items-center gap-2">
        <div ref={avatarRef}>
          {firstName ? (
            <CriklyAvatar
              seed={firstName}
              style="adventurer"
              size={72}
              ringColor={colour}
              ringWidth={3}
              alt={`${firstName}'s avatar`}
            />
          ) : (
            <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-neutral-100">
              <User size={30} className="text-neutral-400" aria-hidden />
            </span>
          )}
        </div>
        <span className="text-sm text-neutral-400">
          Their avatar and colour appear automatically.
        </span>
      </div>

      <div data-form-row>
        <Input
          label="First name"
          placeholder="e.g. Kiran"
          value={name}
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
          data-testid="child-name-input"
        />
      </div>

      {/* DOB + gender share a row from sm up (approved Screen 08 layout);
          the 375px mobile design stacks them. */}
      <div data-form-row className="grid grid-cols-1 gap-6 sm:grid-cols-[1fr_auto] sm:gap-5">
        <Input
          label="Date of birth"
          type="date"
          value={dob}
          max={todayStr}
          onChange={(event) => setDob(event.target.value)}
          error={dobError ?? undefined}
          data-testid="child-dob-input"
        />
        <fieldset className="flex flex-col gap-1.5">
          <legend className="tracking-label mb-1.5 text-xs font-semibold uppercase text-[#64748B]">
            Gender <span className="font-normal normal-case tracking-normal text-neutral-400">optional</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {GENDER_OPTIONS.map((option) => {
              const active = gender === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  data-testid={`gender-${option.value}`}
                  onClick={() => setGender(active ? null : option.value)}
                  className={`min-h-[44px] rounded-md px-4 text-base font-medium transition-all duration-150 ${
                    active
                      ? 'bg-neutral-900 text-white shadow-sm'
                      : 'bg-white text-neutral-600 shadow-sm hover:shadow-md'
                  }`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </fieldset>
      </div>

      <fieldset data-form-row className="flex flex-col gap-1.5">
        <legend className="tracking-label mb-1.5 text-xs font-semibold uppercase text-[#64748B]">
          Sport <span className="font-normal normal-case tracking-normal text-neutral-400">optional</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {sports.map((sport) => {
            const active = sportId === sport.id
            return (
              <button
                key={sport.id}
                type="button"
                aria-pressed={active}
                data-testid={`sport-${sport.id}`}
                onClick={() => selectSport(sport.id)}
                className={`min-h-[44px] rounded-md px-5 text-base font-medium transition-all duration-150 ${
                  active
                    ? 'bg-neutral-900 text-white shadow-sm'
                    : 'bg-white text-neutral-600 shadow-sm hover:shadow-md'
                }`}
              >
                {sport.name}
              </button>
            )
          })}
        </div>
      </fieldset>

      {sportId !== null && (
        <fieldset data-form-row className="flex flex-col gap-1.5">
          <legend className="tracking-label mb-1.5 text-xs font-semibold uppercase text-[#64748B]">
            Skill level
          </legend>
          {/* P-07 fix: three equal-width pills on one row — px-4 flex-wrap
              made "Advanced" wrap at 375px and disappear behind the fixed
              CTA bar. flex-1 keeps them inside the container at any width. */}
          <div className="flex gap-2">
            {SKILL_OPTIONS.map((option) => {
              const active = skill === option
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={active}
                  data-testid={`skill-${option}`}
                  onClick={() => setSkill(option)}
                  className={`min-h-[44px] flex-1 rounded-md px-2 text-center text-base font-medium transition-all duration-150 sm:flex-none sm:px-4 ${
                    active
                      ? 'text-white shadow-sm'
                      : 'bg-white text-neutral-600 shadow-sm hover:shadow-md'
                  }`}
                  // Identity colour on the active skill pill (design Screen 08)
                  // — inline style is the documented childIdentity exception.
                  style={active ? { backgroundColor: colour } : undefined}
                >
                  {skillLabel(option)}
                </button>
              )
            })}
          </div>
        </fieldset>
      )}

      <div data-form-row className="flex flex-col gap-1.5">
        <label
          htmlFor="child-safety-note"
          className="tracking-label text-xs font-semibold uppercase text-[#64748B]"
        >
          Safety note for coaches <span className="font-normal normal-case tracking-normal text-neutral-400">optional</span>
        </label>
        <textarea
          id="child-safety-note"
          value={notes}
          maxLength={500}
          rows={3}
          placeholder="Allergies, medical conditions, anything their coach should know"
          onChange={(event) => setNotes(event.target.value)}
          data-testid="child-safety-note"
          className="w-full rounded-[10px] border border-neutral-100 bg-[#F8FAFC] px-[14px] py-3 text-base text-neutral-900 transition-colors placeholder:text-neutral-400 focus:border-brand-600 focus:bg-white focus:shadow-[0_0_0_3px_rgba(0,119,204,0.18)] focus:outline-none"
        />
        <span className="text-sm text-neutral-400">
          Only coaches with a confirmed booking can see this.
        </span>
      </div>

      {serverError && (
        <p role="alert" data-testid="child-form-error" className="text-sm text-danger">
          {serverError}
        </p>
      )}

      {mode === 'edit' ? (
        <div data-form-row className="flex flex-col gap-4">
          <Button
            onClick={handleSubmit}
            disabled={!ready}
            loading={submitting}
            data-testid="child-form-submit"
          >
            Save changes
          </Button>

          {confirmingRemove ? (
            // Screen 09: inline glass confirmation — never window.confirm.
            <div
              data-testid="remove-confirm"
              className="flex flex-col gap-3 rounded-lg bg-white p-5 shadow-md"
            >
              <p className="text-base font-semibold text-neutral-900">
                Remove {firstName || 'this child'} from your account?
                <span className="block font-normal text-neutral-600">
                  This cannot be undone.
                </span>
              </p>
              <div className="flex gap-3">
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={handleRemove}
                  loading={removing}
                  data-testid="remove-confirm-yes"
                >
                  Yes, remove
                </Button>
                <Button
                  variant="ghost"
                  className="flex-1 bg-neutral-50"
                  onClick={() => setConfirmingRemove(false)}
                  disabled={removing}
                  data-testid="remove-confirm-cancel"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingRemove(true)}
              data-testid="remove-child-button"
              className="min-h-[44px] text-sm font-medium text-danger opacity-70 transition-opacity hover:opacity-100"
            >
              Remove {firstName || 'this child'}
            </button>
          )}
        </div>
      ) : (
        // Screen 08: fixed CTA bar with the live label.
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-neutral-100 bg-white/85 px-4 py-4 backdrop-blur-md">
          <div className="mx-auto w-full max-w-lg">
            <Button
              onClick={handleSubmit}
              disabled={!ready}
              loading={submitting}
              className="w-full"
              data-testid="child-form-submit"
            >
              {ctaLabel}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function ChildFormSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-lg animate-pulse flex-col gap-6">
      <div className="mx-auto h-[72px] w-[72px] rounded-full bg-neutral-100" />
      <div className="h-12 rounded-[10px] bg-neutral-100" />
      <div className="h-12 rounded-[10px] bg-neutral-100" />
      <div className="h-12 w-2/3 rounded-[10px] bg-neutral-100" />
      <div className="h-24 rounded-[10px] bg-neutral-100" />
    </div>
  )
}
