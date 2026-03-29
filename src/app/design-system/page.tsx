import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'
import { Toast } from '@/components/ui/Toast'
import { Skeleton } from '@/components/ui/Skeleton'

export default function DesignSystemPage() {
  if (process.env.NODE_ENV === 'production') {
    return null
  }

  return (
    <main className="min-h-screen bg-neutral-50 p-8">
      <div className="max-w-4xl mx-auto space-y-12">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-semibold text-neutral-900 tracking-heading">
            Crikly Design System
          </h1>
          <p className="text-base text-neutral-600 mt-2">
            B2 Sky Blue · DM Sans · Trust-first
          </p>
        </div>

        {/* Colours */}
        <section>
          <h2 className="text-xl font-medium text-neutral-900 mb-4">Colours</h2>
          <div className="grid grid-cols-6 gap-2">
            {[50, 100, 400, 600, 800, 900].map((shade) => (
              <div key={shade}>
                <div className={`h-12 rounded-md bg-brand-${shade} border border-neutral-100`} />
                <p className="text-xs text-neutral-600 mt-1 text-center">brand-{shade}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4">
            {['50', '600', '800'].map((shade) => (
              <div key={shade}>
                <div className={`h-12 rounded-md bg-teal-${shade} border border-neutral-100`} />
                <p className="text-xs text-neutral-600 mt-1 text-center">teal-{shade}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2 mt-4">
            {(['success', 'warning', 'danger', 'info'] as const).map((name) => (
              <div key={name}>
                <div className={`h-12 rounded-md bg-${name} border border-neutral-100`} />
                <p className="text-xs text-neutral-600 mt-1 text-center">{name}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Typography */}
        <section>
          <h2 className="text-xl font-medium text-neutral-900 mb-4">Typography — DM Sans</h2>
          <div className="space-y-3 bg-white rounded-lg p-6 border border-neutral-100">
            <p className="text-3xl font-semibold tracking-heading">Heading 3xl — Find a coach</p>
            <p className="text-2xl font-semibold tracking-heading">Heading 2xl — Book a session</p>
            <p className="text-xl font-medium">Heading xl — Your bookings</p>
            <p className="text-lg font-medium">Label lg — Ravi Kumar</p>
            <p className="text-base">Body — Browse verified coaches in your area and book instantly.</p>
            <p className="text-sm text-neutral-600">Secondary — Sessions completed · 48 reviews</p>
            <p className="text-xs text-neutral-400 uppercase tracking-label">Caption — DBS VERIFIED</p>
          </div>
        </section>

        {/* Buttons */}
        <section>
          <h2 className="text-xl font-medium text-neutral-900 mb-4">Buttons</h2>
          <Card>
            <div className="flex flex-wrap gap-3">
              <Button variant="primary">Book session</Button>
              <Button variant="secondary">View profile</Button>
              <Button variant="destructive">Cancel booking</Button>
              <Button variant="ghost">Skip for now</Button>
              <Button variant="primary" loading>Loading...</Button>
              <Button variant="primary" disabled>Disabled</Button>
            </div>
            <div className="flex flex-wrap gap-3 mt-4">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </div>
          </Card>
        </section>

        {/* Inputs */}
        <section>
          <h2 className="text-xl font-medium text-neutral-900 mb-4">Inputs</h2>
          <Card>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Full name" placeholder="Your full name" />
              <Input label="Email" placeholder="you@example.com" type="email" />
              <Input label="Password" placeholder="8+ characters" type="password" />
              <Input label="Date of birth" placeholder="DD / MM / YYYY" />
              <Input
                label="Email"
                placeholder="you@example.com"
                error="Please enter a valid email address"
              />
              <Input
                label="Postcode"
                placeholder="SW1A 1AA"
                hint="Used to find coaches near you"
              />
            </div>
          </Card>
        </section>

        {/* Cards */}
        <section>
          <h2 className="text-xl font-medium text-neutral-900 mb-4">Cards</h2>
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <p className="text-sm font-medium text-neutral-900">Standard card</p>
              <p className="text-sm text-neutral-600 mt-1">Border, no shadow</p>
            </Card>
            <Card elevated>
              <p className="text-sm font-medium text-neutral-900">Elevated card</p>
              <p className="text-sm text-neutral-600 mt-1">Shadow, no border</p>
            </Card>
          </div>
        </section>

        {/* Coach Card Example */}
        <section>
          <h2 className="text-xl font-medium text-neutral-900 mb-4">Coach card — real usage</h2>
          <Card className="max-w-sm">
            <div className="flex items-center gap-3">
              <Avatar name="Ravi Kumar" size="md" />
              <div className="flex-1 min-w-0">
                <p className="text-lg font-medium text-neutral-900">Ravi Kumar</p>
                <p className="text-sm text-neutral-600">Cricket · Oval, London</p>
              </div>
              <Badge variant="dbs">DBS verified</Badge>
            </div>
            <div className="mt-4 space-y-2 border-t border-neutral-100 pt-4">
              <div className="flex justify-between">
                <span className="text-sm text-neutral-600">Rate</span>
                <span className="text-sm font-medium text-neutral-900">£55.00 / session</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-neutral-600">Rating</span>
                <span className="text-sm font-medium text-neutral-900">4.9 (48 reviews)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-neutral-600">Next available</span>
                <span className="text-sm font-medium text-neutral-900">Tomorrow, 10am</span>
              </div>
            </div>
            <Button variant="primary" className="w-full mt-4">Book session</Button>
          </Card>
        </section>

        {/* Badges */}
        <section>
          <h2 className="text-xl font-medium text-neutral-900 mb-4">Badges</h2>
          <Card>
            <div className="flex flex-wrap gap-3">
              <Badge variant="dbs">DBS verified</Badge>
              <Badge variant="premium">Premium</Badge>
              <Badge variant="confirmed">Confirmed</Badge>
              <Badge variant="cancelled">Cancelled</Badge>
              <Badge variant="default">New</Badge>
            </div>
          </Card>
        </section>

        {/* Avatars */}
        <section>
          <h2 className="text-xl font-medium text-neutral-900 mb-4">Avatars</h2>
          <Card>
            <div className="flex items-end gap-4">
              <Avatar name="Ravi Kumar" size="sm" />
              <Avatar name="Sarah Mitchell" size="md" />
              <Avatar name="James Chen" size="lg" />
              <Avatar name="Ravi Kumar" size="md" src="https://i.pravatar.cc/44" />
            </div>
          </Card>
        </section>

        {/* Loading states */}
        <section>
          <h2 className="text-xl font-medium text-neutral-900 mb-4">Loading states</h2>
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <p className="text-sm text-neutral-600 mb-3">Spinners</p>
              <div className="flex items-end gap-4">
                <Spinner size="sm" />
                <Spinner size="md" />
                <Spinner size="lg" />
              </div>
            </Card>
            <Card>
              <p className="text-sm text-neutral-600 mb-3">Skeleton</p>
              <Skeleton className="h-4 w-3/4 mb-2" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-1/2" />
            </Card>
          </div>
        </section>

        {/* Toast */}
        <section>
          <h2 className="text-xl font-medium text-neutral-900 mb-4">Toasts</h2>
          <div className="space-y-3">
            <Toast message="Booking confirmed. Ravi will be at Oval tomorrow at 10am." type="success" />
            <Toast message="Payment failed. Please try a different card." type="error" />
            <Toast message="Cancellation window closes in 2 hours." type="warning" />
            <Toast message="Your profile is 80% complete." type="info" />
          </div>
        </section>

      </div>
    </main>
  )
}
