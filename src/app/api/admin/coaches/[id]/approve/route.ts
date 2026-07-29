// PILOT: one-click coach approval from the review email (Email B).
// Thin shell — all logic lives in src/lib/pilot/ so that deleting that
// directory plus this route ends the pilot cleanly. See
// src/lib/pilot/coach-approval.ts for the auth model and GET/POST split.

import { NextRequest, NextResponse } from 'next/server'
import { handleApproveGet, handleApprovePost } from '@/lib/pilot'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params
  return handleApproveGet(request, id)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params
  return handleApprovePost(request, id)
}
