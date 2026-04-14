import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyAdmin } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const admin = verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: opportunities } = await supabaseAdmin
    .from('opportunities')
    .select('id, title, deadline, requirements, website_url, organization')
    .eq('status', 'published')
    .limit(30)

  if (!opportunities?.length) return NextResponse.json({ message: 'No opportunities to verify' })

  const { data: log } = await supabaseAdmin
    .from('verification_logs')
    .insert({ triggered_by: admin.username, opportunities_checked: opportunities.length, status: 'running' })
    .select().single()

  try {
    const oppList = opportunities.map(o =>
      `ID: ${o.id} | Title: ${o.title} | Deadline: ${o.deadline || 'N/A'} | Org: ${o.organization || 'N/A'}`
    ).join('\n')

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: `You are verifying high school opportunity listings. Review each entry and flag any that:
- Have deadlines that have already passed (today is ${new Date().toISOString().split('T')[0]})
- Seem suspicious or unreliable
- Have missing critical information

Opportunities:
${oppList}

Return ONLY a raw JSON array (no markdown) where each object has:
- id: the exact ID string provided
- status: "verified" or "needs_review"  
- notes: null if verified, or brief reason if needs_review`
        }]
      })
    })

    const claudeData = await response.json()
    if (claudeData.error) throw new Error(claudeData.error.message)

    let jsonText = ''
    for (const block of claudeData.content || []) {
      if (block.type === 'text') jsonText += block.text
    }

    jsonText = jsonText.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()
    const startIdx = jsonText.indexOf('[')
    const endIdx = jsonText.lastIndexOf(']')
    if (startIdx === -1 || endIdx === -1) throw new Error('No JSON found')

    const results = JSON.parse(jsonText.slice(startIdx, endIdx + 1))
    let issuesFound = 0

    for (const result of results) {
      await supabaseAdmin.from('opportunities').update({
        verification_status: result.status,
        verification_notes: result.notes,
        last_verified_at: new Date().toISOString()
      }).eq('id', result.id)
      if (result.status === 'needs_review') issuesFound++
    }

    await supabaseAdmin.from('verification_logs')
      .update({ status: 'completed', issues_found: issuesFound, completed_at: new Date().toISOString() })
      .eq('id', log?.id)

    return NextResponse.json({ success: true, checked: opportunities.length, issues: issuesFound })
  } catch (err: unknown) {
    await supabaseAdmin.from('verification_logs')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('id', log?.id)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
