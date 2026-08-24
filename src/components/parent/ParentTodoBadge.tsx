'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import {
  CalendarClock,
  Link as LinkIcon,
  ListTodo,
  UserPlus,
  X,
  type LucideIcon,
} from 'lucide-react'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import type {
  ParentTodoItem,
  ParentTodoResponse,
  ParentTodoType,
} from '@/app/api/parent/todo/route'

// P-06 (REQ-P-009): the parent To-Do badge — a 40px round trigger in the
// AppShell's parent context with a brand count dot. Tapping opens the
// action list: a 400px dropdown on md+, a slide-up bottom sheet below md
// (approved design "Parent To-Do Badge", count-bubble variant).
//
// Every condition is decided by GET /api/parent/todo — this component
// never guesses. The badge renders nothing at count 0, and re-fetches on
// every route change so a resolved action disappears as soon as the
// parent lands back in the module (the endpoint is Cache-Control:
// no-store). Items resolve server-side only, so an open panel always has
// ≥1 row — the design's "All caught up" state is unreachable here and
// deliberately not built.

// Static copy per action type (design rows verbatim). The API sends only
// { type, href } — no child data ever crosses the wire.
const TODO_COPY: Record<
  ParentTodoType,
  { icon: LucideIcon; title: string; desc: string; cta: string }
> = {
  add_child: {
    icon: UserPlus,
    title: 'Add a child',
    desc: "You haven't added a child profile yet.",
    cta: 'Add now',
  },
  complete_booking: {
    icon: CalendarClock,
    title: 'Finish your booking',
    desc: "You started a booking but didn't finish.",
    cta: 'Continue',
  },
  link_bookings: {
    icon: LinkIcon,
    title: 'Link past bookings',
    desc: 'You have guest bookings to link to this account.',
    cta: 'Link bookings',
  },
}

function TodoRow({
  item,
  onNavigate,
  padding,
}: {
  item: ParentTodoItem
  onNavigate: () => void
  /** Design: 12px row padding in the dropdown, 14px in the sheet. */
  padding: 'py-3' | 'py-3.5'
}) {
  const copy = TODO_COPY[item.type]
  const Icon = copy.icon
  return (
    <div
      className={`flex items-center gap-3 ${padding}`}
      data-testid={`todo-item-${item.type}`}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50">
        <Icon size={20} aria-hidden className="text-brand-600" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium text-slate-900">{copy.title}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-slate-500">
          {copy.desc}
        </p>
      </div>
      <Link
        href={item.href}
        role="menuitem"
        onClick={onNavigate}
        className="shrink-0 text-[13px] font-medium text-brand-600 no-underline transition-colors hover:text-brand-800"
      >
        {copy.cta}
      </Link>
    </div>
  )
}

export function ParentTodoBadge() {
  const pathname = usePathname()
  const [items, setItems] = useState<ParentTodoItem[]>([])
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const prefersReduced = usePrefersReducedMotion()

  // Re-fetch on every route change: the AppShell persists across parent
  // navigations, so this is what makes a resolved action disappear.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/parent/todo')
        if (!res.ok) return
        const data = (await res.json()) as ParentTodoResponse
        if (!cancelled) setItems(data.items)
      } catch {
        // Advisory chrome — a failed fetch just leaves the badge as-is.
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [pathname])

  // Panels stay mounted so the close animation can play (RolePill /
  // ProfilePopover convention); inert blocks focus while closed.
  useGSAP(
    () => {
      const dropdown = dropdownRef.current
      const backdrop = backdropRef.current
      const sheet = sheetRef.current
      if (!dropdown || !backdrop || !sheet) return

      if (prefersReduced) {
        gsap.set([dropdown, backdrop], { opacity: open ? 1 : 0 })
        gsap.set(sheet, { yPercent: 0, opacity: open ? 1 : 0 })
        return
      }

      if (open) {
        gsap.fromTo(
          dropdown,
          { opacity: 0, y: 6 },
          { opacity: 1, y: 0, duration: 0.15, ease: 'power2.out' },
        )
        gsap.fromTo(
          backdrop,
          { opacity: 0 },
          { opacity: 1, duration: 0.2, ease: 'power2.out' },
        )
        gsap.fromTo(
          sheet,
          { yPercent: 100, opacity: 1 },
          { yPercent: 0, duration: 0.25, ease: 'power3.out' },
        )
      } else {
        gsap.to(dropdown, { opacity: 0, y: 6, duration: 0.12, ease: 'power2.in' })
        gsap.to(backdrop, { opacity: 0, duration: 0.15, ease: 'power2.in' })
        gsap.to(sheet, {
          yPercent: 100,
          duration: 0.2,
          ease: 'power2.in',
        })
      }
    },
    { dependencies: [open, prefersReduced], scope: containerRef },
  )

  // Close on outside tap/click — container includes trigger + panels.
  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const count = items.length
  // Badge only exists while ≥1 action does (BR of the brief) — and the
  // hooks above must run unconditionally before this early return.
  if (count === 0) return null

  const countLabel = `${count} remaining`
  const renderRows = (padding: 'py-3' | 'py-3.5') =>
    items.map((item) => (
      <TodoRow
        key={item.type}
        item={item}
        padding={padding}
        onNavigate={() => setOpen(false)}
      />
    ))

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Things to do"
        data-testid="parent-todo-badge"
        className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-[0_1px_3px_rgba(15,23,42,0.12)] transition-colors hover:bg-slate-50 active:scale-[0.98]"
      >
        <ListTodo size={20} aria-hidden className="text-slate-600" />
        <span
          data-testid="parent-todo-count"
          className="absolute -right-[3px] -top-[3px] box-border flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-600 px-[5px] text-[11px] font-semibold text-white"
        >
          {count}
        </span>
      </button>

      {/* Desktop (md+): dropdown anchored under the trigger. */}
      <div
        ref={dropdownRef}
        role="menu"
        aria-hidden={!open}
        inert={!open}
        data-testid="parent-todo-dropdown"
        className={`absolute right-0 top-full z-50 mt-2 hidden w-[400px] rounded-xl bg-white px-5 pb-3 pt-2 opacity-0 shadow-[0_12px_32px_rgba(15,23,42,0.12)] md:block ${
          open ? '' : 'pointer-events-none'
        }`}
      >
        <div className="pb-0.5 pt-2">
          <p className="text-[17px] font-semibold tracking-heading text-slate-900">
            To do
          </p>
          <p className="mt-0.5 text-[13px] text-slate-500">{countLabel}</p>
        </div>
        {renderRows('py-3')}
      </div>

      {/* Mobile (<md): backdrop + bottom sheet sliding up. */}
      <div
        ref={backdropRef}
        aria-hidden
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-slate-900/30 opacity-0 md:hidden ${
          open ? '' : 'pointer-events-none'
        }`}
      />
      <div
        ref={sheetRef}
        role="menu"
        aria-hidden={!open}
        inert={!open}
        data-testid="parent-todo-sheet"
        className={`fixed inset-x-0 bottom-0 z-50 rounded-t-[20px] bg-white px-5 pb-8 pt-2.5 opacity-0 shadow-[0_12px_32px_rgba(15,23,42,0.12)] md:hidden ${
          open ? '' : 'pointer-events-none'
        }`}
      >
        <div className="mx-auto mb-3.5 h-1 w-9 rounded-full bg-slate-200" aria-hidden />
        <div className="mb-1.5 flex items-start justify-between">
          <div>
            <p className="text-[19px] font-semibold tracking-heading text-slate-900">
              To do
            </p>
            <p className="mt-0.5 text-[13px] text-slate-500">{countLabel}</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-slate-50"
          >
            <X size={18} aria-hidden className="text-slate-500" />
          </button>
        </div>
        {renderRows('py-3.5')}
      </div>
    </div>
  )
}
