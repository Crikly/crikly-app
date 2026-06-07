import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Public Supabase client — anon key only, no cookies, no auth state.
 *
 * For routes that serve unauthenticated read traffic (landing page,
 * /coaches discovery). RLS is still enforced — anon-only access means
 * only rows protected by a "Public can view ..." policy are returned.
 *
 * Distinct from `@/lib/supabase/server` (which wires auth cookies for
 * authed routes) and `@/lib/supabase/admin` (which bypasses RLS via
 * the service-role key).
 */
export function createPublicClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )
}
