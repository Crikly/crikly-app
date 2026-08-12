import { childIdentityColour } from '@/constants/childIdentity'
import { loadActiveSports, loadOwnedChildren } from '@/lib/children/load-child'
import { ChildForm } from '@/components/parent/children/ChildForm'

// P-07 (Screen 08): add child — replaces the P-04-A ComingSoon
// placeholder. The new child's identity colour is the next palette slot
// (index = current child count — auto-assigned, never randomised).

export default async function AddChildPage() {
  const [children, sports] = await Promise.all([loadOwnedChildren(), loadActiveSports()])
  const colour = childIdentityColour(children.length)

  return (
    <div className="px-4 pb-8 pt-8 md:px-8">
      <div className="mx-auto mb-6 w-full max-w-lg">
        <h1 className="text-[28px] font-bold tracking-tight text-gray-900">Add a child</h1>
      </div>
      <ChildForm mode="create" sports={sports} colour={colour} />
    </div>
  )
}
