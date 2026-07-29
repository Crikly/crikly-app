// PILOT: everything under src/lib/pilot/ is pilot-only code. When the pilot
// ends, delete this directory and src/app/api/admin/coaches/[id]/approve/ —
// nothing permanent imports from here.
export { handleApproveGet, handleApprovePost } from './coach-approval'
