import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()

    const { data: sports, error } = await supabase
      .from('sports')
      .select('id, name, slug')
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (error) {
      console.error('Error fetching sports:', error)
      return NextResponse.json(
        { error: 'Failed to fetch sports' },
        { status: 500 }
      )
    }

    return NextResponse.json({ sports })
  } catch (error) {
    console.error('Unexpected error in GET /api/sports:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
