import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyAdmin } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const admin = verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get published opportunities to verify
  const { data: opportunities } = await supabaseAdmin
    .from('opportunities')
    .select('id, title, deadline, requirements, website_url, organization')
    .eq('status', 'published')
    .not('website_url', 'is', null)
    .limit(30)

  if (!opportunities?.length) return NextResponse.json({ message: 'No opportunities to verify' })

  const { data: log } = await supabaseAdmin
    .from('verification_logs')
    .insert({
      triggered_by: admin.username,
      opportunities_checked: opportunities.length,
      status: 'running'
    })
    .select()
    .single()

  try {
    const oppList = opportunities.map(o => 
      `ID: ${o.id} | Title: ${o.title} | Deadline: ${o.deadline || 'N/A'} | URL: ${o.website_url}`
    ).join('\n')

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 6000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `You are verifying information accuracy for a high school opportunities database. 

For each of the following opportunities, search the web to verify if the title, deadline, and basic requirements are still accurate and current. Focus especially on whether deadlines have passed or changed, and whether the program still exists.

Opportunities to verify:
${oppList}

Return a JSON array where each object has:
- id: the opportunity ID
- status: "verified" if info seems accurate, "needs_review" if there are issues or the program seems outdated/changed
- notes: brief explanation of any issues found (null if verified)

Return ONLY a valid JSON array.`
        }]
      })
    })

    const claudeData = await response.json()
    let jsonText = ''
    for (const block of claudeData.content || []) {
      if (block.type === 'text') jsonText += block.text
    }

    const jsonMatch = jsonText.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON found')

    const results = JSON.parse(jsonMatch[0])
    let issuesFound = 0

    for (const result of results) {
      await supabaseAdmin
        .from('opportunities')
        .update({
          verification_status: result.status,
          verification_notes: result.notes,
          last_verified_at: new Date().toISOString()
        })
        .eq('id', result.id)
      if (result.status === 'needs_review') issuesFound++
    }

    await supabaseAdmin
      .from('verification_logs')
      .update({ status: 'completed', issues_found: issuesFound, completed_at: new Date().toISOString() })
      .eq('id', log?.id)

    await supabaseAdmin
      .from('system_settings')
      .update({ value: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('key', 'last_auto_verify')

    return NextResponse.json({ success: true, checked: opportunities.length, issues: issuesFound })
  } catch (err: unknown) {
    await supabaseAdmin
      .from('verification_logs')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('id', log?.id)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
