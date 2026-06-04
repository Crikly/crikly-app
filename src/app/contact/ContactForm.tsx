'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'

// CONTACT-01: interactive form. Server-side render mounts this client
// component inside src/app/contact/page.tsx (server component owns
// metadata + chrome). All form state lives here.

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

  if (state === 'success') {
    return <SuccessCard email={submittedEmail} />
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      data-testid="contact-form"
      className="flex flex-col gap-5"
    >
      {/* Honeypot — off-screen so it stays hidden from humans + screen
          readers but bots auto-fill it. Tab order skipped. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }}>
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

      <Field label="Full name" htmlFor="name" error={errors.name}>
        <input
          id="name"
          type="text"
          required
          value={fields.name}
          onChange={(e) => update('name', e.target.value)}
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
          autoComplete="email"
          aria-describedby={errors.email ? 'email-error' : undefined}
          aria-invalid={errors.email ? true : undefined}
          className={inputClass(!!errors.email)}
        />
      </Field>

      <Field label="Subject" htmlFor="subject" error={errors.subject}>
        <select
          id="subject"
          required
          value={fields.subject}
          onChange={(e) => update('subject', e.target.value)}
          aria-describedby={errors.subject ? 'subject-error' : undefined}
          aria-invalid={errors.subject ? true : undefined}
          className={`${inputClass(!!errors.subject)} appearance-none bg-white`}
        >
          <option value="" disabled>
            Choose a subject…
          </option>
          {SUBJECTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Message" htmlFor="message" error={errors.message}>
        <textarea
          id="message"
          required
          rows={6}
          value={fields.message}
          onChange={(e) => update('message', e.target.value)}
          aria-describedby={errors.message ? 'message-error' : undefined}
          aria-invalid={errors.message ? true : undefined}
          className={`${inputClass(!!errors.message)} min-h-[140px] resize-y py-3`}
        />
      </Field>

      <button
        type="submit"
        disabled={state === 'submitting'}
        aria-busy={state === 'submitting'}
        data-testid="contact-submit"
        className="inline-flex h-12 items-center justify-center gap-2 rounded-[12px] border-0 bg-brand-600 px-6 text-[15px] font-medium text-white transition-all hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {state === 'submitting' && (
          <Loader2 size={16} strokeWidth={2.4} className="animate-spin" />
        )}
        {state === 'submitting' ? 'Sending…' : 'Send message'}
      </button>

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
        className="mb-1.5 block text-sm font-medium text-gray-900"
      >
        {label}
      </label>
      {children}
      {error && (
        <p id={`${htmlFor}-error`} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

function inputClass(hasError: boolean): string {
  return [
    'block w-full rounded-[10px] border bg-white px-3.5 text-[15px] text-gray-900',
    'h-input-desktop max-md:h-input-mobile',
    'outline-none transition-shadow placeholder:text-neutral-400',
    'focus:shadow-focus',
    hasError ? 'border-danger' : 'border-neutral-100 focus:border-brand-600',
  ].join(' ')
}

function SuccessCard({ email }: { email: string }) {
  return (
    <div
      role="status"
      className="flex flex-col items-start gap-3 rounded-2xl border border-brand-100 bg-brand-50/40 p-6"
    >
      <CheckCircle2 size={28} strokeWidth={2} className="text-brand-600" />
      <h2 className="text-lg font-semibold text-gray-900">Message sent!</h2>
      <p className="text-sm leading-relaxed text-neutral-700">
        We&apos;ll get back to you at{' '}
        <span className="font-medium text-gray-900">{email}</span> within 1–2 business
        days.
      </p>
    </div>
  )
}
