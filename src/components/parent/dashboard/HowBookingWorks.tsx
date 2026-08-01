// P-04-A (Screen 06): conditional first-timer strip — the parent
// component only renders this when the parent has zero lifetime bookings.
// Footer energy: small, light, 3 numbered steps.

const STEPS = [
  {
    title: 'Find a coach',
    copy: 'Browse verified coaches near you and compare profiles.',
  },
  {
    title: 'Book instantly',
    copy: 'Pick a time that works — bookings confirm on payment.',
  },
  {
    title: 'Turn up and play',
    copy: 'Your coach handles the rest. Pay securely through Crikly.',
  },
]

export function HowBookingWorks() {
  return (
    <section data-testid="how-booking-works">
      <h2 className="text-lg font-semibold tracking-heading text-neutral-900">
        How booking works
      </h2>
      <div className="mt-4 flex flex-col gap-6 md:flex-row md:gap-8">
        {STEPS.map((step, index) => (
          <div key={step.title} className="flex items-start gap-3 md:flex-1">
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
              {index + 1}
            </span>
            <div>
              <p className="text-sm font-medium text-neutral-900">
                {step.title}
              </p>
              <p className="mt-0.5 text-sm text-neutral-600">{step.copy}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
