import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/supabase-server'
import { verifyAdmin } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const type = searchParams.get('type')
  const field = searchParams.get('field')
  const grade = searchParams.get('grade')
  const cost = searchParams.get('cost')
  const search = searchParams.get('search')
  const isAdmin = verifyAdmin(req)

  let query = (isAdmin ? supabaseAdmin : supabase)
    .from('opportunities')
    .select('*')
    .order('created_at', { ascending: false })

  if (!isAdmin) {
    query = query.eq('status', 'published')
  } else if (status) {
    query = query.eq('status', status)
  }

  if (type) query = query.eq('type', type)
  if (field) query = query.contains('fields', [field])
  if (grade) query = query.contains('grade_levels', [grade])
  if (cost) query = query.eq('cost', cost)
  if (search) query = query.ilike('title', `%${search}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const admin = verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { data, error } = await supabaseAdmin
    .from('opportunities')
    .insert(body)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
