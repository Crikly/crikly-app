'use client'

import { useState } from 'react'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { InterestForm } from '@/components/marketing/InterestForm'

// ---- Data ---------------------------------------------------------------

const STEPS = [
  {
    num: 'Step 1',
    title: 'Build your profile',
    body: 'Add your sport, qualifications, DBS status, and price. Takes 10 minutes.',
  },
  {
    num: 'Step 2',
    title: 'Set your availability',
    body: 'Choose your weekly schedule. Parents book into your slots — no back and forth.',
  },
  {
    num: 'Step 3',
    title: 'Start earning',
    body: 'Paid directly to your bank within 48 hours of each session. No chasing payments.',
  },
]

const EARN = [
  {
    stat: '£600',
    statSmall: '/ wk',
    label: 'At £75 per session, eight sessions a week.',
  },
  {
    stat: '£0',
    statSmall: '/ mo',
    label: 'Monthly fee. Free to list, no setup costs, no contracts.',
  },
  {
    stat: '48 hr',
    statSmall: '',
    label: 'Payout to your bank after each session, via Stripe.',
  },
]

const QUOTES = [
  {
    text: '"I used to lose hours every Sunday chasing parents for payment and rescheduling sessions. Crikly handles all of that. I just turn up and coach."',
    initials: 'RK',
    name: 'Ravi Kumar',
    sub: 'Cricket coach · Oval, London · 84 sessions',
    avatarBg: '#E6F3FB',
    avatarColor: '#1E3A5F',
  },
  {
    text: '"The 48-hour payout is the thing. I\'m not waiting three weeks to get paid for work I did last Saturday. It changes how you run a coaching business."',
    initials: 'SM',
    name: 'Sarah Mitchell',
    sub: 'Tennis coach · Clapham, London · 51 sessions',
    avatarBg: '#E6F3FB',
    avatarColor: '#1E3A5F',
  },
]

const FAQS = [
  {
    q: 'Do I need to be DBS checked to join?',
    a: 'No — but coaches with a verified DBS badge receive significantly more bookings. We offer checks through the platform.',
  },
  {
    q: 'How does payment work?',
    a: 'Parents pay at booking. You receive your full fee within 48 hours of each session completing, directly to your bank via Stripe.',
  },
  {
    q: 'Can I set my own prices?',
    a: 'Yes, entirely. You set your rate per sport. Different rates for group sessions if you offer them.',
  },
]

// ---- Component ----------------------------------------------------------

export default function ForCoachesPage() {
  const [showInterest, setShowInterest] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  function toggleFaq(idx: number) {
    setOpenFaq(prev => (prev === idx ? null : idx))
  }

  return (
    <>
      {showInterest && (
        <InterestForm
          mode="modal"
          initialRole="coach"
          onClose={() => setShowInterest(false)}
        />
      )}

      {/* ---- Hero ---- */}
      <section style={{ padding: '88px 40px 72px', maxWidth: '1100px', margin: '0 auto' }}>
        <div
          className="font-medium uppercase tracking-widest"
          style={{ fontSize: '11px', color: '#0077CC', marginBottom: '16px', letterSpacing: '0.08em' }}
        >
          For coaches
        </div>

        <h1
          className="font-medium"
          style={{
            fontSize: 'clamp(36px, 5vw, 56px)',
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
            color: '#0F172A',
            margin: '0 0 28px',
            maxWidth: '640px',
          }}
        >
          For coaches who shape players.
        </h1>

        <p
          style={{
            fontSize: '17px',
            color: '#475569',
            lineHeight: 1.65,
            maxWidth: '520px',
            margin: '0 0 16px',
          }}
        >
          You spend your evenings coaching, your mornings replying to &ldquo;is Saturday still on?&rdquo;, your weekends chasing payments and refunds. The admin eats the time you should be spending on the players in front of you.
        </p>

        <p
          style={{
            fontSize: '17px',
            color: '#475569',
            lineHeight: 1.65,
            maxWidth: '520px',
            margin: '0 0 36px',
          }}
        >
          Crikly handles the rest. Bookings, payments, schedules, no-shows — managed automatically so your time goes back to the work that actually matters.
        </p>

        <div className="flex items-center flex-wrap" style={{ gap: '18px' }}>
          <button
            onClick={() => setShowInterest(true)}
            className="inline-flex items-center font-medium"
            style={{
              height: '56px',
              padding: '0 28px',
              background: '#0077CC',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              fontFamily: 'inherit',
              fontSize: '16px',
              cursor: 'pointer',
              gap: '8px',
              transition: 'background 150ms',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = '#005EA3')}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = '#0077CC')}
          >
            Register your interest
            <ArrowRight size={16} strokeWidth={2.4} />
          </button>

          <span style={{ fontSize: '12px', color: '#94A3B8' }}>
            <strong style={{ fontWeight: 500, color: '#64748B' }}>Free to list</strong>
            {' · '}
            <strong style={{ fontWeight: 500, color: '#64748B' }}>No monthly fees</strong>
            {' · '}
            <strong style={{ fontWeight: 500, color: '#64748B' }}>Paid within 48 hours</strong>
          </span>
        </div>
      </section>

      {/* ---- How it works ---- */}
      <section
        id="how"
        style={{
          padding: '72px 40px',
          maxWidth: '1100px',
          margin: '0 auto',
          borderTop: '0.5px solid #F1F5F9',
        }}
      >
        <SectionLabel>How it works</SectionLabel>
        <h2
          className="font-medium"
          style={{ fontSize: '32px', letterSpacing: '-0.025em', color: '#0F172A', margin: '0 0 12px', maxWidth: '600px' }}
        >
          Three steps from sign-up to first booking.
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: '32px', marginTop: '32px' }}>
          {STEPS.map((step, i) => (
            <div key={i}>
              <div
                className="font-medium uppercase flex items-center"
                style={{
                  fontSize: '11px',
                  color: '#0077CC',
                  letterSpacing: '0.08em',
                  marginBottom: '14px',
                  gap: '12px',
                }}
              >
                <div style={{ width: '28px', height: '1px', background: '#BFDBFE', flexShrink: 0 }} />
                {step.num}
              </div>
              <h3
                className="font-medium"
                style={{
                  fontSize: '19px',
                  color: '#0F172A',
                  letterSpacing: '-0.01em',
                  margin: '0 0 10px',
                }}
              >
                {step.title}
              </h3>
              <p style={{ fontSize: '14px', color: '#475569', lineHeight: 1.55, margin: 0 }}>
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ---- Earnings ---- */}
      <div style={{ background: '#F8FAFC', borderTop: '0.5px solid #F1F5F9', borderBottom: '0.5px solid #F1F5F9' }}>
        <section style={{ padding: '72px 40px', maxWidth: '1100px', margin: '0 auto' }}>
          <SectionLabel>What you could earn</SectionLabel>
          <h2
            className="font-medium"
            style={{ fontSize: '32px', letterSpacing: '-0.025em', color: '#0F172A', margin: '0 0 12px', maxWidth: '600px' }}
          >
            Real numbers, not promises.
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: '16px', marginTop: '24px' }}>
            {EARN.map((item, i) => (
              <div
                key={i}
                style={{
                  background: '#fff',
                  border: '1px solid #F1F5F9',
                  borderRadius: '8px',
                  padding: '24px',
                }}
              >
                <div
                  className="font-medium"
                  style={{ fontSize: '28px', letterSpacing: '-0.025em', color: '#0F172A', margin: '0 0 6px' }}
                >
                  {item.stat}
                  {item.statSmall && (
                    <span style={{ fontSize: '14px', color: '#64748B', fontWeight: 400 }}>
                      {' '}{item.statSmall}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: '#475569', lineHeight: 1.5 }}>
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ---- Testimonials ---- */}
      <section style={{ padding: '72px 40px', maxWidth: '1100px', margin: '0 auto' }}>
        <SectionLabel>What coaches say</SectionLabel>
        <h2
          className="font-medium"
          style={{ fontSize: '32px', letterSpacing: '-0.025em', color: '#0F172A', margin: '0 0 12px', maxWidth: '600px' }}
        >
          Built with coaches, for coaches.
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: '20px', marginTop: '24px' }}>
          {QUOTES.map((q, i) => (
            <div
              key={i}
              style={{
                border: '0.5px solid #F1F5F9',
                borderRadius: '14px',
                padding: '24px',
              }}
            >
              <p
                style={{
                  fontSize: '14px',
                  color: '#0F172A',
                  fontStyle: 'italic',
                  lineHeight: 1.6,
                  margin: '0 0 18px',
                }}
              >
                {q.text}
              </p>
              <div className="flex items-center" style={{ gap: '12px' }}>
                <div
                  className="inline-flex items-center justify-center font-medium flex-shrink-0"
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: q.avatarBg,
                    color: q.avatarColor,
                    fontSize: '13px',
                  }}
                >
                  {q.initials}
                </div>
                <div>
                  <div className="font-medium" style={{ fontSize: '14px', color: '#0F172A' }}>
                    {q.name}
                  </div>
                  <div style={{ fontSize: '12px', color: '#475569' }}>{q.sub}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---- FAQ ---- */}
      <section style={{ padding: '0 40px 72px', maxWidth: '1100px', margin: '0 auto' }}>
        <SectionLabel>Frequently asked</SectionLabel>
        <h2
          className="font-medium"
          style={{ fontSize: '32px', letterSpacing: '-0.025em', color: '#0F172A', margin: '0 0 12px', maxWidth: '600px' }}
        >
          A few quick answers.
        </h2>

        <div style={{ marginTop: '24px', maxWidth: '720px' }}>
          {FAQS.map((item, idx) => {
            const isOpen = openFaq === idx
            return (
              <div key={idx} style={{ borderBottom: '0.5px solid #F1F5F9', padding: '14px 0' }}>
                <button
                  onClick={() => toggleFaq(idx)}
                  className="w-full text-left flex items-center justify-between font-medium"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    fontFamily: 'inherit',
                    fontSize: '15px',
                    color: '#0F172A',
                    padding: '8px 0',
                    cursor: 'pointer',
                    gap: '16px',
                  }}
                >
                  {item.q}
                  <ChevronDown
                    size={16}
                    strokeWidth={2}
                    style={{
                      color: isOpen ? '#0077CC' : '#94A3B8',
                      transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 200ms cubic-bezier(0.22,1,0.36,1), color 200ms',
                      flexShrink: 0,
                    }}
                  />
                </button>

                <div
                  style={{
                    overflow: 'hidden',
                    maxHeight: isOpen ? '200px' : '0',
                    transition: 'max-height 280ms cubic-bezier(0.22,1,0.36,1)',
                  }}
                >
                  <div style={{ padding: '4px 0 14px', fontSize: '14px', color: '#475569', lineHeight: 1.6 }}>
                    {item.a}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ---- Bottom CTA ---- */}
      <section
        className="text-center"
        style={{
          padding: '96px 40px',
          borderTop: '1px solid #F1F5F9',
        }}
      >
        <h2
          className="font-medium"
          style={{
            fontSize: '28px',
            letterSpacing: '-0.02em',
            color: '#0F172A',
            margin: '0 0 12px',
          }}
        >
          Ready to grow your coaching?
        </h2>
        <p style={{ fontSize: '14px', color: '#475569', margin: '0 0 28px' }}>
          Takes 10 minutes to set up. Be first when we launch.
        </p>
        <button
          onClick={() => setShowInterest(true)}
          className="inline-flex items-center font-medium"
          style={{
            height: '56px',
            padding: '0 28px',
            background: '#0077CC',
            color: '#fff',
            border: 'none',
            borderRadius: '10px',
            fontFamily: 'inherit',
            fontSize: '16px',
            cursor: 'pointer',
            gap: '8px',
            transition: 'background 150ms',
          }}
          onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = '#005EA3')}
          onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = '#0077CC')}
        >
          Register your interest
          <ArrowRight size={16} strokeWidth={2.4} />
        </button>
      </section>
    </>
  )
}

// ---- Sub-components -----------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="font-medium uppercase"
      style={{
        fontSize: '11px',
        color: '#64748B',
        letterSpacing: '0.05em',
        marginBottom: '16px',
      }}
    >
      {children}
    </div>
  )
}
