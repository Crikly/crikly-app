'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Root redirect — checks whether user has already selected a role.
// First visit (no crikly_role_selected) → /splash (funnel entry).
// Returning visit (role already set) → /home (marketing homepage).
export default function RootRedirect() {
  const router = useRouter()

  useEffect(() => {
    const roleSelected = sessionStorage.getItem('crikly_role_selected')
    if (roleSelected) {
      router.replace('/home')
    } else {
      router.replace('/splash')
    }
  }, [router])

  return null
}
