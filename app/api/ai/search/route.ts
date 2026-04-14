import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyAdmin } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const admin = verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 取所有活跃关键词，最多20个
  const { data: keywords } = await supabaseAdmin
    .from('keywords')
    .select('keyword')
    .eq('active', true)
    .limit(20)

  if (!keywords?.length) return NextResponse.json({ error: 'No keywords found' }, { status: 400 })

  const { data: log } = await supabaseAdmin
    .from('search_logs')
    .insert({ triggered_by: admin.username, keywords_searched: keywords.map(k => k.keyword), status: 'running' })
    .select().single()

  // 每次取8个关键词，分两批搜索，提高覆盖量
  const selectedKeywords = keywords.slice(0, 16).map(k => k.keyword)
  const batch1 = selectedKeywords.slice(0, 8)
  const batch2 = selectedKeywords.slice(8, 16)

  let allOpportunities: any[] = []

  try {
    // 对每批关键词各发一次请求，使用 web_search 工具真正搜索网络
    for (const batch of [batch1, batch2].filter(b => b.length > 0)) {
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
          tools: [
            {
              type: 'web_search_20250305',
              name: 'web_search',
            }
          ],
          messages: [{
            role: 'user',
            content: `You are a research assistant building a high school extracurricular opportunities database. 

Use web_search to find REAL, currently active opportunities for high school students based on these keywords: ${batch.join(', ')}

For each keyword, search for real programs, competitions, internships, and scholarships. Verify the URLs actually work and the programs are real. Focus on well-known, reputable organizations.

After searching, return a JSON array of 8-12 real opportunities you found. Each object must have exactly these fields:
- title: string (exact program name)
- description: string (2-3 sentences, accurate to what you found)
- organization: string (exact organization name)
- website_url: string (real, verified URL you actually found)
- type: one of ["competition","program","internship","scholarship","volunteer","research","workshop","other"]
- fields: array from ["STEM","Leadership","Journalism","Arts","Business","Community Service","Environment","Medicine","Law","Technology","College Prep","Social Justice"] — choose based on the actual program content
- grade_levels: array from ["9","10","11","12"] — based on actual eligibility requirements
- cost: one of ["free","paid","financial_aid_available"] — based on actual program info
- cost_amount: string or null
- location_type: one of ["online","in_person","hybrid"]
- location: string or null
- requirements: string (based on actual requirements)
- deadline: string in "YYYY-MM-DD" format or null (based on actual deadline found)
- start_date: string in "YYYY-MM-DD" format or null
- duration: string or null
- ai_confidence: integer 0-100 (how confident you are the info is accurate and URL works)
- search_keywords: array of strings (which keywords this matched)

CRITICAL RULES:
- Only include opportunities where you actually found and verified the URL
- Do NOT include programs if the URL returns a 404 or the page seems abandoned
- Set ai_confidence below 60 if you are unsure about any details
- Grade levels and type MUST be based on what you actually found on the website, not guesses
- Return ONLY a raw JSON array starting with [ and ending with ]. No markdown, no code blocks, no explanation.`
          }]
        })
      })

      const claudeData = await response.json()
      if (claudeData.error) {
        console.error('Claude API error for batch:', claudeData.error.message)
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
        console.error('No JSON array in response for batch')
        continue
      }

      try {
        const batchOpps = JSON.parse(jsonText.slice(startIdx, endIdx + 1))
        allOpportunities = allOpportunities.concat(batchOpps)
      } catch (parseErr) {
        console.error('JSON parse error for batch:', parseErr)
        continue
      }
    }

    // 过滤掉低置信度的结果
    const filteredOpportunities = allOpportunities.filter(
      opp => !opp.ai_confidence || opp.ai_confidence >= 60
    )

    let inserted = 0
    for (const opp of filteredOpportunities) {
      // 检查是否已存在相同标题+机构的项目，避免重复
      const { data: existing } = await supabaseAdmin
        .from('opportunities')
        .select('id')
        .eq('title', opp.title)
        .eq('organization', opp.organization)
        .limit(1)

      if (existing && existing.length > 0) continue

      const { error } = await supabaseAdmin.from('opportunities').insert({
        ...opp,
        status: 'pending',
        ai_notes: `Found via AI web search on ${new Date().toLocaleDateString()}. Confidence: ${opp.ai_confidence ?? 'N/A'}%`
      })
      if (!error) inserted++
    }

    await supabaseAdmin.from('search_logs')
      .update({ status: 'completed', opportunities_found: inserted, completed_at: new Date().toISOString() })
      .eq('id', log?.id)

    await supabaseAdmin.from('keywords')
      .update({ last_searched_at: new Date().toISOString() })
      .in('keyword', selectedKeywords)

    return NextResponse.json({ success: true, found: inserted, total_raw: allOpportunities.length })

  } catch (err: unknown) {
    await supabaseAdmin.from('search_logs')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('id', log?.id)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
