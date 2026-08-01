// P-04-A: child identity colours from the approved Screen 06 design.
// Assigned by child order (1st = teal, 2nd = coral, ...) and cycled past
// the 5th child. These are per-child identity hues, not Tailwind brand
// tokens — they are applied via inline style (documented exception, same
// precedent as ui/progress-bar.tsx) because dynamically-composed Tailwind
// classes are purged unless safelisted.
export const CHILD_IDENTITY_COLOURS = [
  '#0d9488', // teal
  '#f97316', // coral
  '#d97706', // amber
  '#7c3aed', // violet
  '#e11d48', // rose
] as const

export function childIdentityColour(childIndex: number): string {
  const colour =
    CHILD_IDENTITY_COLOURS[
      ((childIndex % CHILD_IDENTITY_COLOURS.length) +
        CHILD_IDENTITY_COLOURS.length) %
        CHILD_IDENTITY_COLOURS.length
    ]
  return colour ?? CHILD_IDENTITY_COLOURS[0]
}

// child_profiles has no first-name column (full_name only) — the DiceBear
// seed and all greeting copy use the first word of full_name.
export function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? ''
}
