import { notFound } from 'next/navigation'
import { loadActiveSports, loadOwnedChild } from '@/lib/children/load-child'
import { ChildForm } from '@/components/parent/children/ChildForm'
import { CriklyAvatar } from '@/components/ui/CriklyAvatar'

// P-07 (Screen 09): edit child profile — the Screen 08 form pre-filled,
// under an identity-colour header strip, with the inline remove
// confirmation living inside ChildForm. Identity-colour background is the
// documented childIdentity inline-style exception.

export default async function EditChildPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [child, sports] = await Promise.all([loadOwnedChild(id), loadActiveSports()])
  if (!child) notFound()

  return (
    <div className="pb-8">
      <div
        className="px-4 pb-11 pt-6 md:px-8"
        style={{ backgroundColor: child.colour }}
        data-testid="edit-child-hero"
      >
        <div className="mx-auto max-w-lg">
          <h1 className="text-[28px] font-bold tracking-tight text-white">
            Editing {child.firstName}
          </h1>
          <p className="mt-1 text-sm text-white/70">Changes apply to future bookings.</p>
        </div>
      </div>

      <div className="mx-auto max-w-lg px-4 md:px-0">
        <div className="-mt-9 mb-6 inline-block rounded-full bg-white">
          <CriklyAvatar
            seed={child.firstName}
            style="adventurer"
            size={72}
            ringColor={child.colour}
            ringWidth={4}
            alt={`${child.firstName}'s avatar`}
          />
        </div>
      </div>

      <div className="px-4 md:px-0">
        <ChildForm
          mode="edit"
          sports={sports}
          colour={child.colour}
          initial={{
            id: child.id,
            fullName: child.fullName,
            dateOfBirth: child.dateOfBirth,
            gender: child.gender,
            medicalNotes: child.medicalNotes,
            sportId: child.sportId,
            skillLevel: child.skillLevel,
          }}
        />
      </div>
    </div>
  )
}
