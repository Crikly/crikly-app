'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Users, Plus, X } from 'lucide-react'

interface EnrolmentItem {
  id: string
  child_name: string | null
  child_dob: string | null
  parent_name: string
  payment_type: string
  joined_at_session_number: number
  status: string
  created_at: string
  /** BUG-23: which sessions/slots this child attends (chronological lines). */
  sessions: string[]
}

interface RosterData {
  programme_id: string
  programme_title: string
  total_spots: number
  enrolled_count: number
  enrolments: EnrolmentItem[]
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function ProgrammeRoster({ programmeId }: { programmeId: string }) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [data, setData] = useState<RosterData | null>(null)

  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({ child_name: '', notes: '' })
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  useEffect(() => setMounted(true), [])

  const fetchRoster = useCallback(async () => {
    try {
      setLoading(true)
      setFetchError(null)
      const res = await fetch(`/api/coaches/programmes/${programmeId}/roster`)
      if (!res.ok) {
        const d = await res.json()
        setFetchError((d.error as string) || 'Failed to load roster')
        return
      }
      setData(await res.json())
    } catch {
      setFetchError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [programmeId])

  useEffect(() => { fetchRoster() }, [fetchRoster])

  function closeAddForm() {
    setAddOpen(false)
    setAddForm({ child_name: '', notes: '' })
    setAddError(null)
  }

  async function handleAdd() {
    if (!addForm.child_name.trim()) {
      setAddError('Child name is required.')
      return
    }
    setAddLoading(true)
    setAddError(null)
    try {
      const body: { child_name: string; notes?: string } = {
        child_name: addForm.child_name.trim(),
      }
      if (addForm.notes.trim()) body.notes = addForm.notes.trim()

      const res = await fetch(`/api/coaches/programmes/${programmeId}/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json()
        setAddError((d.error as string) || 'Failed to add participant')
        return
      }
      closeAddForm()
      await fetchRoster()
    } catch {
      setAddError('Something went wrong. Please try again.')
    } finally {
      setAddLoading(false)
    }
  }

  if (!mounted) return null

  if (loading) {
    return (
      <div className="min-h-screen bg-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <div className="w-full max-w-2xl mx-auto px-5 pt-8 pb-16">
          <div className="h-4 bg-[#F1F5F9] rounded-full w-32 mb-6 animate-pulse" />
          <div className="h-7 bg-[#F1F5F9] rounded-full w-56 mb-2 animate-pulse" />
          <div className="h-4 bg-[#F1F5F9] rounded-full w-28 mb-8 animate-pulse" />
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div
                key={i}
                className="rounded-xl bg-white p-4"
                style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
              >
                <div className="h-4 bg-[#F1F5F9] rounded-full w-40 mb-2.5 animate-pulse" />
                <div className="h-3 bg-[#F1F5F9] rounded-full w-28 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div
        className="min-h-screen bg-white flex items-center justify-center"
        style={{ fontFamily: "'DM Sans', sans-serif" }}
      >
        <div className="text-center px-4">
          <p className="text-[16px] font-medium text-gray-900 mb-2">Failed to load roster</p>
          <p className="text-[14px] text-gray-500 mb-6">{fetchError}</p>
          <button
            onClick={() => router.push('/coach/programmes')}
            className="text-[#0077CC] text-[14px] font-medium hover:underline"
          >
            ← Back to programmes
          </button>
        </div>
      </div>
    )
  }

  const enrolments = data?.enrolments ?? []

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="w-full max-w-2xl mx-auto bg-white min-h-screen flex flex-col pb-16">

        {/* Sticky header */}
        <div className="px-5 pt-8 pb-4 bg-white sticky top-0 z-10 border-b border-gray-50">
          <button
            onClick={() => router.push('/coach/programmes')}
            className="inline-flex items-center gap-1.5 text-[13px] text-[#64748B] hover:text-[#0F172A] transition-colors mb-4"
            data-testid="back-button"
          >
            <ArrowLeft size={14} />
            Back to programmes
          </button>
          <h1 className="text-[22px] font-bold text-gray-900 tracking-tight leading-tight">
            {data?.programme_title ?? ''}
          </h1>
          <div className="flex items-center gap-1.5 mt-1.5">
            <Users size={13} className="text-gray-400" />
            <span className="text-[13px] text-gray-500">
              {data?.enrolled_count ?? 0} / {data?.total_spots ?? 0} spots filled
            </span>
          </div>
        </div>

        {/* Participant list */}
        <div className="flex-1 px-5 py-5 space-y-3">
          {enrolments.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-center px-4">
              <div className="w-16 h-16 bg-[#E6F3FB] text-[#0077CC] rounded-full flex items-center justify-center mb-4">
                <Users size={28} />
              </div>
              <h3 className="text-[18px] font-bold text-gray-900 mb-2">No participants yet</h3>
              <p className="text-[14px] text-gray-500 font-medium max-w-[260px] leading-relaxed">
                Participants will appear here once they enrol, or you can add them manually below.
              </p>
            </div>
          ) : (
            enrolments.map(enrolment => (
              <div
                key={enrolment.id}
                className="rounded-xl bg-white overflow-hidden"
                style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
                data-testid="roster-card"
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <h3 className="text-[14px] font-semibold text-gray-900 leading-tight">
                      {enrolment.child_name ?? 'Offline participant'}
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ${
                        enrolment.payment_type === 'offline'
                          ? 'bg-gray-100 text-gray-600'
                          : 'bg-[#E6F3FB] text-[#0C447C]'
                      }`}
                    >
                      {enrolment.payment_type === 'offline' ? 'Cash payment' : 'Paid via Crikly'}
                    </span>
                  </div>
                  <p className="text-[12px] text-gray-500 mb-2">{enrolment.parent_name}</p>
                  {/* BUG-23: slot-level attendance — the coach sees exactly
                      which sessions this child is coming to. */}
                  {enrolment.sessions.length > 0 && (
                    <ul className="mb-2 flex flex-col gap-0.5" data-testid="roster-sessions">
                      {enrolment.sessions.map(line => (
                        <li key={line} className="text-[12px] text-gray-600">
                          {line}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    {enrolment.joined_at_session_number > 1 && (
                      <span className="text-[11px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
                        Joined session {enrolment.joined_at_session_number}
                      </span>
                    )}
                    <span className="text-[11px] text-gray-400">
                      Enrolled {formatDate(enrolment.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Manual offline add */}
        <div className="px-5 pb-8">
          {!addOpen ? (
            <button
              onClick={() => setAddOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-[1.5px] border-dashed border-gray-300 text-[13px] font-medium text-gray-500 hover:border-[#0077CC] hover:text-[#0077CC] transition-colors min-h-[44px]"
              data-testid="add-participant-button"
            >
              <Plus size={15} />
              Add offline participant
            </button>
          ) : (
            <div
              className="bg-white rounded-xl border border-[#E2E8F0] p-4"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
            >
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-[14px] font-semibold text-gray-900">Add offline participant</h4>
                <button
                  onClick={closeAddForm}
                  className="text-gray-400 hover:text-gray-600 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label="Close add form"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mb-3">
                <label
                  className="block text-[12px] font-medium text-[#475569] mb-1.5"
                  htmlFor="offline-child-name"
                >
                  Child name <span className="text-red-400">*</span>
                </label>
                <input
                  id="offline-child-name"
                  type="text"
                  value={addForm.child_name}
                  onChange={e => setAddForm(f => ({ ...f, child_name: e.target.value }))}
                  placeholder="e.g. Jamie Smith"
                  className="w-full px-3.5 py-2.5 bg-white border border-[#E2E8F0] rounded-[10px] text-[14px] text-[#0F172A] outline-none focus:border-[#0077CC] focus:shadow-[0_0_0_3px_rgba(0,119,204,0.15)]"
                  data-testid="offline-child-name-input"
                />
              </div>

              <div className="mb-4">
                <label
                  className="block text-[12px] font-medium text-[#475569] mb-1.5"
                  htmlFor="offline-notes"
                >
                  Notes{' '}
                  <span className="text-[11px] text-[#94A3B8] font-normal">Optional</span>
                </label>
                <textarea
                  id="offline-notes"
                  value={addForm.notes}
                  onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Any notes about this participant"
                  rows={2}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#E2E8F0] rounded-[10px] text-[14px] text-[#0F172A] outline-none focus:border-[#0077CC] focus:shadow-[0_0_0_3px_rgba(0,119,204,0.15)] resize-y"
                  data-testid="offline-notes-input"
                />
              </div>

              {addError && (
                <p className="text-[12px] text-red-500 mb-3">{addError}</p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={closeAddForm}
                  className="flex-1 h-11 rounded-[10px] text-[13px] font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
                  data-testid="add-cancel-button"
                >
                  Cancel
                </button>
                <button
                  disabled={addLoading || !addForm.child_name.trim()}
                  onClick={handleAdd}
                  className="flex-1 h-11 rounded-[10px] bg-[#0077CC] hover:bg-[#0066AA] text-white text-[13px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  data-testid="add-submit-button"
                >
                  {addLoading ? 'Adding...' : 'Add participant'}
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
