import { ProgrammeRoster } from '@/components/coach/ProgrammeRoster'

export default async function RosterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ProgrammeRoster programmeId={id} />
}
