import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { verifyAdmin } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const admin = verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 获取所有已发布项目，不设 limit
  const { data: opportunities } = await supabaseAdmin
    .from('opportunities')
    .select('id, title, deadline, requirements, website_url, organization, description')
    .eq('status', 'published')

  if (!opportunities?.length) return NextResponse.json({ message: 'No opportunities to verify' })

  const { data: log } = await supabaseAdmin
    .from('verification_logs')
    .insert({ triggered_by: admin.username, opportunities_checked: opportunities.length, status: 'running' })
    .select().single()

  try {
    let issuesFound = 0
    const BATCH_SIZE = 15

    // 分批处理，每批15个，确保全部验证完
    for (let i = 0; i < opportunities.length; i += BATCH_SIZE) {
      const batch = opportunities.slice(i, i + BATCH_SIZE)

      const oppList = batch.map(o =>
        `ID: ${o.id} | Title: ${o.title} | Org: ${o.organization || 'N/A'} | URL: ${o.website_url || 'N/A'} | Description: ${(o.description || '').slice(0, 100)}`
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
            content: `You are verifying high school opportunity listings for accuracy.

IMPORTANT RULES:
- DO NOT flag entries just because their deadline has passed. Expired deadlines are normal and expected — students and admins can see these and decide for themselves.
- Only flag entries as "needs_review" if there are genuine accuracy problems.

Flag as "needs_review" ONLY if:
- The URL appears to be a dead link, 404, or abandoned page
- The organization name or program title seems fake or doesn't exist
- The description contains obviously wrong or contradictory information
- Critical fields like title or organization are missing or nonsensical

Flag as "verified" if:
- The information looks accurate and the program seems legitimate
- Even if the deadline has passed — that is NOT a reason to flag

Opportunities to review:
${oppList}

Return ONLY a raw JSON array (no markdown) where each object has:
- id: the exact ID string provided
- status: "verified" or "needs_review"
- notes: null if verified, or a brief specific reason if needs_review (never mention deadline as a reason)`
          }]
        })
      })

      const claudeData = await response.json()
      if (claudeData.error) {
        console.error(`Batch ${i}-${i + BATCH_SIZE} error:`, claudeData.error.message)
        continue
      }

      let jsonText = ''
      for (const block of claudeData.content || []) {
        if (block.type === 'text') jsonText += block.text
      }

      jsonText = jsonText.trim()
        .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()

      const startIdx = jsonText.indexOf('[')
      const endIdx = jsonText.lastIndexOf(']')
      if (startIdx === -1 || endIdx === -1) {
        console.error(`No JSON in batch ${i}`)
        continue
      }

      let results: any[]
      try {
        results = JSON.parse(jsonText.slice(startIdx, endIdx + 1))
      } catch {
        console.error(`Parse error in batch ${i}`)
        continue
      }

      for (const result of results) {
        await supabaseAdmin.from('opportunities').update({
          verification_status: result.status,
          verification_notes: result.notes,
          last_verified_at: new Date().toISOString()
        }).eq('id', result.id)
        if (result.status === 'needs_review') issuesFound++
      }
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
