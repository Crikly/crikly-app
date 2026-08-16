'use client'

// P-10 (single-flow rev): the authed parent's "Who is this for?" picker,
// extracted from the retired parallel-route SlotPickerClient so ONE component
// serves every booking context (AvailabilityClient now, P-13 checkout later).
//
// Renders INSTEAD of the guest name/age inputs when the visitor is a
// signed-in parent:
//   - players === 1: ChildSelector (P-07, untouched) — primary child from
//     profiles. In the group context (coach offers group tiers AND the parent
//     has children) the ChildSelector "+" tile bumps the player count instead
//     of navigating to /parent/children/new (capture-phase intercept —
//     next/link skips navigation once default is prevented).
//   - players > 1: ONE row of toggleable child avatars (green success check
//     ring; tap again to deselect) plus a "+" that appends removable guest
//     rows (first name + optional age). Guest players are ONE-SESSION details
//     only — never child profiles, no Supabase write (approved Option C).
//     Selections cap at the player count: at max, unselected avatars dim and
//     the "+" hides.
//
// The component owns its selection state and reports every change through
// `onChange` as a ready-to-stash summary (PlayerAssignment[] — the
// sessionStorage handoff shape; identities never belong in a URL, docs/06).
// The HOST owns pricing, the slot, the CTA, and error timing: it disables its
// CTA until `primaryAssigned` and, on a click with `isComplete` false, sets
// `showError` (mirrors the guest flow's click-time name gate). `onChange` is
// held in a latest-callback ref, so inline (non-memoized) handlers are safe.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Plus, X } from 'lucide-react'
import type { GroupPriceTiers } from '@/lib/coach/group-pricing'
import { playerCountOptions } from '@/lib/booking/authed-booking-pricing'
import type { PlayerAssignment } from '@/lib/booking/authed-booking-handoff'
import {
  ChildSelector,
  type ChildSelectorOption,
} from '@/components/parent/children/ChildSelector'
import { CriklyAvatar } from '@/components/ui/CriklyAvatar'

/** Server-assembled context for authed booking (null host prop = guest). */
export interface AuthedBookingContext {
  /** Parent's child profiles, assembled server-side (COPPA — never fetched
   * client-side). Empty for a parent with no children yet. */
  childrenList: ChildSelectorOption[]
  sessionTypes: string[]
  maxGroupSize: number | null
  groupPriceTiers: GroupPriceTiers | null
}

/** What the host receives on every selection change. */
export interface PlayerPickerSelection {
  /** Total players (1 = 1-on-1). Drives the host's group-tier pricing. */
  players: number
  /** Primary child's profile id — 1-on-1 pick, or the first pool child. */
  childProfileId?: string
  /** players > 1: children first (selection order), then guest rows —
   * the sessionStorage handoff shape, ready to stash. */
  playerAssignments?: PlayerAssignment[]
  /** CTA-enable rule: at least one player selected or named. */
  primaryAssigned: boolean
  /** Book-time rule: primary assigned AND every added guest row named. */
  isComplete: boolean
}

interface AuthedPlayerPickerProps {
  context: AuthedBookingContext
  /** Host sets true on a Book attempt with isComplete false — shows the
   * inline per-field + banner errors (guest-flow click-time gate pattern). */
  showError: boolean
  /** Called whenever the selection changes (latest-callback ref internally —
   * inline handlers are safe). */
  onChange: (selection: PlayerPickerSelection) => void
}

// Selected-avatar ring/badge colour — the --success design token (#1A7A4A;
// bg-success in Tailwind). CriklyAvatar's ringColor prop takes a colour
// value, same as ChildSelector passing child.colour.
const SUCCESS_GREEN = '#1A7A4A'

/** A guest player row — ONE-SESSION details only. `key` is a local render key
 * so removing a middle row never re-associates input state. */
interface GuestRowState {
  key: number
  firstName: string
  age: string
}

export function AuthedPlayerPicker({
  context,
  showError,
  onChange,
}: AuthedPlayerPickerProps) {
  const [players, setPlayers] = useState(1)
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null)
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>([])
  const [guests, setGuests] = useState<GuestRowState[]>([])
  const nextGuestKey = useRef(1)

  // Latest-callback ref: the report effect below must fire on SELECTION
  // changes only — keeping onChange out of its deps makes the component safe
  // against hosts that pass a non-memoized inline lambda (no render loop).
  // Declared before the report effect so the ref is fresh when both run.
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const childById = useMemo(
    () => new Map(context.childrenList.map((child) => [child.id, child])),
    [context.childrenList],
  )

  const playerOptions = useMemo(
    () =>
      playerCountOptions(
        context.sessionTypes,
        context.maxGroupSize,
        context.groupPriceTiers,
      ),
    [context.sessionTypes, context.maxGroupSize, context.groupPriceTiers],
  )
  const offersGroups = playerOptions.length > 1

  // Pool cap: profile children + guest rows never exceed the player count.
  const totalSelected = selectedChildIds.length + guests.length
  const atMax = players > 1 && totalSelected >= players

  const primaryAssigned =
    players === 1
      ? selectedChildId !== null
      : selectedChildIds.length > 0 || guests.some((g) => g.firstName.trim() !== '')
  const isComplete =
    players === 1
      ? selectedChildId !== null
      : primaryAssigned && guests.every((g) => g.firstName.trim() !== '')

  // Report every selection change upward as the ready-to-stash summary.
  useEffect(() => {
    const selection: PlayerPickerSelection = {
      players,
      primaryAssigned,
      isComplete,
    }
    if (players === 1) {
      if (selectedChildId) selection.childProfileId = selectedChildId
    } else {
      if (selectedChildIds[0]) selection.childProfileId = selectedChildIds[0]
      selection.playerAssignments = [
        ...selectedChildIds.map((id): PlayerAssignment => {
          const child = childById.get(id)
          return {
            kind: 'child',
            childProfileId: id,
            firstName: child?.firstName ?? '',
            age: child ? String(child.age) : '',
          }
        }),
        ...guests.map(
          (g): PlayerAssignment => ({
            kind: 'guest',
            firstName: g.firstName.trim(),
            age: g.age,
          }),
        ),
      ]
    }
    onChangeRef.current(selection)
  }, [
    players,
    selectedChildId,
    selectedChildIds,
    guests,
    primaryAssigned,
    isComplete,
    childById,
  ])

  const makeGuestRow = (): GuestRowState => ({
    key: nextGuestKey.current++,
    firstName: '',
    age: '',
  })

  // ── Handlers (ported unchanged from the retired SlotPickerClient) ──────────

  const selectPlayers = (count: number) => {
    // Selection is sticky across the 1 ↔ group toggle, and the pool is
    // trimmed to the new cap when the count shrinks (children keep priority
    // over guest rows, both in selection order).
    if (count > 1) {
      let kids = selectedChildIds
      if (players === 1 && selectedChildId && !kids.includes(selectedChildId)) {
        kids = [selectedChildId, ...kids]
      }
      kids = kids.slice(0, count)
      setSelectedChildIds(kids)
      setGuests(guests.slice(0, Math.max(0, count - kids.length)))
    } else if (count === 1 && players > 1) {
      // Collapse the pool to the primary so a later group re-entry starts
      // from truth — a stale pool would silently resurrect players the
      // parent deselected (or replaced) while in 1-on-1 mode.
      const primary = selectedChildIds[0] ?? selectedChildId
      setSelectedChildId(primary ?? null)
      setSelectedChildIds(primary ? [primary] : [])
      setGuests([])
    }
    setPlayers(count)
  }

  const handleChildSelect = (childId: string) => {
    setSelectedChildId(childId)
    // Keep the pool in lockstep while in 1-on-1 mode — a later group
    // re-entry must seed from the CURRENT primary, not a stale pool.
    setSelectedChildIds([childId])
  }

  const toggleChild = (childId: string) => {
    setSelectedChildIds((prev) => {
      if (prev.includes(childId)) return prev.filter((id) => id !== childId)
      // At the cap the avatar renders disabled, but guard anyway.
      if (prev.length + guests.length >= players) return prev
      return [...prev, childId]
    })
  }

  const addGuest = () => {
    if (totalSelected >= players) return
    setGuests((prev) => [...prev, makeGuestRow()])
  }

  const removeGuest = (key: number) => {
    setGuests((prev) => prev.filter((guest) => guest.key !== key))
  }

  const updateGuest = (
    key: number,
    patch: Partial<{ firstName: string; age: string }>,
  ) => {
    setGuests((prev) =>
      prev.map((guest) => (guest.key === key ? { ...guest, ...patch } : guest)),
    )
  }

  // Group context: when the coach offers group sessions and the parent
  // already has children, the ChildSelector "+" tile (1-on-1 mode only) means
  // "add another player to THIS session" — bump the player count instead of
  // navigating to /parent/children/new. With NO children the default
  // add-child navigation stands (a parent must create their first child
  // profile). Capture-phase intercept because ChildSelector (P-07) is reused
  // untouched; next/link skips navigation once default is prevented.
  const handleAddTileCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!offersGroups || context.childrenList.length === 0) return
    const target = event.target as Element
    if (!target.closest('[data-testid="child-selector-add"]')) return
    event.preventDefault()
    const next = playerOptions.find((count) => count > players)
    if (next !== undefined) selectPlayers(next)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3" data-testid="authed-player-picker">
      {/* Player count — only when the coach has group pricing tiers. */}
      {offersGroups && (
        <div>
          <h4 className="text-[13px] font-semibold uppercase tracking-wide text-gray-500 mb-2.5">
            How many players?
          </h4>
          <div className="flex items-center gap-2.5">
            {playerOptions.map((count) => {
              const isSel = players === count
              return (
                <button
                  key={count}
                  type="button"
                  onClick={() => selectPlayers(count)}
                  aria-pressed={isSel}
                  aria-label={`${count} ${count === 1 ? 'player' : 'players'}`}
                  data-testid={`player-count-${count}`}
                  className={`flex h-11 w-12 items-center justify-center rounded-xl border-[1.5px] text-base font-semibold tabular-nums transition-all ${
                    isSel
                      ? 'bg-brand-600 border-brand-600 text-white shadow-sm'
                      : 'bg-white border-gray-300 text-gray-900 hover:border-brand-600 hover:bg-brand-50'
                  }`}
                >
                  {count}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {players === 1 ? (
        <div onClickCapture={handleAddTileCapture}>
          <ChildSelector
            childrenList={context.childrenList}
            selectedChildId={selectedChildId}
            onSelect={handleChildSelect}
          />
          {showError && !primaryAssigned && (
            <p
              className="text-[12px] text-danger mt-2.5"
              role="alert"
              data-testid="player-picker-error"
            >
              Choose who this session is for to continue.
            </p>
          )}
        </div>
      ) : (
        <>
          <span className="text-base font-medium text-neutral-900">
            Who is this session for?
          </span>

          <div
            role="group"
            aria-label="Who is this session for?"
            className="flex items-start gap-4 overflow-x-auto pb-1"
          >
            {context.childrenList.map((child) => {
              const selected = selectedChildIds.includes(child.id)
              const dimmed = !selected && atMax
              return (
                <button
                  key={child.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={dimmed}
                  onClick={() => toggleChild(child.id)}
                  data-testid={`select-child-${child.id}`}
                  className={`flex min-w-[72px] flex-col items-center gap-2 ${
                    dimmed ? 'opacity-40 cursor-not-allowed' : ''
                  }`}
                >
                  <span className="relative inline-block">
                    <CriklyAvatar
                      seed={child.firstName}
                      style="adventurer"
                      size={56}
                      ringColor={selected ? SUCCESS_GREEN : child.colour}
                      ringWidth={selected ? 3 : 1.5}
                      alt={`${child.firstName}, age ${child.age}`}
                    />
                    {selected && (
                      <span
                        className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-success text-white"
                        aria-hidden
                      >
                        <Check size={12} strokeWidth={3} />
                      </span>
                    )}
                  </span>
                  <span
                    className={`text-sm text-neutral-900 ${
                      selected ? 'font-bold' : 'font-normal'
                    }`}
                  >
                    {child.firstName}
                  </span>
                </button>
              )
            })}

            {!atMax && (
              <button
                type="button"
                onClick={addGuest}
                aria-label="Add a guest player"
                data-testid="add-guest-player"
                className="flex min-w-[72px] flex-col items-center gap-2"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full border-[1.5px] border-dashed border-neutral-400 bg-white">
                  <Plus size={22} className="text-neutral-400" aria-hidden />
                </span>
                <span className="text-sm text-neutral-600">Add player</span>
              </button>
            )}
          </div>

          {/* Below the avatar row (Lasith fix, 16 Aug): rendering this line
              above it made the avatars jump vertically when the player count
              toggled between 1 and 2+. */}
          <p className="text-[13px] text-gray-500">
            Guest players are for this session only — no profile needed.
          </p>

          {guests.map((guest, index) => {
            const guestNumber = index + 1
            const nameMissing = showError && !guest.firstName.trim()
            return (
              <div
                key={guest.key}
                className="grid grid-cols-[1fr_84px_auto] items-end gap-3 rounded-xl border border-gray-200 p-4"
                data-testid={`guest-row-${guestNumber}`}
              >
                <div>
                  <label
                    htmlFor={`guest-${guest.key}-name`}
                    className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5"
                  >
                    First name
                  </label>
                  <input
                    id={`guest-${guest.key}-name`}
                    type="text"
                    autoComplete="off"
                    placeholder="e.g. Sam"
                    value={guest.firstName}
                    onChange={(e) => updateGuest(guest.key, { firstName: e.target.value })}
                    aria-invalid={nameMissing}
                    aria-describedby={
                      showError && !isComplete ? 'player-picker-error' : undefined
                    }
                    data-testid={`guest-name-${guestNumber}`}
                    className={`w-full h-11 px-3.5 rounded-xl bg-gray-50 border text-[15px] text-gray-900 placeholder:text-gray-400 outline-none focus:bg-white focus:border-brand-600 transition-all ${
                      nameMissing ? 'border-danger' : 'border-gray-200'
                    }`}
                  />
                </div>
                <div>
                  <label
                    htmlFor={`guest-${guest.key}-age`}
                    className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5"
                  >
                    Age
                  </label>
                  <select
                    id={`guest-${guest.key}-age`}
                    value={guest.age}
                    onChange={(e) => updateGuest(guest.key, { age: e.target.value })}
                    data-testid={`guest-age-${guestNumber}`}
                    className="w-full h-11 px-3 rounded-xl bg-gray-50 border border-gray-200 text-[15px] text-gray-900 outline-none focus:bg-white focus:border-brand-600 transition-all"
                  >
                    <option value="">–</option>
                    {Array.from({ length: 16 }, (_, i) => i + 3).map((age) => (
                      <option key={age} value={age}>{age}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => removeGuest(guest.key)}
                  aria-label={`Remove guest player ${guestNumber}`}
                  data-testid={`remove-guest-${guestNumber}`}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            )
          })}

          {showError && !isComplete && (
            <p
              id="player-picker-error"
              className="text-[12px] text-danger"
              role="alert"
              data-testid="player-picker-error"
            >
              {primaryAssigned
                ? 'Add each guest player’s first name to continue.'
                : 'Choose a player or add their name to continue.'}
            </p>
          )}
        </>
      )}
    </div>
  )
}
