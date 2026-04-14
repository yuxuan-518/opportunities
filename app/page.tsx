'use client'
import { useEffect, useState } from 'react'
import { Opportunity, OPPORTUNITY_TYPES, FIELDS, GRADE_LEVELS } from '@/lib/types'

const COST_LABELS: Record<string, string> = { free: 'Free', paid: 'Paid', financial_aid_available: 'Aid Available' }
const LOCATION_LABELS: Record<string, string> = { online: 'Online', in_person: 'In Person', hybrid: 'Hybrid' }
const TYPE_COLORS: Record<string, string> = {
  competition: '#e74c3c', program: '#3498db', internship: '#2ecc71',
  scholarship: '#f39c12', volunteer: '#9b59b6', research: '#1abc9c',
  workshop: '#e67e22', other: '#95a5a6'
}

export default function HomePage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterField, setFilterField] = useState('')
  const [filterGrade, setFilterGrade] = useState('')
  const [filterCost, setFilterCost] = useState('')
  const [filterLocation, setFilterLocation] = useState('')
  const [filterOpenOnly, setFilterOpenOnly] = useState(false) // 新增：只看开放中
  const [selected, setSelected] = useState<Opportunity | null>(null)

  const fetchOpportunities = async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (filterType) params.set('type', filterType)
    if (filterField) params.set('field', filterField)
    if (filterGrade) params.set('grade', filterGrade)
    if (filterCost) params.set('cost', filterCost)
    const res = await fetch('/api/opportunities?' + params)
    const data = await res.json()
    let filtered = Array.isArray(data) ? data : []
    if (filterLocation) filtered = filtered.filter((o: Opportunity) => o.location_type === filterLocation)
    // 只看开放中：过滤掉截止日期已过的项目（没有截止日期的视为仍开放）
    if (filterOpenOnly) {
      const now = Date.now()
      filtered = filtered.filter((o: Opportunity) => {
        if (!o.deadline) return true // 没有截止日期 = 滚动申请，视为开放
        return new Date(o.deadline).getTime() >= now
      })
    }
    setOpportunities(filtered)
    setLoading(false)
  }

  useEffect(() => { fetchOpportunities() }, [search, filterType, filterField, filterGrade, filterCost, filterLocation, filterOpenOnly])

  const deadlineSoon = (d: string | null) => {
    if (!d) return false
    const diff = (new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    return diff >= 0 && diff <= 30
  }

  const deadlinePassed = (d: string | null) => {
    if (!d) return false
    return new Date(d).getTime() < Date.now()
  }

  const hasActiveFilters = filterType || filterField || filterGrade || filterCost || filterLocation || filterOpenOnly || search

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fa', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <div style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', padding: '40px 24px 60px', color: 'white' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
            <div>
              <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0 }}>🎓 Opportunities & Programs</h1>
              <p style={{ margin: '8px 0 0', opacity: 0.75, fontSize: 15 }}>Curated extracurricular opportunities for high school students</p>
            </div>
            <a href="/admin" style={{ background: 'rgba(255,255,255,0.1)', color: 'white', padding: '8px 16px', borderRadius: 8, textDecoration: 'none', fontSize: 14, border: '1px solid rgba(255,255,255,0.2)' }}>Admin</a>
          </div>
          <div style={{ position: 'relative' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search opportunities..."
              style={{ width: '100%', padding: '14px 20px 14px 48px', borderRadius: 12, border: 'none', fontSize: 16, background: 'rgba(255,255,255,0.95)', boxSizing: 'border-box', outline: 'none' }} />
            <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 20 }}>🔍</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '-20px auto 0', padding: '0 24px 40px' }}>
        <div style={{ background: 'white', borderRadius: 12, padding: '16px 20px', marginBottom: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.08)', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#666' }}>FILTER:</span>
          {[
            { label: 'All Types', value: filterType, set: setFilterType, options: Object.entries(OPPORTUNITY_TYPES).map(([v,l]) => ({value:v,label:l})) },
            { label: 'All Fields', value: filterField, set: setFilterField, options: FIELDS.map(f => ({value:f,label:f})) },
            { label: 'All Grades', value: filterGrade, set: setFilterGrade, options: GRADE_LEVELS.map(g => ({value:g,label:`Grade ${g}`})) },
            { label: 'Any Cost', value: filterCost, set: setFilterCost, options: [{value:'free',label:'Free'},{value:'paid',label:'Paid'},{value:'financial_aid_available',label:'Aid Available'}] },
            { label: 'Any Location', value: filterLocation, set: setFilterLocation, options: [{value:'online',label:'Online'},{value:'in_person',label:'In Person'},{value:'hybrid',label:'Hybrid'}] },
          ].map(({ label, value, set, options }) => (
            <select key={label} value={value} onChange={e => set(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 13, background: value ? '#e8f4fd' : 'white', cursor: 'pointer', outline: 'none' }}>
              <option value="">{label}</option>
              {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ))}

          {/* 只看开放中 toggle */}
          <button
            onClick={() => setFilterOpenOnly(v => !v)}
            style={{
              padding: '8px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 500,
              border: filterOpenOnly ? '1px solid #27ae60' : '1px solid #e0e0e0',
              background: filterOpenOnly ? '#eafaf1' : 'white',
              color: filterOpenOnly ? '#27ae60' : '#666',
              transition: 'all 0.15s'
            }}>
            {filterOpenOnly ? '✅ Open Only' : '📅 Open Only'}
          </button>

          {hasActiveFilters && (
            <button onClick={() => { setFilterType(''); setFilterField(''); setFilterGrade(''); setFilterCost(''); setFilterLocation(''); setFilterOpenOnly(false); setSearch('') }}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ffcccc', background: '#fff5f5', color: '#e74c3c', fontSize: 13, cursor: 'pointer' }}>✕ Clear</button>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 13, color: '#999' }}>{opportunities.length} results</span>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>Loading...</div>
        ) : opportunities.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔎</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>No opportunities found</div>
            <div style={{ fontSize: 14, marginTop: 8 }}>Try adjusting your filters</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
            {opportunities.map(opp => (
              <div key={opp.id} onClick={() => setSelected(opp)}
                style={{
                  background: 'white', borderRadius: 12, padding: 20,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)', cursor: 'pointer',
                  border: deadlinePassed(opp.deadline) ? '1px solid #f0e0e0' : '1px solid #f0f0f0',
                  opacity: deadlinePassed(opp.deadline) ? 0.75 : 1,
                  transition: 'all 0.15s'
                }}
                onMouseEnter={e => { const d = e.currentTarget as HTMLDivElement; d.style.transform='translateY(-2px)'; d.style.boxShadow='0 8px 24px rgba(0,0,0,0.12)' }}
                onMouseLeave={e => { const d = e.currentTarget as HTMLDivElement; d.style.transform=''; d.style.boxShadow='0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ background: TYPE_COLORS[opp.type]||'#95a5a6', color: 'white', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{OPPORTUNITY_TYPES[opp.type]}</span>
                  <span style={{ fontSize: 11, color: opp.cost==='free' ? '#27ae60' : '#e67e22', fontWeight: 600 }}>{COST_LABELS[opp.cost]}</span>
                </div>
                <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: '#1a1a2e', lineHeight: 1.3 }}>{opp.title}</h3>
                {opp.organization && <p style={{ margin: '0 0 8px', fontSize: 13, color: '#666' }}>🏛 {opp.organization}</p>}
                <p style={{ margin: '0 0 12px', fontSize: 13, color: '#555', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{opp.description}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {opp.fields.slice(0,3).map(f => <span key={f} style={{ background: '#f0f4ff', color: '#3498db', padding: '2px 8px', borderRadius: 12, fontSize: 11 }}>{f}</span>)}
                  {opp.fields.length > 3 && <span style={{ fontSize: 11, color: '#999' }}>+{opp.fields.length-3}</span>}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#888' }}>
                  <span>📍 {LOCATION_LABELS[opp.location_type]}</span>
                  {opp.deadline && (
                    <span style={{
                      color: deadlinePassed(opp.deadline) ? '#aaa' : deadlineSoon(opp.deadline) ? '#e74c3c' : '#888',
                      fontWeight: deadlineSoon(opp.deadline) ? 600 : 400
                    }}>
                      {deadlinePassed(opp.deadline) ? '🔒 Closed ' : deadlineSoon(opp.deadline) ? '⚠️ ' : '📅 '}
                      {deadlinePassed(opp.deadline) ? new Date(opp.deadline).toLocaleDateString() : `Due ${new Date(opp.deadline).toLocaleDateString()}`}
                    </span>
                  )}
                </div>
                {opp.grade_levels.length > 0 && <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>Grades: {opp.grade_levels.map(g=>`${g}th`).join(', ')}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 16, maxWidth: 640, width: '100%', maxHeight: '85vh', overflow: 'auto', padding: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <span style={{ background: TYPE_COLORS[selected.type], color: 'white', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>{OPPORTUNITY_TYPES[selected.type]}</span>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#666' }}>×</button>
            </div>
            <h2 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, color: '#1a1a2e' }}>{selected.title}</h2>
            {selected.organization && <p style={{ margin: '0 0 16px', color: '#666' }}>🏛 {selected.organization}</p>}
            {deadlinePassed(selected.deadline) && (
              <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#b26a00' }}>
                ⚠️ This opportunity's deadline has passed. Check the official website for updated dates.
              </div>
            )}
            <p style={{ color: '#444', lineHeight: 1.7, marginBottom: 20 }}>{selected.description}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Type', value: OPPORTUNITY_TYPES[selected.type] },
                { label: 'Cost', value: selected.cost_amount ? `${COST_LABELS[selected.cost]} (${selected.cost_amount})` : COST_LABELS[selected.cost] },
                { label: 'Location', value: selected.location ? `${LOCATION_LABELS[selected.location_type]} — ${selected.location}` : LOCATION_LABELS[selected.location_type] },
                { label: 'Duration', value: selected.duration || 'N/A' },
                { label: 'Deadline', value: selected.deadline ? new Date(selected.deadline).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}) : 'Rolling / TBA' },
                { label: 'Grades', value: selected.grade_levels.length ? selected.grade_levels.map(g=>`${g}th`).join(', ') : 'All grades' },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: '#f8f9fa', padding: '10px 14px', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 2, textTransform: 'uppercase' }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>{value}</div>
                </div>
              ))}
            </div>
            {selected.fields.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: '#999', marginBottom: 8, textTransform: 'uppercase' }}>Fields</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selected.fields.map(f => <span key={f} style={{ background: '#e8f4fd', color: '#2980b9', padding: '4px 12px', borderRadius: 20, fontSize: 13 }}>{f}</span>)}
                </div>
              </div>
            )}
            {selected.requirements && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: '#999', marginBottom: 6, textTransform: 'uppercase' }}>Requirements</div>
                <p style={{ margin: 0, color: '#444', lineHeight: 1.6, fontSize: 14 }}>{selected.requirements}</p>
              </div>
            )}
            {selected.website_url && (
              <a href={selected.website_url} target="_blank" rel="noopener noreferrer"
                style={{ display: 'block', background: '#0f3460', color: 'white', textAlign: 'center', padding: 14, borderRadius: 10, textDecoration: 'none', fontWeight: 600, fontSize: 15 }}>
                Visit Official Website →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
