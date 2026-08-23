import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadOwnedChild } from '@/lib/children/load-child'
import { ChildProfileCard } from '@/components/parent/children/ChildProfileCard'
import type { ChildCardData } from '@/components/parent/children/types'

// P-07 (Screen 07): child profile player card. Server component — child
// data never fetched client-side (COPPA rule, parent/dashboard precedent).
// Booking reads degrade to zero-history on failure rather than erroring
// the page.

function formatDayLabel(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function firstOf<T>(value: T | T[] | null): T | null {
  if (value === null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

export default async function ChildProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const child = await loadOwnedChild(id)
  if (!child) notFound()

  const supabase = await createClient()
  const todayStr = new Date().toISOString().split('T')[0] ?? ''

  let sessionsCompleted = 0
  let nextSession: ChildCardData['nextSession'] = null
  try {
    const [completedResult, nextResult] = await Promise.all([
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('child_profile_id', child.id)
        .eq('status', 'completed')
        .is('deleted_at', null),
      supabase
        .from('bookings')
        .select('session_date, session_start_time, coach_profiles ( display_name )')
        .eq('child_profile_id', child.id)
        .eq('status', 'confirmed')
        .gte('session_date', todayStr)
        .is('deleted_at', null)
        .order('session_date', { ascending: true })
        .order('session_start_time', { ascending: true })
        .limit(1),
    ])

    // supabase-js resolves {data, error} rather than throwing — inspect
    // .error explicitly or a real query failure degrades silently.
    if (completedResult.error) {
      console.error('[ChildProfilePage] completed-count read error:', completedResult.error)
    }
    if (nextResult.error) {
      console.error('[ChildProfilePage] next-session read error:', nextResult.error)
    }

    sessionsCompleted = completedResult.count ?? 0
    const next = nextResult.data?.[0] ?? null
    if (next) {
      nextSession = {
        dateLabel: formatDayLabel(new Date(`${next.session_date}T00:00:00`)),
        timeLabel: next.session_start_time.substring(0, 5),
        coachName: firstOf(next.coach_profiles)?.display_name || 'Coach',
      }
    }
  } catch (error) {
    console.error('[ChildProfilePage] bookings read error:', error)
  }

  const cardData: ChildCardData = {
    id: child.id,
    fullName: child.fullName,
    firstName: child.firstName,
    age: child.age,
    colour: child.colour,
    gender: child.gender,
    medicalNotes: child.medicalNotes,
    sportName: child.sportName,
    sportSlug: child.sportSlug,
    skillLevel: child.skillLevel,
    sessionsCompleted,
    nextSession,
  }

  return <ChildProfileCard child={cardData} />
}
