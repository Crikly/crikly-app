// STAGE1-CANCEL-OFFLINE-2: the public coach profile's programme card must say
// what its price actually buys. A block programme is one price for the whole
// block ("£160 for 4 sessions") — it used to be labelled "per session".

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}))

import { programmeCardPrice } from '@/app/coaches/[id]/_components/_data/programmes'

describe('programmeCardPrice', () => {
  it('labels a block programme with its session count, using the block price', () => {
    expect(
      programmeCardPrice({
        payment_type: 'block_upfront',
        price_per_session_pence: 16000,
        block_price_pence: 16000,
        block_session_count: 4,
      }),
    ).toEqual({ pricePence: 16000, per: 'for 4 sessions' })
  })

  it('uses the singular for a one-session block', () => {
    expect(
      programmeCardPrice({
        payment_type: 'block_upfront',
        price_per_session_pence: 4000,
        block_price_pence: 4000,
        block_session_count: 1,
      }).per,
    ).toBe('for 1 session')
  })

  it('says "total" for a block programme with no session count', () => {
    expect(
      programmeCardPrice({
        payment_type: 'block_upfront',
        price_per_session_pence: 16000,
        block_price_pence: 16000,
        block_session_count: null,
      }),
    ).toEqual({ pricePence: 16000, per: 'total' })
  })

  it('keeps "per session" for a per-session programme (unchanged)', () => {
    expect(
      programmeCardPrice({
        payment_type: 'per_session',
        price_per_session_pence: 2800,
        block_price_pence: null,
        block_session_count: null,
      }),
    ).toEqual({ pricePence: 2800, per: 'per session' })
  })

  it('falls back to the per-session figure, truthfully labelled, when a block row has no block price', () => {
    expect(
      programmeCardPrice({
        payment_type: 'block_upfront',
        price_per_session_pence: 4000,
        block_price_pence: null,
        block_session_count: 4,
      }),
    ).toEqual({ pricePence: 4000, per: 'per session' })
  })
})
