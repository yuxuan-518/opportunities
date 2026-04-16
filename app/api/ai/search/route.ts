import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { verifyAdmin } from '@/lib/auth'

const TARGET_QUERY_COUNT = 6
const CONCURRENCY_LIMIT = 1
const PER_QUERY_TIMEOUT_MS = 75000
const RATE_LIMIT_WAIT_MS = 30000

const ALLOWED_TYPES = ['competition', 'program', 'internship', 'scholarship', 'volunteer', 'research', 'workshop', 'other']

const US_STATES: [string, string][] = [
  ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
  ['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['FL','Florida'],['GA','Georgia'],
  ['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],
  ['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],
  ['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],
  ['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],
  ['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],
  ['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],
  ['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],
  ['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],
]

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
    return u.origin + u.pathname.replace(/\/+$/, '') + (u.search ? '?' + u.search : '')
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
  if (!Array.isArray(obj.search_keywords)) return false
  return true
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function buildPrompt(query: string, stateCode: string | null, stateName: string | null): string {
  const locationRule = stateCode && stateName
    ? `CRITICAL: Only return opportunities that are PHYSICALLY LOCATED in ${stateName} (state code: ${stateCode}). Do NOT include nationwide programs, online-only programs, or programs in other states. The "state" field MUST be "${stateCode}". If you cannot find enough ${stateName}-specific opportunities, return fewer results — never include non-${stateName} programs to fill the quota.`
    : `Include both nationwide and location-specific opportunities. For online programs, set "state" to null.`

  return `Find 2–3 real extracurricular opportunities for U.S. high school students (grades 9–12) related to: "${query}"

${locationRule}

Rules:
- Only official program/competition/scholarship pages
- Must clearly accept high school students
- Must have a real working URL
- If unsure about eligibility, skip it
- "Rising" students (e.g. "rising 12th graders") means they are currently one grade below — a rising 12th grader is currently in 11th grade
- Return fewer than 3 if needed — never fabricate

Return ONLY a JSON array. Each object:
{
  "title": "exact official name",
  "organization": "official org name",
  "website_url": "direct official URL",
  "type": "competition|program|internship|scholarship|volunteer|research|workshop|other",
  "grade_levels": ["9","10","11","12"],
  "location_type": "${stateCode ? 'in_person|hybrid' : 'online|in_person|hybrid'}",
  "location": "${stateCode ? `city, ${stateName}` : 'city, state or null'}",
  "state": "${stateCode ? stateCode : '2-letter state code or null if online/nationwide'}",
  "short_description": "1-2 sentences",
  "search_keywords": ["${query}"]
}

No markdown, no explanation. JSON array only.`
}

async function callClaudeWithRetry(query: string, stateCode: string | null, stateName: string | null): Promise<{ data: any, rateLimited: boolean, timedOut: boolean }> {
  for (let attempt = 0; attempt < 2; attempt++) {
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
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 800,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{
            role: 'user',
            content: buildPrompt(query, stateCode, stateName)
          }]
        })
      })

      clearTimeout(timer)
      const data = await response.json()

      if (data.error?.type === 'rate_limit_error' || data.error?.message?.includes('rate limit')) {
        console.error(`Rate limit hit for "${query}", attempt ${attempt + 1}`)
        if (attempt === 0) {
          await sleep(RATE_LIMIT_WAIT_MS)
          continue
        }
        return { data: null, rateLimited: true, timedOut: false }
      }

      return { data, rateLimited: false, timedOut: false }

    } catch (err: any) {
      clearTimeout(timer)
      if (err.name === 'AbortError') {
        console.error(`Timeout for query: "${query}"`)
        return { data: null, rateLimited: false, timedOut: true }
      }
      console.error(`Error for query "${query}":`, err)
      return { data: null, rateLimited: false, timedOut: false }
    }
  }
  return { data: null, rateLimited: true, timedOut: false }
}

async function fetchClaudeResultsForQuery(query: string, stateCode: string | null, stateName: string | null): Promise<{
  results: any[]
  success: boolean
  timedOut: boolean
  rateLimited: boolean
}> {
  const { data: claudeData, rateLimited, timedOut } = await callClaudeWithRetry(query, stateCode, stateName)

  if (!claudeData) return { results: [], success: false, timedOut, rateLimited }
  if (claudeData.error) {
    console.error(`Claude error for "${query}":`, claudeData.error.message)
    return { results: [], success: false, timedOut: false, rateLimited: false }
  }

  let jsonText = ''
  for (const block of claudeData.content || []) {
    if (block.type === 'text') jsonText += block.text
  }
  jsonText = jsonText.trim()
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()

  const startIdx = jsonText.indexOf('[')
  const endIdx = jsonText.lastIndexOf(']')
  if (startIdx === -1 || endIdx === -1) return { results: [], success: false, timedOut: false, rateLimited: false }

  try {
    const parsed = JSON.parse(jsonText.slice(startIdx, endIdx + 1))
    let valid = Array.isArray(parsed) ? parsed.filter(isValidOpportunity) : []

    // 如果指定了州，过滤掉 state 不匹配的结果
    if (stateCode) {
      valid = valid.filter((opp: any) => opp.state === stateCode)
    }

    return { results: valid, success: true, timedOut: false, rateLimited: false }
  } catch {
    return { results: [], success: false, timedOut: false, rateLimited: false }
  }
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
    case 3: return `${field || ''} ${type || ''} high school students`.trim()
    default: return `${field || ''} ${type || ''} high school`.trim()
  }
}

// ─── 主处理函数 ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const admin = verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let bodyState: string | null = null
  let bodyFields: string[] | null = null
  try {
    const body = await req.json()
    bodyState = body.state || null
    bodyFields = body.fields?.length > 0 ? body.fields : null
  } catch { /* body 为空时忽略 */ }

  const stateFullName = bodyState
    ? US_STATES.find(([code]) => code === bodyState)?.[1] || null
    : null

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
      const loc = stateFullName
        ? stateFullName
        : (Math.random() > 0.4 ? randomPick(locList) : null)
      const field = bodyFields ? randomPick(bodyFields) : randomPick(fieldList)
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
  let queriesRateLimited = 0

  try {
    const batchResults = await runWithConcurrencyLimit(
      searchQueries,
      CONCURRENCY_LIMIT,
      async (query) => {
        const { results, success, timedOut, rateLimited } = await fetchClaudeResultsForQuery(query, bodyState, stateFullName)
        if (timedOut) queriesTimedOut++
        else if (rateLimited) queriesRateLimited++
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
      const { error } = await supabaseAdmin.from('opportunities').insert({
        title: opp.title,
        organization: opp.organization,
        website_url: opp.website_url.trim(),
        type: opp.type,
        grade_levels: opp.grade_levels,
        location_type: opp.location_type,
        location: opp.location || null,
        state: opp.state || null,
        description: opp.short_description || '',
        fields: opp.fields || [],
        cost: opp.cost || 'free',
        cost_amount: opp.cost_amount || null,
        requirements: opp.requirements || '',
        deadline: opp.deadline || null,
        start_date: opp.start_date || null,
        duration: opp.duration || null,
        search_keywords: opp.search_keywords,
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
      total_raw: allOpportunities.length,
      queries_used: searchQueries.length,
      queries_succeeded: queriesSucceeded,
      queries_failed: queriesFailed,
      queries_timed_out: queriesTimedOut,
      queries_rate_limited: queriesRateLimited,
    })

  } catch (err: unknown) {
    await supabaseAdmin.from('search_logs')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('id', log?.id)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
