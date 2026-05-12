'use client'
import { useState, useEffect } from 'react'
import { Copy, Check, Mail, QrCode } from 'lucide-react'

interface ShareLinkPanelProps {
  slug: string
}

/**
 * BUG-GO-LIVE-MODAL-SHARE: extracted from CoachLayoutClient's inline share
 * modal so it can be reused inside ProfileEdit's Go Live celebration modal.
 * Renders the URL strip + Copy button + 5-channel social icon row — the
 * modal chrome (overlay, close X, heading) stays with each caller.
 *
 * Copy-to-clipboard auto-clear timer (1.5s) is owned inside the component
 * so consumers don't need to manage it.
 */
export function ShareLinkPanel({ slug }: ShareLinkPanelProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])

  const profileUrl = slug ? `https://crikly.app/${slug}` : 'https://crikly.app'
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`Book a session with me on Crikly: ${profileUrl}`)}`
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(profileUrl)}`
  const emailUrl = `mailto:?subject=${encodeURIComponent('Book a session with me')}&body=${encodeURIComponent(`Hi! Book a session with me on Crikly: ${profileUrl}`)}`

  const handleCopy = () => {
    // Fire "Copied!" feedback only on actual success — the prior implementation
    // set copied=true synchronously, which falsely indicated success even when
    // clipboard.writeText rejected (e.g. permissions denied, iframe restrictions).
    navigator.clipboard.writeText(profileUrl)
      .then(() => setCopied(true))
      .catch(() => { /* clipboard may be blocked — feedback is suppressed */ })
  }

  return (
    <>
      {/* URL strip + Copy button */}
      <div className="flex flex-col gap-2.5 mb-8">
        <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-[14px] p-2 pl-4">
          <span className="text-[15px] text-gray-600 font-medium truncate mr-3">crikly.app{slug ? `/${slug}` : ''}</span>
          <button
            type="button"
            onClick={handleCopy}
            aria-live="polite"
            className="bg-white border border-gray-200 text-gray-900 px-4 py-2 rounded-[10px] font-bold text-[13px] shadow-sm hover:bg-gray-50 flex items-center gap-1.5 shrink-0"
          >
            {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy</>}
          </button>
        </div>
      </div>

      {/* 5-channel social row */}
      <div className="flex justify-between items-start">
        {/* WhatsApp */}
        <button
          type="button"
          onClick={() => window.open(whatsappUrl, '_blank', 'noopener')}
          className="flex flex-col items-center gap-2.5 cursor-pointer group w-[64px] bg-transparent p-0 border-0"
        >
          <div className="w-[52px] h-[52px] rounded-2xl bg-green-50 hover:bg-green-100 flex items-center justify-center transition-colors shadow-sm">
            <div className="group-hover:scale-110 transition-transform duration-300">
              <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
              </svg>
            </div>
          </div>
          <span className="text-[11px] font-bold text-gray-600 text-center leading-tight">WhatsApp</span>
        </button>

        {/* Instagram (copies link — Instagram has no direct share URL) */}
        <button
          type="button"
          onClick={handleCopy}
          title="Link copied — paste on Instagram"
          className="flex flex-col items-center gap-2.5 cursor-pointer group w-[64px] bg-transparent p-0 border-0"
        >
          <div className="w-[52px] h-[52px] rounded-2xl bg-pink-50 hover:bg-pink-100 flex items-center justify-center transition-colors shadow-sm">
            <div className="group-hover:scale-110 transition-transform duration-300">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-pink-600">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
              </svg>
            </div>
          </div>
          <span className="text-[11px] font-bold text-gray-600 text-center leading-tight">Instagram</span>
        </button>

        {/* Facebook */}
        <button
          type="button"
          onClick={() => window.open(facebookUrl, '_blank', 'noopener')}
          className="flex flex-col items-center gap-2.5 cursor-pointer group w-[64px] bg-transparent p-0 border-0"
        >
          <div className="w-[52px] h-[52px] rounded-2xl bg-blue-50 hover:bg-blue-100 flex items-center justify-center transition-colors shadow-sm">
            <div className="group-hover:scale-110 transition-transform duration-300">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-blue-600">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            </div>
          </div>
          <span className="text-[11px] font-bold text-gray-600 text-center leading-tight">Facebook</span>
        </button>

        {/* Email */}
        <button
          type="button"
          onClick={() => window.open(emailUrl, '_blank', 'noopener')}
          className="flex flex-col items-center gap-2.5 cursor-pointer group w-[64px] bg-transparent p-0 border-0"
        >
          <div className="w-[52px] h-[52px] rounded-2xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors shadow-sm">
            <div className="group-hover:scale-110 transition-transform duration-300">
              <Mail size={24} className="text-gray-700" />
            </div>
          </div>
          <span className="text-[11px] font-bold text-gray-600 text-center leading-tight">Email</span>
        </button>

        {/* QR Code (disabled — coming soon) */}
        <button
          type="button"
          disabled
          title="QR Code coming soon"
          className="flex flex-col items-center gap-2.5 cursor-not-allowed group w-[64px] bg-transparent p-0 border-0 opacity-50"
        >
          <div className="w-[52px] h-[52px] rounded-2xl bg-purple-50 flex items-center justify-center shadow-sm">
            <div>
              <QrCode size={24} className="text-purple-600" />
            </div>
          </div>
          <span className="text-[11px] font-bold text-gray-600 text-center leading-tight">QR Code</span>
        </button>
      </div>
    </>
  )
}
