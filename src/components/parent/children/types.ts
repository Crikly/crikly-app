// P-07: shared client-side types for the child-profile screens.

export interface SportOption {
  id: string
  name: string
}

/** One child as the child screens and the ChildSelector consume it. */
export interface ChildCardData {
  id: string
  fullName: string
  firstName: string
  age: number
  /** Identity colour — derived from the child's index (childIdentityColour). */
  colour: string
  gender: string | null
  medicalNotes: string | null
  sportName: string | null
  /** Sport slug for the coach-search link; null falls back to cricket. */
  sportSlug: string | null
  skillLevel: string | null
  sessionsCompleted: number
  nextSession: {
    dateLabel: string
    timeLabel: string
    coachName: string
  } | null
}

/** Pre-filled values for the edit form (Screen 09). */
export interface ChildFormInitialValues {
  id: string
  fullName: string
  dateOfBirth: string
  gender: string | null
  medicalNotes: string | null
  sportId: string | null
  skillLevel: string | null
}
