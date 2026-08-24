// Unit tests for src/lib/booking/commission-rate.ts (BUG-70)
//
// getCommissionRate() reads default_commission_rate (BR-02) from
// platform_config via the admin client so guest checkout pages display the
// same rate the booking routes charge. On any read failure it falls back to
// BR-02's 0.1 default (display only — the charge is unaffected).
//
// Mocked: @/lib/supabase/admin → createAdminClient.

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(),
}))

import { createAdminClient } from '@/lib/supabase/admin'
import { getCommissionRate } from '@/lib/booking/commission-rate'

function mockConfigRead(result: { data?: unknown; error?: unknown }) {
  const single = jest.fn().mockResolvedValue({
    data: result.data ?? null,
    error: result.error ?? null,
  })
  const select = jest.fn().mockReturnValue({ single })
  const from = jest.fn().mockReturnValue({ select })
  ;(createAdminClient as jest.Mock).mockReturnValue({ from })
  return { from, select, single }
}

describe('getCommissionRate', () => {
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('returns the rate from platform_config', async () => {
    const { from, select } = mockConfigRead({ data: { default_commission_rate: 0 } })
    await expect(getCommissionRate()).resolves.toBe(0)
    expect(from).toHaveBeenCalledWith('platform_config')
    expect(select).toHaveBeenCalledWith('default_commission_rate')
  })

  it('returns non-default rates verbatim (BR-02: admin configurable)', async () => {
    mockConfigRead({ data: { default_commission_rate: 0.15 } })
    await expect(getCommissionRate()).resolves.toBe(0.15)
  })

  it('coerces a numeric-as-string value (Postgres numeric)', async () => {
    mockConfigRead({ data: { default_commission_rate: '0.1' } })
    await expect(getCommissionRate()).resolves.toBe(0.1)
  })

  it('falls back to 0.1 and logs when the read errors', async () => {
    mockConfigRead({ error: { message: 'connection refused' } })
    await expect(getCommissionRate()).resolves.toBe(0.1)
    expect(consoleErrorSpy).toHaveBeenCalled()
  })

  it('falls back to 0.1 and logs when the row is missing', async () => {
    mockConfigRead({ data: null })
    await expect(getCommissionRate()).resolves.toBe(0.1)
    expect(consoleErrorSpy).toHaveBeenCalled()
  })

  it('falls back to 0.1 and logs when the value is not a finite number', async () => {
    mockConfigRead({ data: { default_commission_rate: 'not-a-number' } })
    await expect(getCommissionRate()).resolves.toBe(0.1)
    expect(consoleErrorSpy).toHaveBeenCalled()
  })

  it('falls back to 0.1 and logs when the value is negative', async () => {
    mockConfigRead({ data: { default_commission_rate: -0.05 } })
    await expect(getCommissionRate()).resolves.toBe(0.1)
    expect(consoleErrorSpy).toHaveBeenCalled()
  })
})
