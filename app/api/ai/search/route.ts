import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyAdmin } from '@/lib/auth'

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function buildQuery(
  institution: string | null,
  location: string | null,
  field: string | null,
  type: string | null
): string {
  const strategy = Math.floor(Math.random() * 4)
  switch (strategy) {
    case 0: return `${institution || ''} ${field || ''} ${type || ''} high school students`.trim()
    case 1: return `${location || ''} ${field || ''} ${type || ''} high school`.trim()
    case 2: return `${institution || ''} ${location || ''} ${type || ''} high school program`.trim()
    case 3: return `${field || ''} ${type || ''} high school students nationwide`.trim()
    default: return `${field || ''} ${type || ''} high school`.trim()
  }
}

export async function POST(req: NextRequest) {
  const admin = verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [
    { data: institutions },
    { data: locations },
    { data: fields },
    { data: types }
  ] = await Promise.all([
    supabaseAdmin.from('dim_institutions').select('name').eq('active', true),
    supabaseAdmin.from('dim_locations').select('name').eq('active', true),
    supabaseAdmin.from('dim_fields').select('term').eq('active', true),
    supabaseAdmin.from('dim_types').select('term').eq('active', true),
  ])

  const useDimensions = (institutions?.length ?? 0) > 0

  let searchQueries: string[] = []

  if (useDimensions) {
    const instList = institutions!.map(i => i.name)
    const locList = locations!.map(l => l.name)
    const fieldList = fields!.map(f => f.term)
    const typeList = types!.map(t => t.term)

    const used = new Set<string>()
    let attempts = 0
    while (searchQueries.length < 5 && attempts < 50) {
      attempts++
      const inst = Math.random() > 0.3 ? randomPick(instList) : null
      const loc = Math.random() > 0.4 ? randomPick(locList) : null
      const field = randomPick(fieldList)
      const type = randomPick(typeList)
      const q = buildQuery(inst, loc, field, type)
      if (!used.has(q)) {
        used.add(q)
        searchQueries.push(q)
      }
    }
  } else {
    const { data: keywords } = await supabaseAdmin
      .from('keywords').select('keyword').eq('active', true)
    if (!keywords?.length) return NextResponse.json({ error: 'No keywords found' }, { status: 400 })
    const shuffled = keywords.map(k => k.keyword).sort(() => Math.random() - 0.5)
    searchQueries = shuffled.slice(0, 5)
  }

  const { data: log } = await supabaseAdmin
    .from('search_logs')
    .insert({ triggered_by: admin.username, keywords_searched: searchQueries, status: 'running' })
    .select().single()

  let allOpportunities: any[] = []

  try {
    for (const query of searchQueries) {
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
            tools: [{ type: 'web_search_20250305', name: 'web_search' }],
            messages: [{
              role: 'user',
              content: `You are building a database of extracurricular opportunities for high school students across the United States.

Use web_search to find real opportunities related to: "${query}"

Find 3-5 REAL, specific programs, competitions, internships, or scholarships for high school students. Each must have a real, working website URL. Do NOT make up programs.

Return ONLY a raw JSON array. Each object must have exactly these fields:
- title: string (exact program name)
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
- deadline: string "YYYY-MM-DD" or null
- start_date: string "YYYY-MM-DD" or null
- duration: string or null
- search_keywords: ["${query}"]

Return ONLY the JSON array, no markdown.`
            }]
          })
        })

        const claudeData = await response.json()
        if (claudeData.error) { console.error(`Error for "${query}":`, claudeData.error.message); continue }

        let jsonText = ''
        for (const block of claudeData.content || []) {
          if (block.type === 'text') jsonText += block.text
        }
        jsonText = jsonText.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()

        const startIdx = jsonText.indexOf('[')
        const endIdx = jsonText.lastIndexOf(']')
        if (startIdx === -1 || endIdx === -1) continue

        const batchOpps = JSON.parse(jsonText.slice(startIdx, endIdx + 1))
        allOpportunities = allOpportunities.concat(batchOpps)

        await new Promise(resolve => setTimeout(resolve, 1500))
      } catch (queryErr) {
        console.error(`Failed for "${query}":`, queryErr)
        continue
      }
    }

    let inserted = 0
    for (const opp of allOpportunities) {
      if (!opp.website_url) continue
      const { data: existing } = await supabaseAdmin
        .from('opportunities').select('id').eq('website_url', opp.website_url).limit(1)
      if (existing && existing.length > 0) continue

      const { ai_confidence, ...oppData } = opp
      const { error } = await supabaseAdmin.from('opportunities').insert({
        ...oppData,
        status: 'pending',
        ai_notes: `Query: "${opp.search_keywords?.[0] || ''}" | ${new Date().toLocaleDateString()}`
      })
      if (!error) inserted++
    }

    await supabaseAdmin.from('search_logs')
      .update({ status: 'completed', opportunities_found: inserted, completed_at: new Date().toISOString() })
      .eq('id', log?.id)

    return NextResponse.json({ success: true, found: inserted, total_raw: allOpportunities.length, queries_used: searchQueries })

  } catch (err: unknown) {
    await supabaseAdmin.from('search_logs')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('id', log?.id)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
