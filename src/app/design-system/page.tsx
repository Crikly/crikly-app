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

          <p className="text-sm text-neutral-600 mb-3">Primary — Sky Blue</p>
          <div className="grid grid-cols-6 gap-2 mb-6">
            {[
              { name: 'brand-50',  hex: '#E6F3FB' },
              { name: 'brand-100', hex: '#B5D4F4' },
              { name: 'brand-400', hex: '#378ADD' },
              { name: 'brand-600', hex: '#0077CC' },
              { name: 'brand-800', hex: '#0C447C' },
              { name: 'brand-900', hex: '#042C53' },
            ].map(({ name, hex }) => (
              <div key={name}>
                <div
                  className="h-12 rounded-md border border-neutral-100"
                  style={{ backgroundColor: hex }}
                />
                <p className="text-xs text-neutral-600 mt-1 text-center">{name}</p>
                <p className="text-xs text-neutral-400 text-center">{hex}</p>
              </div>
            ))}
          </div>

          <p className="text-sm text-neutral-600 mb-3">Secondary — Teal</p>
          <div className="grid grid-cols-3 gap-2 mb-6">
            {[
              { name: 'teal-50',  hex: '#E0F6F8' },
              { name: 'teal-600', hex: '#0099AA' },
              { name: 'teal-800', hex: '#006677' },
            ].map(({ name, hex }) => (
              <div key={name}>
                <div
                  className="h-12 rounded-md border border-neutral-100"
                  style={{ backgroundColor: hex }}
                />
                <p className="text-xs text-neutral-600 mt-1 text-center">{name}</p>
                <p className="text-xs text-neutral-400 text-center">{hex}</p>
              </div>
            ))}
          </div>

          <p className="text-sm text-neutral-600 mb-3">Semantic</p>
          <div className="grid grid-cols-4 gap-2">
            {[
              { name: 'success', hex: '#1A7A4A' },
              { name: 'warning', hex: '#B45309' },
              { name: 'danger',  hex: '#B91C1C' },
              { name: 'info',    hex: '#0077CC' },
            ].map(({ name, hex }) => (
              <div key={name}>
                <div
                  className="h-12 rounded-md border border-neutral-100"
                  style={{ backgroundColor: hex }}
                />
                <p className="text-xs text-neutral-600 mt-1 text-center">{name}</p>
                <p className="text-xs text-neutral-400 text-center">{hex}</p>
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
          <div className="bg-white rounded-lg p-6 border border-neutral-100">
            <div className="flex flex-wrap gap-3 mb-4">
              <button style={{background:'#0077CC',color:'#fff',height:'52px',padding:'0 24px',borderRadius:'10px',fontSize:'15px',fontWeight:500,border:'none',cursor:'pointer',fontFamily:'DM Sans, sans-serif'}}>Book session</button>
              <button style={{background:'transparent',color:'#0077CC',height:'52px',padding:'0 24px',borderRadius:'10px',fontSize:'15px',fontWeight:500,border:'1.5px solid #0077CC',cursor:'pointer',fontFamily:'DM Sans, sans-serif'}}>View profile</button>
              <button style={{background:'#B91C1C',color:'#fff',height:'52px',padding:'0 24px',borderRadius:'10px',fontSize:'15px',fontWeight:500,border:'none',cursor:'pointer',fontFamily:'DM Sans, sans-serif'}}>Cancel booking</button>
              <button style={{background:'transparent',color:'#475569',height:'52px',padding:'0 24px',borderRadius:'10px',fontSize:'15px',fontWeight:500,border:'none',cursor:'pointer',fontFamily:'DM Sans, sans-serif'}}>Skip for now</button>
              <button style={{background:'#0077CC',color:'#fff',height:'52px',padding:'0 24px',borderRadius:'10px',fontSize:'15px',fontWeight:500,border:'none',cursor:'not-allowed',opacity:0.4,fontFamily:'DM Sans, sans-serif'}}>Disabled</button>
            </div>
            <div className="flex flex-wrap gap-3">
              <button style={{background:'#0077CC',color:'#fff',height:'36px',padding:'0 16px',borderRadius:'10px',fontSize:'13px',fontWeight:500,border:'none',cursor:'pointer',fontFamily:'DM Sans, sans-serif'}}>Small</button>
              <button style={{background:'#0077CC',color:'#fff',height:'52px',padding:'0 24px',borderRadius:'10px',fontSize:'15px',fontWeight:500,border:'none',cursor:'pointer',fontFamily:'DM Sans, sans-serif'}}>Medium</button>
              <button style={{background:'#0077CC',color:'#fff',height:'56px',padding:'0 32px',borderRadius:'10px',fontSize:'17px',fontWeight:500,border:'none',cursor:'pointer',fontFamily:'DM Sans, sans-serif'}}>Large</button>
            </div>
          </div>
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
          <div style={{maxWidth:'360px',background:'#fff',border:'0.5px solid #E2E8F0',borderRadius:'14px',padding:'16px',fontFamily:'DM Sans, sans-serif'}}>
            <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'16px'}}>
              <div style={{width:'44px',height:'44px',borderRadius:'50%',background:'#E6F3FB',color:'#0C447C',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:500,flexShrink:0}}>RK</div>
              <div style={{flex:1}}>
                <p style={{fontSize:'17px',fontWeight:500,color:'#0F172A',margin:0}}>Ravi Kumar</p>
                <p style={{fontSize:'13px',color:'#475569',margin:'2px 0 0'}}>Cricket · Oval, London</p>
              </div>
              <span style={{background:'#E0F6F8',color:'#006677',borderRadius:'6px',padding:'3px 8px',fontSize:'11px',fontWeight:500}}>DBS verified</span>
            </div>
            <div style={{borderTop:'0.5px solid #E2E8F0',paddingTop:'12px',display:'flex',flexDirection:'column',gap:'8px'}}>
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <span style={{fontSize:'13px',color:'#475569'}}>Rate</span>
                <span style={{fontSize:'13px',fontWeight:500,color:'#0F172A'}}>£55.00 / session</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <span style={{fontSize:'13px',color:'#475569'}}>Rating</span>
                <span style={{fontSize:'13px',fontWeight:500,color:'#0F172A'}}>4.9 (48 reviews)</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <span style={{fontSize:'13px',color:'#475569'}}>Next available</span>
                <span style={{fontSize:'13px',fontWeight:500,color:'#0F172A'}}>Tomorrow, 10am</span>
              </div>
            </div>
            <button style={{width:'100%',marginTop:'16px',background:'#0077CC',color:'#fff',height:'52px',borderRadius:'10px',fontSize:'15px',fontWeight:500,border:'none',cursor:'pointer',fontFamily:'DM Sans, sans-serif'}}>Book session</button>
          </div>
        </section>

        {/* Badges */}
        <section>
          <h2 className="text-xl font-medium text-neutral-900 mb-4">Badges</h2>
          <div className="bg-white rounded-lg p-6 border border-neutral-100">
            <div className="flex flex-wrap gap-3">
              <span style={{background:'#E0F6F8',color:'#006677',borderRadius:'6px',padding:'3px 8px',fontSize:'11px',fontWeight:500,fontFamily:'DM Sans, sans-serif'}}>DBS verified</span>
              <span style={{background:'#E6F3FB',color:'#0C447C',borderRadius:'6px',padding:'3px 8px',fontSize:'11px',fontWeight:500,fontFamily:'DM Sans, sans-serif'}}>Premium</span>
              <span style={{background:'#dcfce7',color:'#166534',borderRadius:'6px',padding:'3px 8px',fontSize:'11px',fontWeight:500,fontFamily:'DM Sans, sans-serif'}}>Confirmed</span>
              <span style={{background:'#fee2e2',color:'#991b1b',borderRadius:'6px',padding:'3px 8px',fontSize:'11px',fontWeight:500,fontFamily:'DM Sans, sans-serif'}}>Cancelled</span>
              <span style={{background:'#E2E8F0',color:'#475569',borderRadius:'6px',padding:'3px 8px',fontSize:'11px',fontWeight:500,fontFamily:'DM Sans, sans-serif'}}>New</span>
            </div>
          </div>
        </section>

        {/* Avatars */}
        <section>
          <h2 className="text-xl font-medium text-neutral-900 mb-4">Avatars</h2>
          <div className="bg-white rounded-lg p-6 border border-neutral-100">
            <div className="flex items-end gap-4">
              <div style={{width:'28px',height:'28px',borderRadius:'50%',background:'#E6F3FB',color:'#0C447C',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'10px',fontWeight:500,fontFamily:'DM Sans, sans-serif'}}>RK</div>
              <div style={{width:'44px',height:'44px',borderRadius:'50%',background:'#E6F3FB',color:'#0C447C',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:500,fontFamily:'DM Sans, sans-serif'}}>SM</div>
              <div style={{width:'80px',height:'80px',borderRadius:'50%',background:'#E6F3FB',color:'#0C447C',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'20px',fontWeight:500,fontFamily:'DM Sans, sans-serif'}}>JC</div>
            </div>
          </div>
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
