import {
  CHILD_IDENTITY_COLOURS,
  childIdentityColour,
  firstNameOf,
} from '@/constants/childIdentity'

describe('childIdentityColour', () => {
  it('assigns colours by child order — 1st teal, 2nd coral', () => {
    expect(childIdentityColour(0)).toBe('#0d9488')
    expect(childIdentityColour(1)).toBe('#f97316')
    expect(childIdentityColour(2)).toBe('#d97706')
    expect(childIdentityColour(3)).toBe('#7c3aed')
    expect(childIdentityColour(4)).toBe('#e11d48')
  })

  it('cycles past the fifth child', () => {
    expect(childIdentityColour(5)).toBe(CHILD_IDENTITY_COLOURS[0])
    expect(childIdentityColour(6)).toBe(CHILD_IDENTITY_COLOURS[1])
  })

  it('never returns undefined for unusual indices', () => {
    expect(CHILD_IDENTITY_COLOURS).toContain(childIdentityColour(-1))
    expect(CHILD_IDENTITY_COLOURS).toContain(childIdentityColour(999))
  })
})

describe('firstNameOf', () => {
  it('returns the first word of a full name', () => {
    expect(firstNameOf('Emma Louise Carter')).toBe('Emma')
  })

  it('handles single names and extra whitespace', () => {
    expect(firstNameOf('  Liam  ')).toBe('Liam')
    expect(firstNameOf('')).toBe('')
  })
})
