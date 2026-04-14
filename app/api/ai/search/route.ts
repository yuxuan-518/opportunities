import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyAdmin } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const admin = verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get active keywords
  const { data: keywords } = await supabaseAdmin
    .from('keywords')
    .select('keyword')
    .eq('active', true)
    .limit(20)

  if (!keywords?.length) return NextResponse.json({ error: 'No keywords found' }, { status: 400 })

  // Log search start
  const { data: log } = await supabaseAdmin
    .from('search_logs')
    .insert({
      triggered_by: admin.username,
      keywords_searched: keywords.map(k => k.keyword),
      status: 'running'
    })
    .select()
    .single()

  // Call Claude API with web search
  const selectedKeywords = keywords.slice(0, 10).map(k => k.keyword)

  try {
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
        max_tokens: 8000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `You are a research assistant helping to find extracurricular opportunities for high school students. 
          
Search the web using these keywords one by one and find real, current extracurricular programs, competitions, internships, scholarships, and other opportunities for high school students:

Keywords to search: ${selectedKeywords.join(', ')}

For each opportunity you find, extract and return a JSON array with objects containing these fields:
- title: string (full name of the program)
- description: string (2-3 sentence description)
- organization: string (organizing institution)
- website_url: string (official website URL)
- type: one of ['competition', 'program', 'internship', 'scholarship', 'volunteer', 'research', 'workshop', 'other']
- fields: array of applicable fields from ['STEM', 'Leadership', 'Journalism', 'Arts', 'Business', 'Community Service', 'Environment', 'Medicine', 'Law', 'Technology', 'College Prep', 'Social Justice']
- grade_levels: array of applicable grades from ['9', '10', '11', '12']
- cost: one of ['free', 'paid', 'financial_aid_available']
- cost_amount: string or null (e.g. "$500" if paid)
- location_type: one of ['online', 'in_person', 'hybrid']
- location: string or null (city/state if in person)
- requirements: string (eligibility requirements)
- deadline: string or null (YYYY-MM-DD format if known)
- start_date: string or null (YYYY-MM-DD format if known)
- duration: string or null (e.g. "6 weeks", "1 year")
- ai_confidence: integer 0-100 (how confident you are in the accuracy)
- search_keywords: array of keywords that found this opportunity

Find at least 15-20 distinct opportunities. Return ONLY a valid JSON array, no other text.`
        }]
      })
    })

    const claudeData = await response.json()
    
    // Extract text from response
    let jsonText = ''
    for (const block of claudeData.content || []) {
      if (block.type === 'text') {
        jsonText += block.text
      }
    }

    // Parse opportunities
    const jsonMatch = jsonText.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON array found in response')
    
    const opportunities = JSON.parse(jsonMatch[0])

    // Insert into database with pending status
    let inserted = 0
    for (const opp of opportunities) {
      const { error } = await supabaseAdmin
        .from('opportunities')
        .insert({
          ...opp,
          status: 'pending',
          ai_notes: `Found via AI search on ${new Date().toLocaleDateString()}`
        })
      if (!error) inserted++
    }

    // Update log
    await supabaseAdmin
      .from('search_logs')
      .update({ status: 'completed', opportunities_found: inserted, completed_at: new Date().toISOString() })
      .eq('id', log?.id)

    // Update keywords last_searched
    await supabaseAdmin
      .from('keywords')
      .update({ last_searched_at: new Date().toISOString() })
      .in('keyword', selectedKeywords)

    // Update system settings
    await supabaseAdmin
      .from('system_settings')
      .update({ value: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('key', 'last_auto_search')

    return NextResponse.json({ success: true, found: inserted })
  } catch (err: unknown) {
    await supabaseAdmin
      .from('search_logs')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('id', log?.id)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
