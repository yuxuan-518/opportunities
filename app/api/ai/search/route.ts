import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyAdmin } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const admin = verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 获取所有活跃关键词
  const { data: keywords } = await supabaseAdmin
    .from('keywords')
    .select('keyword')
    .eq('active', true)

  if (!keywords?.length) return NextResponse.json({ error: 'No keywords found' }, { status: 400 })

  // 随机打乱，每次取不同的关键词，避免重复搜同一批
  const shuffled = keywords.map(k => k.keyword).sort(() => Math.random() - 0.5)
  const selectedKeywords = shuffled.slice(0, 5) // 每次取5个关键词

  const { data: log } = await supabaseAdmin
    .from('search_logs')
    .insert({ triggered_by: admin.username, keywords_searched: selectedKeywords, status: 'running' })
    .select().single()

  let allOpportunities: any[] = []

  try {
    // 每个关键词单独搜索一次，结果累积
    for (const keyword of selectedKeywords) {
      try {
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
            tools: [
              {
                type: 'web_search_20250305',
                name: 'web_search',
              }
            ],
            messages: [{
              role: 'user',
              content: `You are building a database of extracurricular opportunities for high school students across the United States.

Use web_search to find real opportunities related to: "${keyword}"

Find 3-5 REAL, specific programs, competitions, internships, or scholarships for high school students. Each must have a real, working website URL.

Return ONLY a raw JSON array. Each object must have exactly these fields:
- title: string (exact program name)
- description: string (2-3 sentences)
- organization: string
- website_url: string (real URL you verified exists)
- type: one of ["competition","program","internship","scholarship","volunteer","research","workshop","other"]
- fields: array from ["STEM","Leadership","Journalism","Arts","Business","Community Service","Environment","Medicine","Law","Technology","College Prep","Social Justice"]
- grade_levels: array from ["9","10","11","12"]
- cost: one of ["free","paid","financial_aid_available"]
- cost_amount: string or null
- location_type: one of ["online","in_person","hybrid"]
- location: string or null (city/state if in_person)
- requirements: string
- deadline: string "YYYY-MM-DD" or null
- start_date: string "YYYY-MM-DD" or null
- duration: string or null
- search_keywords: ["${keyword}"]

Only include opportunities with verified, working URLs. Return ONLY the JSON array, no markdown.`
            }]
          })
        })

        const claudeData = await response.json()
        if (claudeData.error) {
          console.error(`Error for keyword "${keyword}":`, claudeData.error.message)
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
        if (startIdx === -1 || endIdx === -1) continue

        const batchOpps = JSON.parse(jsonText.slice(startIdx, endIdx + 1))
        allOpportunities = allOpportunities.concat(batchOpps)

        // 每个关键词之间等1秒，避免超速率限制
        await new Promise(resolve => setTimeout(resolve, 1000))

      } catch (keywordErr) {
        console.error(`Failed for keyword "${keyword}":`, keywordErr)
        continue
      }
    }

    let inserted = 0
    for (const opp of allOpportunities) {
      if (!opp.website_url) continue

      // 用 URL 去重：所有状态都查（包括 rejected、dismissed）
      const { data: existing } = await supabaseAdmin
        .from('opportunities')
        .select('id')
        .eq('website_url', opp.website_url)
        .limit(1)

      if (existing && existing.length > 0) continue

      const { ai_confidence, ...oppData } = opp

      const { error } = await supabaseAdmin.from('opportunities').insert({
        ...oppData,
        status: 'pending',
        ai_notes: `Found via AI search | keyword: "${opp.search_keywords?.[0] || 'unknown'}" | ${new Date().toLocaleDateString()}`
      })
      if (!error) inserted++
    }

    await supabaseAdmin.from('search_logs')
      .update({ status: 'completed', opportunities_found: inserted, completed_at: new Date().toISOString() })
      .eq('id', log?.id)

    await supabaseAdmin.from('keywords')
      .update({ last_searched_at: new Date().toISOString() })
      .in('keyword', selectedKeywords)

    return NextResponse.json({ success: true, found: inserted, total_raw: allOpportunities.length, keywords_used: selectedKeywords })

  } catch (err: unknown) {
    await supabaseAdmin.from('search_logs')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('id', log?.id)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
