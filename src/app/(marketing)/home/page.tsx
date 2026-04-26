import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { HomeClient } from './HomeClient'

export const revalidate = 60

async function getSports(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('sports')
    .select('id, name')
    .eq('is_active', true)
    .order('name')
  return data ?? []
}

export default async function HomePage() {
  const sports = await getSports()
  return (
    <Suspense>
      <HomeClient sports={sports} />
    </Suspense>
  )
}
