import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCoachContext } from '@/lib/auth/require-coach'

interface QualificationResponse {
  id: string
  qualification_type_id: string | null
  type_name: string | null
  issuing_body: string | null
  custom_name: string | null
  issued_date: string | null
  expiry_date: string | null
  notes: string | null
  is_custom: boolean
  created_at: string
}

/**
 * PATCH /api/coaches/qualifications/[qualId]
 * 
 * Update an existing qualification.
 * Cannot change qualification_type_id or custom_name (locked after creation).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ qualId: string }> }
): Promise<NextResponse<QualificationResponse | { error: string; details?: unknown }>> {
  try {
    const { qualId } = await params
    const supabase = await createClient()
    
    const { context, error } = await requireCoachContext(supabase)
    if (error) return error
    const { coachProfile } = context

    // 4. Verify coach owns this qualification
    const { data: existingQual, error: qualCheckError } = await supabase
      .from('coach_qualifications')
      .select('id, issued_date')
      .eq('id', qualId)
      .eq('coach_profile_id', coachProfile.id)
      .single()

    if (qualCheckError || !existingQual) {
      return NextResponse.json({ error: 'Qualification not found or access denied' }, { status: 404 })
    }

    // 5. Parse and validate body
    const body = await request.json()
    const validationErrors: string[] = []

    // Cannot change qualification_type_id or custom_name
    if (body.qualification_type_id !== undefined) {
      validationErrors.push('Cannot change qualification_type_id after creation')
    }

    if (body.custom_name !== undefined) {
      validationErrors.push('Cannot change custom_name after creation')
    }

    // Validate issuing_body
    if (body.issuing_body !== undefined && body.issuing_body !== null) {
      if (typeof body.issuing_body !== 'string') {
        validationErrors.push('issuing_body must be a string')
      } else if (body.issuing_body.length > 200) {
        validationErrors.push('issuing_body must be 200 characters or less')
      }
    }

    // Validate dates
    if (body.issued_date !== undefined && body.issued_date !== null) {
      if (typeof body.issued_date !== 'string') {
        validationErrors.push('issued_date must be a string (ISO date)')
      } else {
        const issuedDate = new Date(body.issued_date)
        if (isNaN(issuedDate.getTime())) {
          validationErrors.push('issued_date must be a valid ISO date')
        }
      }
    }

    if (body.expiry_date !== undefined && body.expiry_date !== null) {
      if (typeof body.expiry_date !== 'string') {
        validationErrors.push('expiry_date must be a string (ISO date)')
      } else {
        const expiryDate = new Date(body.expiry_date)
        if (isNaN(expiryDate.getTime())) {
          validationErrors.push('expiry_date must be a valid ISO date')
        }

        // Check expiry_date is after issued_date
        const issuedDateToCheck = body.issued_date || existingQual.issued_date
        if (issuedDateToCheck) {
          const issuedDate = new Date(issuedDateToCheck)
          if (!isNaN(issuedDate.getTime()) && expiryDate <= issuedDate) {
            validationErrors.push('expiry_date must be after issued_date')
          }
        }
      }
    }

    // Validate notes
    if (body.notes !== undefined && body.notes !== null) {
      if (typeof body.notes !== 'string') {
        validationErrors.push('notes must be a string')
      } else if (body.notes.length > 500) {
        validationErrors.push('notes must be 500 characters or less')
      }
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationErrors },
        { status: 400 }
      )
    }

    // 6. Build update object
    const updateData: {
      issuing_body?: string | null
      issued_date?: string | null
      expiry_date?: string | null
      notes?: string | null
      updated_at: string
    } = {
      updated_at: new Date().toISOString(),
    }

    if (body.issuing_body !== undefined) updateData.issuing_body = body.issuing_body
    if (body.issued_date !== undefined) updateData.issued_date = body.issued_date
    if (body.expiry_date !== undefined) updateData.expiry_date = body.expiry_date
    if (body.notes !== undefined) updateData.notes = body.notes

    // 7. Update qualification
    const { data: updatedQual, error: updateError } = await supabase
      .from('coach_qualifications')
      .update(updateData)
      .eq('id', qualId)
      .eq('coach_profile_id', coachProfile.id)
      .select(`
        id,
        qualification_type_id,
        custom_name,
        issuing_body,
        issued_date,
        expiry_date,
        notes,
        created_at,
        qualification_types (
          name,
          issuing_body
        )
      `)
      .single()

    if (updateError) {
      console.error('[PATCH /api/coaches/qualifications/[qualId]] update error:', updateError)
      return NextResponse.json({ error: 'Failed to update qualification' }, { status: 500 })
    }

    // 8. Build response
    const typeData = updatedQual.qualification_types
      ? (Array.isArray(updatedQual.qualification_types) ? updatedQual.qualification_types[0] : updatedQual.qualification_types)
      : null

    const response: QualificationResponse = {
      id: updatedQual.id,
      qualification_type_id: updatedQual.qualification_type_id,
      type_name: typeData?.name || null,
      issuing_body: updatedQual.issuing_body || typeData?.issuing_body || null,
      custom_name: updatedQual.custom_name,
      issued_date: updatedQual.issued_date,
      expiry_date: updatedQual.expiry_date,
      notes: updatedQual.notes,
      is_custom: updatedQual.qualification_type_id === null,
      created_at: updatedQual.created_at,
    }

    return NextResponse.json(response, { status: 200 })

  } catch (error) {
    console.error('[PATCH /api/coaches/qualifications/[qualId]]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/coaches/qualifications/[qualId]
 * 
 * Hard delete — qualifications have no booking history dependency.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ qualId: string }> }
): Promise<NextResponse<{ success: boolean } | { error: string }>> {
  try {
    const { qualId } = await params
    const supabase = await createClient()
    
    const { context, error } = await requireCoachContext(supabase)
    if (error) return error
    const { coachProfile } = context

    // 4. Verify coach owns this qualification
    const { data: existingQual, error: qualCheckError } = await supabase
      .from('coach_qualifications')
      .select('id')
      .eq('id', qualId)
      .eq('coach_profile_id', coachProfile.id)
      .single()

    if (qualCheckError || !existingQual) {
      return NextResponse.json({ error: 'Qualification not found or access denied' }, { status: 404 })
    }

    // 5. Hard delete
    const { error: deleteError } = await supabase
      .from('coach_qualifications')
      .delete()
      .eq('id', qualId)
      .eq('coach_profile_id', coachProfile.id)

    if (deleteError) {
      console.error('[DELETE /api/coaches/qualifications/[qualId]] delete error:', deleteError)
      return NextResponse.json({ error: 'Failed to delete qualification' }, { status: 500 })
    }

    return NextResponse.json({ success: true }, { status: 200 })

  } catch (error) {
    console.error('[DELETE /api/coaches/qualifications/[qualId]]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
