import { CoachMoreMenu } from '@/components/coach/CoachMoreMenu'

// BUG-42: mobile navigation hub — the bottom nav's "More" tab lands here.
// Route-based (not a sheet) so back-button and deep links behave normally.
// Desktop users normally reach these surfaces via the sidebar; the page is
// still harmless to visit at lg+.
export default function CoachMorePage() {
  return <CoachMoreMenu />
}
