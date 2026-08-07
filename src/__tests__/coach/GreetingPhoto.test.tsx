/** @jest-environment jsdom */

import React, { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GreetingPhoto } from '@/components/coach/GreetingPhoto'

const mockUpload = jest.fn()
const mockGetPublicUrl = jest.fn()

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
      }),
    },
  }),
}))

const mockFetchProfileCached = jest.fn()
const mockClearProfileCache = jest.fn()

jest.mock('@/lib/onboarding-cache', () => ({
  fetchCoachProfileCached: () => mockFetchProfileCached(),
  clearCoachProfileCache: () => mockClearProfileCache(),
}))

// Harness mirroring CoachHomeClient's lifted-state wiring.
function Harness({ initialUrl }: { initialUrl: string | null }): React.ReactElement {
  const [url, setUrl] = useState<string | null>(initialUrl)
  return <GreetingPhoto coachName="Sarah Carter" photoUrl={url} onPhotoChange={setUrl} size={72} />
}

describe('GreetingPhoto', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as jest.Mock
    mockFetchProfileCached.mockResolvedValue({ id: 'coach-profile-1' })
    mockUpload.mockResolvedValue({ error: null })
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: 'https://example.supabase.co/storage/coach-photos/profile/coach-profile-1/1.jpg' },
    })
    URL.createObjectURL = jest.fn().mockReturnValue('blob:preview')
    URL.revokeObjectURL = jest.fn()
  })

  it('renders the uploaded photo when one exists — same source parents see', () => {
    render(<Harness initialUrl="https://example.supabase.co/storage/avatar.jpg" />)
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://example.supabase.co/storage/avatar.jpg',
    )
  })

  it('falls back to a DiceBear adult-tier avatar seeded with the full name', () => {
    render(<Harness initialUrl={null} />)
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://api.dicebear.com/7.x/shapes/svg?seed=Sarah%20Carter',
    )
  })

  it('shows the "Your public photo" label', () => {
    render(<Harness initialUrl={null} />)
    expect(screen.getByText('Your public photo', { selector: 'span' })).toBeInTheDocument()
  })

  it('opens the sheet on tap with only "Upload a photo" when no photo exists', () => {
    render(<Harness initialUrl={null} />)
    fireEvent.click(screen.getByTestId('greeting-photo-button'))
    expect(screen.getByText('Upload a photo')).toBeInTheDocument()
    expect(screen.queryByText('Remove photo')).not.toBeInTheDocument()
  })

  it('shows "Remove photo" in the sheet only when a photo exists', () => {
    render(<Harness initialUrl="https://example.supabase.co/storage/avatar.jpg" />)
    fireEvent.click(screen.getByTestId('greeting-photo-button'))
    expect(screen.getByText('Remove photo')).toBeInTheDocument()
  })

  it('uploads a selected file via Storage and persists via /api/coaches/profile', async () => {
    render(<Harness initialUrl={null} />)
    const file = new File(['x'], 'me.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByTestId('greeting-photo-input'), { target: { files: [file] } })

    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalledWith(
        expect.stringMatching(/^profile\/coach-profile-1\/\d+\.jpg$/),
        file,
        { upsert: true, contentType: 'image/jpeg' },
      )
    })
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/coaches/profile', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          avatar_url: 'https://example.supabase.co/storage/coach-photos/profile/coach-profile-1/1.jpg',
        }),
      }))
    })
    expect(mockClearProfileCache).toHaveBeenCalled()
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://example.supabase.co/storage/coach-photos/profile/coach-profile-1/1.jpg',
    )
  })

  it('rejects files over 5MB with inline error and no upload', async () => {
    render(<Harness initialUrl={null} />)
    const big = new File([''], 'big.jpg', { type: 'image/jpeg' })
    Object.defineProperty(big, 'size', { value: 5 * 1024 * 1024 + 1 })
    fireEvent.change(screen.getByTestId('greeting-photo-input'), { target: { files: [big] } })

    expect(await screen.findByRole('alert')).toHaveTextContent('Photo must be under 5MB.')
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('reverts to the previous photo with inline error when upload fails', async () => {
    mockUpload.mockResolvedValue({ error: new Error('storage down') })
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)

    render(<Harness initialUrl="https://example.supabase.co/storage/old.jpg" />)
    const file = new File(['x'], 'me.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByTestId('greeting-photo-input'), { target: { files: [file] } })

    expect(await screen.findByRole('alert')).toHaveTextContent('Upload failed. Please try again.')
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://example.supabase.co/storage/old.jpg',
    )
    consoleSpy.mockRestore()
  })

  it('removes the photo via /api/coaches/profile with avatar_url null', async () => {
    render(<Harness initialUrl="https://example.supabase.co/storage/avatar.jpg" />)
    fireEvent.click(screen.getByTestId('greeting-photo-button'))
    fireEvent.click(screen.getByText('Remove photo'))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/coaches/profile', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ avatar_url: null }),
      }))
    })
    // Falls back to DiceBear immediately (optimistic)
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://api.dicebear.com/7.x/shapes/svg?seed=Sarah%20Carter',
    )
  })
})
