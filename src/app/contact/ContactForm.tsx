'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Check,
  ChevronDown,
  Loader2,
  Lock,
  MessageSquare,
} from 'lucide-react'

// CONTACT-02 (S-10 visual redesign). Form state + validation + honeypot
// + field IDs + data-testid + aria-* preserved exactly from CONTACT-01.
// Visual chrome (form card shell, input styling, success card) restyled
// per S-10. The API contract at /api/contact is unchanged.

type FormState = 'idle' | 'submitting' | 'success' | 'error'

const SUBJECTS = [
  "I'm a coach and need help",
  'I want to book a coach',
  'Technical issue',
  'Partnership enquiry',
  'Something else',
] as const

interface FormFields {
  name: string
  email: string
  subject: string
  message: string
  // Honeypot — bots auto-fill; humans never see/touch this field.
  company: string
}

interface FieldErrors {
  name?: string
  email?: string
  subject?: string
  message?: string
}

export function ContactForm() {
  const [fields, setFields] = useState<FormFields>({
    name: '',
    email: '',
    subject: '',
    message: '',
    company: '',
  })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [state, setState] = useState<FormState>('idle')
  const [submittedEmail, setSubmittedEmail] = useState('')

  const update = <K extends keyof FormFields>(key: K, value: FormFields[K]) => {
    setFields((f) => ({ ...f, [key]: value }))
    if (errors[key as keyof FieldErrors]) {
      setErrors((e) => ({ ...e, [key]: undefined }))
    }
  }

  const validate = (): boolean => {
    const next: FieldErrors = {}
    if (!fields.name.trim()) next.name = 'Please tell us your name'
    if (!fields.email.trim()) next.email = 'Please enter your email address'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) {
      next.email = 'Please enter a valid email address'
    }
    if (!fields.subject) next.subject = 'Please choose a subject'
    if (!fields.message.trim()) next.message = 'Please add a message'
    else if (fields.message.trim().length < 20) {
      next.message = 'Message must be at least 20 characters'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (state === 'submitting') return
    if (!validate()) return
    setState('submitting')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fields.name.trim(),
          email: fields.email.trim(),
          subject: fields.subject,
          message: fields.message.trim(),
          company: fields.company,
        }),
      })
      if (!res.ok) {
        setState('error')
        return
      }
      setSubmittedEmail(fields.email.trim())
      setState('success')
    } catch {
      setState('error')
    }
  }

  return (
    <div className="rounded-3xl border border-neutral-100 bg-white p-10 shadow-[0_24px_60px_rgba(15,23,42,0.10)] max-md:rounded-xl max-md:p-7">
      {state === 'success' ? (
        <SuccessCard email={submittedEmail} />
      ) : (
        <>
          <div className="mb-6">
            <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-gray-900">
              Send us a message
            </h2>
            <p className="mt-2 max-w-[46ch] text-[15px] leading-[1.55] text-neutral-600">
              Tell us what&apos;s on your mind and we&apos;ll point you to the right
              person.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            noValidate
            data-testid="contact-form"
            className="flex flex-col gap-5"
          >
            {/* Honeypot — off-screen so it stays hidden from humans + screen
                readers but bots auto-fill it. Tab order skipped. */}
            <div
              aria-hidden="true"
              style={{ position: 'absolute', left: '-9999px' }}
            >
              <label>
                Company
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={fields.company}
                  onChange={(e) => update('company', e.target.value)}
                />
              </label>
            </div>

            {/* Name + Email — 2-col on ≥sm, stacked below */}
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Your name" htmlFor="name" error={errors.name}>
                <input
                  id="name"
                  type="text"
                  required
                  value={fields.name}
                  onChange={(e) => update('name', e.target.value)}
                  placeholder="e.g. Alex Morgan"
                  autoComplete="name"
                  aria-describedby={errors.name ? 'name-error' : undefined}
                  aria-invalid={errors.name ? true : undefined}
                  className={inputClass(!!errors.name)}
                />
              </Field>

              <Field label="Email address" htmlFor="email" error={errors.email}>
                <input
                  id="email"
                  type="email"
                  required
                  value={fields.email}
                  onChange={(e) => update('email', e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  aria-describedby={errors.email ? 'email-error' : undefined}
                  aria-invalid={errors.email ? true : undefined}
                  className={inputClass(!!errors.email)}
                />
              </Field>
            </div>

            <Field
              label="What's this about?"
              htmlFor="subject"
              error={errors.subject}
            >
              <SubjectDropdown
                value={fields.subject}
                onChange={(v) => update('subject', v)}
                hasError={!!errors.subject}
              />
            </Field>

            <Field label="Your message" htmlFor="message" error={errors.message}>
              <textarea
                id="message"
                required
                rows={6}
                value={fields.message}
                onChange={(e) => update('message', e.target.value)}
                placeholder="Tell us a bit more — the more detail, the better we can help."
                aria-describedby={errors.message ? 'message-error' : undefined}
                aria-invalid={errors.message ? true : undefined}
                className={`${inputClass(!!errors.message)} min-h-[140px] resize-y py-3.5 leading-[1.55]`}
              />
            </Field>

            <button
              type="submit"
              disabled={state === 'submitting'}
              aria-busy={state === 'submitting'}
              data-testid="contact-submit"
              className="mt-1 inline-flex h-14 items-center justify-center gap-2.5 self-start rounded-full border-0 bg-brand-600 px-7 text-[16px] font-medium text-white transition-all hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 max-sm:self-stretch"
            >
              {state === 'submitting' ? (
                <>
                  <Loader2 size={18} strokeWidth={2.4} className="animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  Send message
                  <ArrowRight size={18} strokeWidth={2.2} />
                </>
              )}
            </button>

            <div className="mt-0.5 flex items-center gap-2 text-[13px] text-neutral-500">
              <Lock
                size={15}
                strokeWidth={2}
                className="shrink-0 text-teal-600"
              />
              We&apos;ll only use your email to reply. No newsletters, promise.
            </div>

            {state === 'error' && (
              <p role="alert" className="text-sm leading-relaxed text-danger">
                Something went wrong. Please email us directly at{' '}
                <a
                  href="mailto:crikly@teklysolutions.com"
                  className="font-medium text-brand-600 underline"
                >
                  crikly@teklysolutions.com
                </a>
                .
              </p>
            )}
          </form>
        </>
      )}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string
  htmlFor: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.05em] text-neutral-500"
      >
        {label}
      </label>
      {children}
      {error && (
        <p
          id={`${htmlFor}-error`}
          className="mt-1.5 text-[12.5px] text-danger"
        >
          {error}
        </p>
      )}
    </div>
  )
}

function inputClass(hasError: boolean): string {
  return [
    'block w-full rounded-[12px] border-[1.5px] bg-neutral-50 px-4 text-[15px] text-gray-900',
    'h-[52px]',
    'outline-none transition-all placeholder:text-neutral-400',
    'focus:bg-white focus:shadow-focus',
    hasError ? 'border-danger bg-white' : 'border-neutral-100 focus:border-brand-600',
  ].join(' ')
}

// ─── Custom subject dropdown ─────────────────────────────────────────────────

// Replaces the native <select> with a styled listbox matching the S-10
// design. value + onChange + hasError are the same contract as the old
// select. Keyboard: Arrow Up/Down move focus, Enter selects, Escape
// closes. Click-outside closes via document mousedown listener.
function SubjectDropdown({
  value,
  onChange,
  hasError,
}: {
  value: string
  onChange: (v: string) => void
  hasError: boolean
}) {
  const [open, setOpen] = useState(false)
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on click outside.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        triggerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return
      }
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Keyboard handlers (active only while open).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedIdx((i) => Math.min(SUBJECTS.length - 1, i + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedIdx((i) => Math.max(0, i - 1))
      } else if (e.key === 'Enter' && focusedIdx >= 0) {
        e.preventDefault()
        onChange(SUBJECTS[focusedIdx])
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, focusedIdx, onChange])

  const handleToggle = () => {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    // On open, focus the selected option (or the first if none selected).
    const idx = value ? SUBJECTS.indexOf(value as (typeof SUBJECTS)[number]) : 0
    setFocusedIdx(idx >= 0 ? idx : 0)
  }

  const activeId =
    open && focusedIdx >= 0 ? `subject-opt-${focusedIdx}` : undefined

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        id="subject"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="subject-listbox"
        aria-describedby={hasError ? 'subject-error' : undefined}
        aria-invalid={hasError ? true : undefined}
        aria-activedescendant={activeId}
        onClick={handleToggle}
        className={`flex h-[52px] w-full items-center justify-between gap-2 rounded-[12px] border-[1.5px] bg-neutral-50 px-4 text-left text-[15px] outline-none transition-all focus:bg-white focus:shadow-focus ${
          hasError ? 'border-danger bg-white' : 'border-neutral-100 focus:border-brand-600'
        }`}
      >
        <span className={value ? 'text-gray-900' : 'text-neutral-400'}>
          {value || 'Choose a topic…'}
        </span>
        <ChevronDown
          size={18}
          strokeWidth={2}
          className={`shrink-0 text-neutral-500 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div
          ref={panelRef}
          id="subject-listbox"
          role="listbox"
          aria-label="Subject options"
          className="absolute left-0 right-0 z-20 mt-1.5 overflow-hidden rounded-2xl border border-neutral-100 bg-white py-1 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
        >
          {SUBJECTS.map((s, i) => {
            const isSelected = s === value
            const isFocused = i === focusedIdx
            return (
              <button
                key={s}
                id={`subject-opt-${i}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setFocusedIdx(i)}
                onClick={() => {
                  onChange(s)
                  setOpen(false)
                  triggerRef.current?.focus()
                }}
                className={`flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left text-[15px] transition-colors ${
                  isSelected
                    ? 'bg-brand-50 font-medium text-brand-600'
                    : isFocused
                      ? 'bg-neutral-50 text-gray-900'
                      : 'text-gray-900 hover:bg-neutral-50'
                }`}
              >
                <MessageSquare
                  size={16}
                  strokeWidth={2}
                  className="shrink-0 text-brand-600"
                />
                {s}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SuccessCard({ email }: { email: string }) {
  return (
    <div role="status" className="px-4 py-7 text-center max-md:px-2">
      <div className="mx-auto mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-teal-50 text-teal-600">
        <Check size={34} strokeWidth={2.4} />
      </div>
      <h3 className="text-[24px] font-semibold tracking-[-0.02em] text-gray-900">
        Message sent — thank you.
      </h3>
      <p className="mx-auto mt-3 max-w-[42ch] text-[15.5px] leading-[1.6] text-neutral-600">
        We&apos;ve got your message and a real person will reply within 1–2 business
        days at{' '}
        <span className="font-semibold text-gray-900">{email}</span>.
      </p>
    </div>
  )
}
