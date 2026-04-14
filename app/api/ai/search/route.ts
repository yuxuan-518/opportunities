import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyAdmin } from '@/lib/auth'

const TARGET_QUERY_COUNT = 8
const CONCURRENCY_LIMIT = 2
const PER_QUERY_TIMEOUT_MS = 75000

const ALLOWED_TYPES = ['competition', 'program', 'internship', 'scholarship', 'volunteer', 'research', 'workshop', 'other']

// ─── 工具函数 ────────────────────────────────────────────────────────────────

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.toLowerCase().trim())
    u.hash = ''
    const cleanParams = new URLSearchParams()
    for (const [k, v] of u.searchParams.entries()) {
      if (!k.startsWith('utm_')) cleanParams.set(k, v)
    }
    u.search = cleanParams.toString()
    return (u.origin + u.pathname.replace(/\/+$/, '') + (u.search ? '?' + u.search : ''))
  } catch {
    return url.toLowerCase().trim().replace(/\/+$/, '')
  }
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ').trim()
}

function isValidOpportunity(obj: any): boolean {
  if (!obj || typeof obj !== 'object') return false
  if (!obj.title || typeof obj.title !== 'string' || !obj.title.trim()) return false
  if (!obj.organization || typeof obj.organization !== 'string' || !obj.organization.trim()) return false
  if (!obj.website_url || typeof obj.website_url !== 'string') return false
  if (!/^https?:\/\/.+/.test(obj.website_url.trim())) return false
  if (!ALLOWED_TYPES.includes(obj.type)) return false
  if (!Array.isArray(obj.grade_levels) || obj.grade_levels.length === 0) return false
  if (!Array.isArray(obj.fields)) return false
  if (!Array.isArray(obj.search_keywords)) return false
  return true
}

async function runWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let index = 0
  async function runNext(): Promise<void> {
    if (index >= items.length) return
    const current = index++
    results[current] = await worker(items[current])
    await runNext()
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runNext()))
  return results
}

async function fetchClaudeResultsForQuery(query: string): Promise<{
  results: any[]
  success: boolean
  timedOut: boolean
}> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PER_QUERY_TIMEOUT_MS)

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `You are curating a database of extracurricular opportunities for U.S. high school students (grades 9–12).

Use web_search to find opportunities related to: "${query}"

Find 3–4 REAL, specific opportunities. Follow these rules strictly:

INCLUDE only:
- Official program, competition, internship, scholarship, or research pages
- Pages that clearly state high school students (grades 9–12) are eligible
- Programs based in the United States or open nationally to U.S. students

EXCLUDE:
- Blog posts, listicles, roundups, or third-party summaries
- Vague directory pages or aggregator sites
- Programs where high school eligibility is unclear
- Pages without a direct, working official URL

If you are not sure whether a program accepts high school students → do NOT include it.
If deadline or start_date is unknown → return null, do not guess.
If you cannot find 3–4 results that meet these criteria → return fewer, do not fabricate.

Return ONLY a raw JSON array. Each object must have exactly these fields:
- title: string (exact official name)
- description: string (2–3 factual sentences)
- organization: string (official name)
- website_url: string (direct official URL)
- type: one of ["competition","program","internship","scholarship","volunteer","research","workshop","other"]
- fields: array from ["STEM","Leadership","Journalism","Arts","Business","Community Service","Environment","Medicine","Law","Technology","College Prep","Social Justice"]
- grade_levels: array from ["9","10","11","12"]
- cost: one of ["free","paid","financial_aid_available"]
- cost_amount: string or null
- location_type: one of ["online","in_person","hybrid"]
- location: string or null
- requirements: string
- deadline: "YYYY-MM-DD" or null
- start_date: "YYYY-MM-DD" or null
- duration: string or null
- search_keywords: ["${query}"]

Return ONLY the JSON array. No markdown, no explanation.`
        }]
      })
    })

    clearTimeout(timer)
    const claudeData = await response.json()

    if (claudeData.error) {
      console.error(`Claude error for "${query}":`, claudeData.error.message)
      return { results: [], success: false, timedOut: false }
    }

    let jsonText = ''
    for (const block of claudeData.content || []) {
      if (block.type === 'text') jsonText += block.text
    }
    jsonText = jsonText.trim()
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()

    const startIdx = jsonText.indexOf('[')
    const endIdx = jsonText.lastIndexOf(']')
    if (startIdx === -1 || endIdx === -1) return { results: [], success: false, timedOut: false }

    const parsed = JSON.parse(jsonText.slice(startIdx, endIdx + 1))
    const valid = Array.isArray(parsed) ? parsed.filter(isValidOpportunity) : []
    return { results: valid, success: true, timedOut: false }

  } catch (err: any) {
    clearTimeout(timer)
    if (err.name === 'AbortError') {
      console.error(`Timeout for query: "${query}"`)
      return { results: [], success: false, timedOut: true }
    }
    console.error(`Failed for query "${query}":`, err)
    return { results: [], success: false, timedOut: false }
  }
}

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

// ─── 主处理函数 ──────────────────────────────────────────────────────────────

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
    while (searchQueries.length < TARGET_QUERY_COUNT && attempts < TARGET_QUERY_COUNT * 5) {
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
    searchQueries = keywords.map(k => k.keyword).sort(() => Math.random() - 0.5).slice(0, TARGET_QUERY_COUNT)
  }

  const { data: log } = await supabaseAdmin
    .from('search_logs')
    .insert({ triggered_by: admin.username, keywords_searched: searchQueries, status: 'running' })
    .select().single()

  let queriesSucceeded = 0
  let queriesFailed = 0
  let queriesTimedOut = 0

  try {
    const batchResults = await runWithConcurrencyLimit(
      searchQueries,
      CONCURRENCY_LIMIT,
      async (query) => {
        const { results, success, timedOut } = await fetchClaudeResultsForQuery(query)
        if (timedOut) queriesTimedOut++
        else if (success) queriesSucceeded++
        else queriesFailed++
        return results
      }
    )

    let allOpportunities = batchResults.flat()

    // ── 第一层：本次结果内部去重 ──
    const seenUrls = new Set<string>()
    const seenTitles = new Set<string>()
    allOpportunities = allOpportunities.filter(opp => {
      const url = normalizeUrl(opp.website_url)
      const title = normalizeTitle(opp.title)
      if (seenUrls.has(url) || seenTitles.has(title)) return false
      seenUrls.add(url)
      seenTitles.add(title)
      return true
    })

    // ── 第二层：与数据库已有记录去重 ──
    const { data: existingRecords } = await supabaseAdmin
      .from('opportunities').select('website_url, title')

    const existingUrls = new Set((existingRecords || []).map(r => normalizeUrl(r.website_url)))
    const existingTitles = new Set((existingRecords || []).map(r => normalizeTitle(r.title)))

    allOpportunities = allOpportunities.filter(opp =>
      !existingUrls.has(normalizeUrl(opp.website_url)) &&
      !existingTitles.has(normalizeTitle(opp.title))
    )

    // ── 插入数据库 ──
    let inserted = 0
    for (const opp of allOpportunities) {
      const { ai_confidence, ...oppData } = opp
      const { error } = await supabaseAdmin.from('opportunities').insert({
        ...oppData,
        website_url: opp.website_url.trim(),
        status: 'pending',
        ai_notes: `Query: "${opp.search_keywords?.[0] || ''}" | ${new Date().toLocaleDateString()}`
      })
      if (!error) inserted++
    }

    await supabaseAdmin.from('search_logs')
      .update({
        status: 'completed',
        opportunities_found: inserted,
        completed_at: new Date().toISOString()
      })
      .eq('id', log?.id)

    return NextResponse.json({
      success: true,
      found: inserted,
      total_raw: batchResults.flat().length,
      queries_used: searchQueries.length,
      queries_succeeded: queriesSucceeded,
      queries_failed: queriesFailed,
      queries_timed_out: queriesTimedOut,
    })

  } catch (err: unknown) {
    await supabaseAdmin.from('search_logs')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('id', log?.id)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
