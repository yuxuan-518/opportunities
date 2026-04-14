import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyAdmin } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const admin = verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: keywords } = await supabaseAdmin
    .from('keywords')
    .select('keyword')
    .eq('active', true)
    .limit(15)

  if (!keywords?.length) return NextResponse.json({ error: 'No keywords found' }, { status: 400 })

  const { data: log } = await supabaseAdmin
    .from('search_logs')
    .insert({ triggered_by: admin.username, keywords_searched: keywords.map(k => k.keyword), status: 'running' })
    .select().single()

  const selectedKeywords = keywords.slice(0, 8).map(k => k.keyword)

  try {
    // Use Claude without web search - prompt it to generate based on known programs
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        messages: [{
          role: 'user',
          content: `You are a research assistant for a high school opportunities database. Based on these search keywords, generate a comprehensive list of REAL extracurricular opportunities for high school students. Use your knowledge of well-known programs, competitions, internships, and scholarships.

Keywords to base your search on: ${selectedKeywords.join(', ')}

Return a JSON array of 15-20 real opportunities. Each object must have exactly these fields:
- title: string
- description: string (2-3 sentences)
- organization: string
- website_url: string (real URL)
- type: one of ["competition","program","internship","scholarship","volunteer","research","workshop","other"]
- fields: array from ["STEM","Leadership","Journalism","Arts","Business","Community Service","Environment","Medicine","Law","Technology","College Prep","Social Justice"]
- grade_levels: array from ["9","10","11","12"]
- cost: one of ["free","paid","financial_aid_available"]
- cost_amount: string or null
- location_type: one of ["online","in_person","hybrid"]
- location: string or null
- requirements: string
- deadline: string in "YYYY-MM-DD" format or null
- start_date: string in "YYYY-MM-DD" format or null
- duration: string or null
- ai_confidence: integer 0-100
- search_keywords: array of strings

IMPORTANT: Return ONLY a raw JSON array starting with [ and ending with ]. No markdown, no code blocks, no explanation.`
        }]
      })
    })

    const claudeData = await response.json()

    if (claudeData.error) throw new Error(claudeData.error.message)

    let jsonText = ''
    for (const block of claudeData.content || []) {
      if (block.type === 'text') jsonText += block.text
    }

    jsonText = jsonText.trim()
    // Strip markdown code blocks if present
    jsonText = jsonText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()

    const startIdx = jsonText.indexOf('[')
    const endIdx = jsonText.lastIndexOf(']')
    if (startIdx === -1 || endIdx === -1) throw new Error('No JSON array found in response')

    const opportunities = JSON.parse(jsonText.slice(startIdx, endIdx + 1))

    let inserted = 0
    for (const opp of opportunities) {
      const { error } = await supabaseAdmin.from('opportunities').insert({
        ...opp,
        status: 'pending',
        ai_notes: `Found via AI search on ${new Date().toLocaleDateString()}`
      })
      if (!error) inserted++
    }

    await supabaseAdmin.from('search_logs')
      .update({ status: 'completed', opportunities_found: inserted, completed_at: new Date().toISOString() })
      .eq('id', log?.id)

    await supabaseAdmin.from('keywords')
      .update({ last_searched_at: new Date().toISOString() })
      .in('keyword', selectedKeywords)

    return NextResponse.json({ success: true, found: inserted })
  } catch (err: unknown) {
    await supabaseAdmin.from('search_logs')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('id', log?.id)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
