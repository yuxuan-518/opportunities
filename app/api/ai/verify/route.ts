


// import { NextRequest, NextResponse } from 'next/server'
// import { supabaseAdmin } from '@/lib/supabase-server'
// import { verifyAdmin } from '@/lib/auth'

// async function fetchWebContent(url: string): Promise<{ success: boolean; text: string }> {
//   try {
//     const controller = new AbortController()
//     const timer = setTimeout(() => controller.abort(), 10000)
//     const res = await fetch(url, {
//       signal: controller.signal,
//       headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OpportunityVerifier/1.0)' }
//     })
//     clearTimeout(timer)
//     if (!res.ok) return { success: false, text: `HTTP ${res.status}` }
//     const html = await res.text()
//     const text = html
//       .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
//       .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
//       .replace(/<[^>]+>/g, ' ')
//       .replace(/\s+/g, ' ')
//       .trim()
//       .slice(0, 3000)
//     return { success: true, text }
//   } catch {
//     return { success: false, text: 'Failed to fetch' }
//   }
// }

// export async function POST(req: NextRequest) {
//   const admin = verifyAdmin(req)
//   if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

//   const { data: opportunities } = await supabaseAdmin
//     .from('opportunities')
//     .select('id, title, deadline, grade_levels, fields, website_url, organization, description')
//     .eq('status', 'published')

//   if (!opportunities?.length) return NextResponse.json({ message: 'No opportunities to verify' })

//   const { data: log } = await supabaseAdmin
//     .from('verification_logs')
//     .insert({ triggered_by: admin.username, opportunities_checked: opportunities.length, status: 'running' })
//     .select().single()

//   try {
//     let issuesFound = 0
//     const BATCH_SIZE = 5

//     for (let i = 0; i < opportunities.length; i += BATCH_SIZE) {
//       const batch = opportunities.slice(i, i + BATCH_SIZE)

//       const webContents = await Promise.all(
//         batch.map(o => o.website_url ? fetchWebContent(o.website_url) : Promise.resolve({ success: false, text: 'No URL' }))
//       )

//       const oppList = batch.map((o, idx) => {
//         const web = webContents[idx]
//         return `---
// ID: ${o.id}
// Title: ${o.title}
// Organization: ${o.organization || 'N/A'}
// URL: ${o.website_url || 'N/A'}
// URL accessible: ${web.success ? 'YES' : 'NO - ' + web.text}
// Stored deadline: ${o.deadline || 'not set'}
// Stored grade levels: ${(o.grade_levels || []).join(', ') || 'not set'}
// Stored fields: ${(o.fields || []).join(', ') || 'not set'}
// Website content preview: ${web.success ? web.text.slice(0, 800) : 'Could not fetch'}
// ---`
//       }).join('\n')

//       const response = await fetch('https://api.anthropic.com/v1/messages', {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json',
//           'x-api-key': process.env.ANTHROPIC_API_KEY!,
//           'anthropic-version': '2023-06-01',
//         },
//         body: JSON.stringify({
//           model: 'claude-haiku-4-5-20251001',
//           max_tokens: 2000,
//           messages: [{
//             role: 'user',
//             content: `You are verifying high school opportunity listings by comparing stored data against actual website content.

// For each opportunity, check:
// 1. Is the URL accessible? (if not, flag it)
// 2. Does the deadline on the website match the stored deadline? (if website shows a clearly different date, flag it)
// 3. Do the grade levels match? (if website says college students only or adults only, flag it)
// 4. Do the fields/subject areas match? (if website is clearly a different subject than stored, flag it)

// IMPORTANT RULES:
// - If the URL is inaccessible, flag as needs_review
// - If deadline has just passed, do NOT flag — that is normal
// - Only flag if there is a CLEAR, OBVIOUS mismatch
// - If website content is too vague to verify, mark as verified
// - Never flag just because information is incomplete

// Opportunities to verify:
// ${oppList}

// Return ONLY a raw JSON array (no markdown, no explanation) where each object has:
// - id: exact ID string
// - status: "verified" or "needs_review"
// - notes: null if verified, or specific reason mentioning which field mismatches if needs_review`
//           }]
//         })
//       })

//       const claudeData = await response.json()
//       if (claudeData.error) {
//         console.error(`Batch ${i} error:`, claudeData.error.message)
//         continue
//       }

//       let jsonText = ''
//       for (const block of claudeData.content || []) {
//         if (block.type === 'text') jsonText += block.text
//       }

//       jsonText = jsonText.trim()
//         .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()

//       const startIdx = jsonText.indexOf('[')
//       const endIdx = jsonText.lastIndexOf(']')
//       if (startIdx === -1 || endIdx === -1) {
//         console.error(`No JSON in batch ${i}`)
//         continue
//       }

//       let results: any[]
//       try {
//         results = JSON.parse(jsonText.slice(startIdx, endIdx + 1))
//       } catch {
//         console.error(`Parse error in batch ${i}`)
//         continue
//       }

//       for (const result of results) {
//         await supabaseAdmin.from('opportunities').update({
//           verification_status: result.status,
//           verification_notes: result.notes,
//           last_verified_at: new Date().toISOString()
//         }).eq('id', result.id)
//         if (result.status === 'needs_review') issuesFound++
//       }
//     }

//     await supabaseAdmin.from('verification_logs')
//       .update({ status: 'completed', issues_found: issuesFound, completed_at: new Date().toISOString() })
//       .eq('id', log?.id)

//     return NextResponse.json({ success: true, checked: opportunities.length, issues: issuesFound })

//   } catch (err: unknown) {
//     await supabaseAdmin.from('verification_logs')
//       .update({ status: 'failed', completed_at: new Date().toISOString() })
//       .eq('id', log?.id)
//     const message = err instanceof Error ? err.message : 'Unknown error'
//     return NextResponse.json({ error: message }, { status: 500 })
//   }
// }



import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { verifyAdmin } from '@/lib/auth'

async function checkUrl(url: string): Promise<{ alive: boolean; reason: string }> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OpportunityVerifier/1.0)' },
      redirect: 'follow'
    })
    clearTimeout(timer)
    // 403 = 拒绝爬虫但网站存在，不算死链
    // 404/410 = 真的不存在
    if (res.status === 404 || res.status === 410 || res.status === 400) {
      return { alive: false, reason: `HTTP ${res.status} - page not found` }
    }
    return { alive: true, reason: '' }
  } catch (err: any) {
    if (err.name === 'AbortError') return { alive: false, reason: 'Connection timed out' }
    if (err.message?.includes('ENOTFOUND') || err.message?.includes('getaddrinfo')) {
      return { alive: false, reason: 'Domain does not exist' }
    }
    // 其他网络错误（SSL、连接拒绝等）不算死链
    return { alive: true, reason: '' }
  }
}

export async function POST(req: NextRequest) {
  const admin = verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: opportunities } = await supabaseAdmin
    .from('opportunities')
    .select('id, title, website_url')
    .eq('status', 'published')

  if (!opportunities?.length) return NextResponse.json({ message: 'No opportunities to verify' })

  const { data: log } = await supabaseAdmin
    .from('verification_logs')
    .insert({ triggered_by: admin.username, opportunities_checked: opportunities.length, status: 'running' })
    .select().single()

  try {
    let issuesFound = 0

    // 并行检查所有 URL，每批10个
    const BATCH_SIZE = 10
    for (let i = 0; i < opportunities.length; i += BATCH_SIZE) {
      const batch = opportunities.slice(i, i + BATCH_SIZE)

      const results = await Promise.all(
        batch.map(async (opp) => {
          if (!opp.website_url) {
            return { id: opp.id, status: 'needs_review', notes: 'No URL provided' }
          }
          const { alive, reason } = await checkUrl(opp.website_url)
          return {
            id: opp.id,
            status: alive ? 'verified' : 'needs_review',
            notes: alive ? null : `URL inaccessible: ${reason}`
          }
        })
      )

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