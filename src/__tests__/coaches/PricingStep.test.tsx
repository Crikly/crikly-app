/** @jest-environment jsdom */
// CF-PRICE-01 Phase 3: group session pricing on the coach onboarding pricing
// screen.
//
// Covered:
//   - Group checkbox unchecked / group card hidden for a coach with no saved
//     group data
//   - CRITICAL (Lasith): a legacy pre-P-02 row with 'group' in session_types
//     but group_price_tiers: null renders the checkbox UNCHECKED — checked
//     state derives from group_price_tiers !== null, never session_types
//   - Saved group_price_tiers + max_group_size render checked, correct max
//     size, and correct tier rows
//   - Checking/unchecking the Group checkbox reveals/hides the section and
//     seeds a single 2-player row
//   - "+ Add N-player price" adds the next tier, disappears once every size
//     up to the cap is priced, and lowering the cap trims rows above it
//   - Remove (x) is disabled on the last remaining tier row
//   - Save payload shape for group checked vs unchecked
//   - Save is blocked (no POST) when group is checked with no priced tier
//   - Individual pricing default render is unaffected (light regression)

import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

jest.mock('@/lib/onboarding-cache', () => ({
  fetchCoachProfileCached: jest.fn(),
  fetchSportsListCached: jest.fn(),
  fetchCoachSportsCached: jest.fn(),
  clearCoachSportsCache: jest.fn(),
  clearSessionTypesCache: jest.fn(),
}))

import {
  fetchCoachProfileCached,
  fetchSportsListCached,
  fetchCoachSportsCached,
} from '@/lib/onboarding-cache'
import { PricingStep } from '@/components/coach/onboarding/PricingStep'

// ── Fixtures ─────────────────────────────────────────────────────────────────

interface SportFixture {
  id: string
  name: string
  slug: string
}

interface CoachSportFixture {
  id: string
  sport_id: string
  sport_name: string
  sport_slug: string
  session_types: string[]
  skill_levels: string[]
  age_groups: string[]
  price_individual_pence: number | null
  price_group_pence: number | null
  max_group_size: number | null
  group_price_tiers: Record<string, number> | null
  session_duration_minutes: number
  currency: string
  is_active: boolean
}

const SPORTS: SportFixture[] = [{ id: 'sport-1', name: 'Cricket', slug: 'cricket' }]

const PROFILE = { display_name: 'Alex Stuart', full_name: 'Lasith Jayarathne', avatar_url: null }

// No saved coach_sports rows at all — brand new coach.
const NO_SAVED_SPORTS: { sports: CoachSportFixture[] } = { sports: [] }

// CRITICAL: legacy pre-P-02 row — 'group' sits in session_types but
// group_price_tiers is null. The checkbox must render UNCHECKED.
const LEGACY_GROUP_SPORT: CoachSportFixture = {
  id: 'cs-1',
  sport_id: 'sport-1',
  sport_name: 'Cricket',
  sport_slug: 'cricket',
  session_types: ['individual', 'group'],
  skill_levels: [],
  age_groups: [],
  price_individual_pence: 4000,
  price_group_pence: null,
  max_group_size: 4,
  group_price_tiers: null,
  session_duration_minutes: 60,
  currency: 'GBP',
  is_active: true,
}

// A properly saved (Phase 3) group sport — two priced tiers, cap of 4.
const SAVED_GROUP_SPORT: CoachSportFixture = {
  id: 'cs-2',
  sport_id: 'sport-1',
  sport_name: 'Cricket',
  sport_slug: 'cricket',
  session_types: ['individual', 'group'],
  skill_levels: [],
  age_groups: [],
  price_individual_pence: 4000,
  price_group_pence: null,
  max_group_size: 4,
  group_price_tiers: { '2': 4500, '3': 5500 },
  session_duration_minutes: 60,
  currency: 'GBP',
  is_active: true,
}

// Individual-only sport (group never enabled) — used for the "group
// unchecked" save-payload assertion.
const INDIVIDUAL_ONLY_SPORT: CoachSportFixture = {
  id: 'cs-3',
  sport_id: 'sport-1',
  sport_name: 'Cricket',
  sport_slug: 'cricket',
  session_types: ['individual'],
  skill_levels: [],
  age_groups: [],
  price_individual_pence: 4000,
  price_group_pence: null,
  max_group_size: null,
  group_price_tiers: null,
  session_duration_minutes: 60,
  currency: 'GBP',
  is_active: true,
}

// Group enabled with a single priced tier and a cap of 4 — used to exercise
// the "+ Add N-player price" link and the max-size trim.
const GROUP_ONE_TIER_SPORT: CoachSportFixture = {
  id: 'cs-4',
  sport_id: 'sport-1',
  sport_name: 'Cricket',
  sport_slug: 'cricket',
  session_types: ['individual', 'group'],
  skill_levels: [],
  age_groups: [],
  price_individual_pence: 4000,
  price_group_pence: null,
  max_group_size: 4,
  group_price_tiers: { '2': 4000 },
  session_duration_minutes: 60,
  currency: 'GBP',
  is_active: true,
}

function setUpCoachSports(sports: CoachSportFixture[]): void {
  jest.mocked(fetchCoachSportsCached).mockResolvedValue({ sports })
}

function selectSports(names: string[]): void {
  sessionStorage.setItem('selectedSports', JSON.stringify(names))
}

beforeEach(() => {
  sessionStorage.clear()
  jest.mocked(fetchSportsListCached).mockResolvedValue(SPORTS)
  jest.mocked(fetchCoachProfileCached).mockResolvedValue(PROFILE)
  selectSports(['Cricket'])
})

afterEach(() => {
  jest.clearAllMocks()
})

// ── DOM helpers ──────────────────────────────────────────────────────────────

async function renderLoaded(): Promise<void> {
  render(<PricingStep />)
  // The right-hand "YOUR OFFER" summary panel renders a plain <span>Session
  // types</span> label unconditionally (outside the loading gate), so a
  // plain findByText('Session types') resolves against that immediately and
  // races ahead of the real load. The <h2> heading only renders once
  // `loading` is false — wait for that specifically.
  await screen.findByRole('heading', { name: 'Session types' })
}

function sessionTypeBox(label: 'Individual' | 'Group'): HTMLElement {
  const span = screen.getByText(label, { selector: 'span.capitalize' })
  const row = span.closest('.cursor-pointer')
  if (!row) throw new Error(`could not find clickable row for ${label}`)
  const box = row.querySelector('.rounded-md')
  if (!box) throw new Error(`could not find checkbox box for ${label}`)
  return box as HTMLElement
}

function isSessionTypeChecked(label: 'Individual' | 'Group'): boolean {
  return sessionTypeBox(label).querySelector('svg') !== null
}

function clickSessionType(label: 'Individual' | 'Group'): void {
  fireEvent.click(screen.getByText(label, { selector: 'span.capitalize' }))
}

function groupCard(): HTMLElement {
  return screen.getByText('Group session pricing').closest('.rounded-xl') as HTMLElement
}

function tierRow(card: HTMLElement, size: number): HTMLElement {
  const label = within(card).getByText(`${size} players`, { selector: 'div' })
  const row = label.closest('.flex.items-center.gap-4')
  if (!row) throw new Error(`could not find tier row for size ${size}`)
  return row as HTMLElement
}

// ── 1. No saved group data ──────────────────────────────────────────────────

describe('PricingStep — group checkbox default state (no saved group data)', () => {
  it('renders the Group checkbox unchecked and hides the group pricing card', async () => {
    setUpCoachSports(NO_SAVED_SPORTS.sports)
    await renderLoaded()

    expect(screen.getByText('Group', { selector: 'span.capitalize' })).toBeInTheDocument()
    expect(isSessionTypeChecked('Group')).toBe(false)
    expect(screen.queryByText('Group session pricing')).not.toBeInTheDocument()
  })
})

// ── 2. CRITICAL — legacy row with tiers: null must render unchecked ────────

describe('PricingStep — legacy row: group_price_tiers is the source of truth (CRITICAL)', () => {
  it('renders the checkbox UNCHECKED when session_types has group but group_price_tiers is null', async () => {
    setUpCoachSports([LEGACY_GROUP_SPORT])
    await renderLoaded()

    expect(isSessionTypeChecked('Group')).toBe(false)
    expect(screen.queryByText('Group session pricing')).not.toBeInTheDocument()
  })
})

// ── 2b. Legacy out-of-range max_group_size is clamped ───────────────────────

describe('PricingStep — legacy out-of-range max_group_size (pre-tightening 2-50 era)', () => {
  it('clamps a saved max_group_size of 20 to 6 when the coach enables group', async () => {
    setUpCoachSports([{ ...LEGACY_GROUP_SPORT, max_group_size: 20 }])
    await renderLoaded()

    // Legacy row renders unchecked (tiers null); enabling group must show a
    // valid in-range cap, not an invalid controlled-select value of 20.
    clickSessionType('Group')

    expect((screen.getByLabelText('Max group size') as HTMLSelectElement).value).toBe('6')
  })
})

// ── 3. Saved tiers render checked with correct rows ─────────────────────────

describe('PricingStep — saved group_price_tiers renders checked state', () => {
  it('renders checked, max size 4, and two tier rows with the correct prices', async () => {
    setUpCoachSports([SAVED_GROUP_SPORT])
    await renderLoaded()

    expect(isSessionTypeChecked('Group')).toBe(true)

    const card = groupCard()
    expect((screen.getByLabelText('Max group size') as HTMLSelectElement).value).toBe('4')

    within(card).getByText('2 players', { selector: 'div' })
    within(card).getByText('3 players', { selector: 'div' })

    const priceInputs = within(card).getAllByRole('spinbutton') as HTMLInputElement[]
    expect(priceInputs).toHaveLength(2)
    expect(priceInputs[0].value).toBe('45')
    expect(priceInputs[1].value).toBe('55')
  })
})

// ── 4. Checking/unchecking reveals/hides the section ────────────────────────

describe('PricingStep — toggling the Group checkbox', () => {
  it('reveals the section seeded with one 2-player row, and hides it again on uncheck', async () => {
    setUpCoachSports(NO_SAVED_SPORTS.sports)
    await renderLoaded()

    expect(screen.queryByText('Group session pricing')).not.toBeInTheDocument()

    clickSessionType('Group')

    expect(isSessionTypeChecked('Group')).toBe(true)
    const card = screen.getByText('Group session pricing').closest('.rounded-xl') as HTMLElement
    within(card).getByText('2 players', { selector: 'div' })

    clickSessionType('Group')

    expect(isSessionTypeChecked('Group')).toBe(false)
    expect(screen.queryByText('Group session pricing')).not.toBeInTheDocument()
  })
})

// ── 5. Add-tier link + max-size trim ────────────────────────────────────────

describe('PricingStep — adding tier rows and trimming by max group size', () => {
  it('adds the next size via the link, hides the link once the cap is fully priced, and trims on cap decrease', async () => {
    setUpCoachSports([GROUP_ONE_TIER_SPORT])
    await renderLoaded()

    const card = groupCard()

    // Only size 2 is priced; cap is 4 → link offers 3 next.
    expect(within(card).getByRole('button', { name: 'Add 3-player price' })).toBeInTheDocument()

    fireEvent.click(within(card).getByRole('button', { name: 'Add 3-player price' }))
    within(card).getByText('3 players', { selector: 'div' })
    expect(within(card).getByRole('button', { name: 'Add 4-player price' })).toBeInTheDocument()

    fireEvent.click(within(card).getByRole('button', { name: 'Add 4-player price' }))
    within(card).getByText('4 players', { selector: 'div' })

    // Every size up to the cap (2, 3, 4) now has a row — link disappears.
    expect(within(card).queryByRole('button', { name: /Add \d-player price/ })).not.toBeInTheDocument()

    // Lowering the cap to 2 trims rows above it.
    fireEvent.change(screen.getByLabelText('Max group size'), { target: { value: '2' } })

    within(card).getByText('2 players', { selector: 'div' })
    expect(within(card).queryByText('3 players', { selector: 'div' })).not.toBeInTheDocument()
    expect(within(card).queryByText('4 players', { selector: 'div' })).not.toBeInTheDocument()
  })
})

// ── 6. Remove disabled on last row ──────────────────────────────────────────

describe('PricingStep — remove button on the last remaining tier row', () => {
  it('disables the x button when only one tier row remains', async () => {
    setUpCoachSports(NO_SAVED_SPORTS.sports)
    await renderLoaded()

    clickSessionType('Group')
    const card = groupCard()
    const row = tierRow(card, 2)
    const removeButton = within(row).getByRole('button')

    expect(removeButton).toBeDisabled()
  })
})

// ── 7. Save payload shape ───────────────────────────────────────────────────

describe('PricingStep — save payload', () => {
  it('sends session_types with group, max_group_size, and group_price_tiers when group is checked', async () => {
    setUpCoachSports([SAVED_GROUP_SPORT])
    global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response)
    await renderLoaded()

    fireEvent.click(screen.getByRole('button', { name: /Save & continue/ }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/coaches/sports')
    const body = JSON.parse(init.body as string) as {
      session_types: string[]
      max_group_size: number | null
      group_price_tiers: Record<string, number> | null
    }
    expect(body.session_types).toContain('group')
    expect(body.max_group_size).toBe(4)
    expect(body.group_price_tiers).toEqual({ '2': 4500, '3': 5500 })
  })

  it('sends null max_group_size and group_price_tiers, and omits group from session_types, when group is unchecked', async () => {
    setUpCoachSports([INDIVIDUAL_ONLY_SPORT])
    global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response)
    await renderLoaded()

    fireEvent.click(screen.getByRole('button', { name: /Save & continue/ }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as {
      session_types: string[]
      max_group_size: number | null
      group_price_tiers: Record<string, number> | null
    }
    expect(body.session_types).not.toContain('group')
    expect(body.max_group_size).toBeNull()
    expect(body.group_price_tiers).toBeNull()
  })
})

// ── 8. Save blocked with no priced tier ─────────────────────────────────────

describe('PricingStep — save blocked when group is checked with no priced tier', () => {
  it('shows an error and fires no POST when group has no priced tier', async () => {
    setUpCoachSports([LEGACY_GROUP_SPORT])
    global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response)
    await renderLoaded()

    // Legacy fixture loads with group unchecked — enable it, seeding an
    // unpriced 2-player row.
    clickSessionType('Group')

    fireEvent.click(screen.getByRole('button', { name: /Save & continue/ }))

    expect(
      await screen.findByText('Please set at least one group price for: Cricket'),
    ).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

// ── 8b. Save blocked when a tier price is below the £1.00 floor ─────────────

describe('PricingStep — save blocked when a group tier price is below £1.00', () => {
  it('shows the minimum-price error and fires no POST for a sub-£1 tier', async () => {
    setUpCoachSports([GROUP_ONE_TIER_SPORT])
    global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response)
    await renderLoaded()

    const card = groupCard()
    const priceInput = within(card).getByRole('spinbutton') as HTMLInputElement
    fireEvent.change(priceInput, { target: { value: '0.50' } })

    fireEvent.click(screen.getByRole('button', { name: /Save & continue/ }))

    expect(
      await screen.findByText('Group prices must be at least £1.00 — check: Cricket'),
    ).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

// ── 9. Individual pricing regression ────────────────────────────────────────

describe('PricingStep — individual pricing default render (regression)', () => {
  it('shows Individual checked with one duration row by default', async () => {
    setUpCoachSports(NO_SAVED_SPORTS.sports)
    await renderLoaded()

    expect(isSessionTypeChecked('Individual')).toBe(true)
    expect(screen.getByDisplayValue('60 min')).toBeInTheDocument()
    expect(screen.getAllByRole('spinbutton')).toHaveLength(1)
  })
})
