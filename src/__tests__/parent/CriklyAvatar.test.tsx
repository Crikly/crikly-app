/** @jest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react'
import { CriklyAvatar } from '@/components/ui/CriklyAvatar'

describe('CriklyAvatar', () => {
  it('renders a DiceBear adventurer URL seeded with the name when no photo', () => {
    render(<CriklyAvatar seed="Emma" style="adventurer" size={56} />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute(
      'src',
      'https://api.dicebear.com/7.x/adventurer/svg?seed=Emma',
    )
  })

  it('renders a personas URL for adults and URL-encodes the seed', () => {
    render(<CriklyAvatar seed="Sarah Carter" style="personas" size={36} />)
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://api.dicebear.com/7.x/personas/svg?seed=Sarah%20Carter',
    )
  })

  it('prioritises an uploaded photo over DiceBear', () => {
    render(
      <CriklyAvatar
        seed="Sarah Carter"
        style="personas"
        size={36}
        photoUrl="https://example.supabase.co/storage/avatar.jpg"
      />,
    )
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://example.supabase.co/storage/avatar.jpg',
    )
  })

  it('cascades photo → DiceBear → coloured initial on load errors', () => {
    render(
      <CriklyAvatar
        seed="Emma"
        style="adventurer"
        size={56}
        photoUrl="https://example.supabase.co/storage/broken.jpg"
      />,
    )
    // Photo fails → DiceBear
    fireEvent.error(screen.getByRole('img'))
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://api.dicebear.com/7.x/adventurer/svg?seed=Emma',
    )
    // DiceBear fails (network down) → coloured initial safety net
    fireEvent.error(screen.getByRole('img'))
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Emma')).toHaveTextContent('E')
  })

  it('draws the identity ring as an outer border when ringColor is set', () => {
    render(
      <CriklyAvatar
        seed="Emma"
        style="adventurer"
        size={56}
        ringColor="#0d9488"
        ringWidth={3}
      />,
    )
    const wrapper = screen.getByTestId('crikly-avatar')
    expect(wrapper).toHaveStyle({ border: '3px solid #0d9488' })
  })

  it('renders no ring border when ringColor is omitted', () => {
    render(<CriklyAvatar seed="Emma" style="adventurer" size={56} />)
    const wrapper = screen.getByTestId('crikly-avatar')
    expect(wrapper.style.border).toBe('')
  })
})
