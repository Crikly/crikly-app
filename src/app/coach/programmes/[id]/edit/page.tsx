import { EditProgramme } from '@/components/coach/EditProgramme'

export default async function EditProgrammePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <EditProgramme programmeId={id} />
}
