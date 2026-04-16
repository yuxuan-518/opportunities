'use client'
import { useEffect, useState } from 'react'
import { Opportunity, OPPORTUNITY_TYPES, FIELDS, GRADE_LEVELS } from '@/lib/types'

type Tab = 'new' | 'review' | 'published' | 'rejected' | 'keywords'

const COST_LABELS: Record<string, string> = { free: 'Free', paid: 'Paid', financial_aid_available: 'Aid Available' }
const TYPE_COLORS: Record<string, string> = {
  competition: '#e74c3c', program: '#3498db', internship: '#2ecc71',
  scholarship: '#f39c12', volunteer: '#9b59b6', research: '#1abc9c',
  workshop: '#e67e22', other: '#95a5a6'
}

const EMPTY_OPP: Partial<Opportunity> = {
  title: '', organization: '', website_url: '', description: '', requirements: '',
  type: 'program', cost: 'free', location_type: 'online', location: '',
  deadline: '', start_date: '', end_date: '', duration: '', cost_amount: '',
  fields: [], grade_levels: [], admin_notes: ''
}

const US_STATES = [
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

export default function AdminPage() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [admin, setAdmin] = useState<{ username: string; display_name: string } | null>(null)
  const [loginUser, setLoginUser] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [loginError, setLoginError] = useState('')
  const [tab, setTab] = useState<Tab>('new')
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<Opportunity | null>(null)
  const [adding, setAdding] = useState<Partial<Opportunity> | null>(null)
  const [aiSearching, setAiSearching] = useState(false)
  const [aiVerifying, setAiVerifying] = useState(false)
  const [msg, setMsg] = useState('')
  const [keywords, setKeywords] = useState<{ id: string; keyword: string; category: string; active: boolean }[]>([])
  const [newKeyword, setNewKeyword] = useState('')
  const [newKeywordCat, setNewKeywordCat] = useState('general')

  // AI Search modal state
  const [showAiModal, setShowAiModal] = useState(false)
  const [aiSearchState, setAiSearchState] = useState('')
  const [aiSearchFields, setAiSearchFields] = useState<string[]>([])

  useEffect(() => {
    const a = localStorage.getItem('admin_info')
    if (a) { setAdmin(JSON.parse(a)); setLoggedIn(true) }
  }, [])

  useEffect(() => {
    if (loggedIn) fetchOpportunities()
  }, [loggedIn, tab])

  const login = async () => {
    setLoginError('')
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username: loginUser, password: loginPass })
    })
    const data = await res.json()
    if (!res.ok) { setLoginError('Invalid username or password'); return }
    localStorage.setItem('admin_info', JSON.stringify(data.admin))
    setAdmin(data.admin)
    setLoggedIn(true)
  }

  const logout = async () => {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' })
    localStorage.removeItem('admin_info')
    setLoggedIn(false); setAdmin(null)
  }

  const jsonHeaders = () => ({ 'Content-Type': 'application/json' })

  const fetchOpportunities = async () => {
    setLoading(true)
    const statusMap: Record<Tab, string> = {
      new: 'pending', review: 'published', published: 'published', rejected: 'rejected', keywords: ''
    }
    if (tab === 'keywords') {
      const res = await fetch('/api/keywords', { credentials: 'include' })
      const data = await res.json()
      setKeywords(Array.isArray(data) ? data : [])
      setLoading(false)
      return
    }
    let url = `/api/admin/opportunities?status=${statusMap[tab]}`
    if (tab === 'review') url += '&verification=needs_review'
    const res = await fetch(url, { credentials: 'include' })
    const data = await res.json()
    let filtered = Array.isArray(data) ? data : []
    if (tab === 'review') filtered = filtered.filter((o: Opportunity) => o.verification_status === 'needs_review')
    setOpportunities(filtered)
    setLoading(false)
  }

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/opportunities/${id}`, {
      method: 'PATCH', headers: jsonHeaders(), credentials: 'include',
      body: JSON.stringify({ status, reviewed_at: new Date().toISOString() })
    })
    const msgs: Record<string, string> = {
      published: '✅ Published!', rejected: '❌ Rejected (permanent)',
      dismissed: '🔄 Dismissed (will reappear in future searches)', pending: '↩️ Moved to pending'
    }
    showMsg(msgs[status] || '✅ Done')
    fetchOpportunities()
  }

  const saveEdit = async () => {
    if (!editing) return
    await fetch(`/api/opportunities/${editing.id}`, {
      method: 'PATCH', headers: jsonHeaders(), credentials: 'include',
      body: JSON.stringify(editing)
    })
    setEditing(null)
    showMsg('✅ Saved!')
    fetchOpportunities()
  }

  const saveAdd = async () => {
    if (!adding?.title?.trim()) { showMsg('❌ Title is required'); return }
    if (!adding?.website_url?.trim()) { showMsg('❌ Website URL is required'); return }
    const res = await fetch('/api/opportunities', {
      method: 'POST', headers: jsonHeaders(), credentials: 'include',
      body: JSON.stringify({ ...adding, status: 'pending', search_keywords: [], verification_status: 'unverified' })
    })
    if (!res.ok) { showMsg('❌ Failed to add'); return }
    setAdding(null)
    showMsg('✅ Added! Check New Reviews tab.')
    if (tab === 'new') fetchOpportunities()
  }

  const deleteOpp = async (id: string) => {
    if (!confirm('Permanently delete this opportunity?')) return
    await fetch(`/api/opportunities/${id}`, { method: 'DELETE', credentials: 'include' })
    showMsg('🗑 Deleted')
    fetchOpportunities()
  }

  const openAiSearchModal = () => {
    setAiSearchState('')
    setAiSearchFields([])
    setShowAiModal(true)
  }

  const aiSearch = async () => {
    setShowAiModal(false)
    setAiSearching(true)
    const body: Record<string, any> = {}
    if (aiSearchState) body.state = aiSearchState
    if (aiSearchFields.length > 0) body.fields = aiSearchFields
    const res = await fetch('/api/ai/search', {
      method: 'POST',
      headers: jsonHeaders(),
      credentials: 'include',
      body: JSON.stringify(body)
    })
    const data = await res.json()
    setAiSearching(false)
    if (data.found !== undefined) {
      showMsg(`🤖 AI found ${data.found} new opportunities!`)
      if (tab === 'new') fetchOpportunities()
    } else { showMsg('❌ AI search failed: ' + data.error) }
  }

  const aiVerify = async () => {
    setAiVerifying(true)
    const res = await fetch('/api/ai/verify', { method: 'POST', credentials: 'include' })
    const data = await res.json()
    setAiVerifying(false)
    if (data.checked !== undefined) {
      showMsg(`🔍 Verified ${data.checked} opportunities, found ${data.issues} issues`)
      fetchOpportunities()
    } else { showMsg('❌ Verification failed: ' + data.error) }
  }

  const toggleKeyword = async (id: string, active: boolean) => {
    await fetch(`/api/keywords/${id}`, { method: 'PATCH', headers: jsonHeaders(), credentials: 'include', body: JSON.stringify({ active }) })
    fetchOpportunities()
  }

  const addKeyword = async () => {
    if (!newKeyword.trim()) return
    await fetch('/api/keywords', { method: 'POST', headers: jsonHeaders(), credentials: 'include', body: JSON.stringify({ keyword: newKeyword.trim(), category: newKeywordCat }) })
    setNewKeyword('')
    fetchOpportunities()
  }

  const toggleAiField = (f: string) => {
    setAiSearchFields(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f])
  }

  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 4000) }

  const renderFormFields = (data: Partial<Opportunity>, onChange: (key: string, val: any) => void) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {[
        { label: 'Title *', key: 'title' }, { label: 'Organization', key: 'organization' },
        { label: 'Website URL *', key: 'website_url' }, { label: 'Deadline (YYYY-MM-DD)', key: 'deadline' },
        { label: 'Start Date (YYYY-MM-DD)', key: 'start_date' }, { label: 'End Date (YYYY-MM-DD)', key: 'end_date' },
        { label: 'Duration', key: 'duration' }, { label: 'Location', key: 'location' }, { label: 'Cost Amount', key: 'cost_amount' },
      ].map(({ label, key }) => (
        <div key={key}>
          <label style={{ fontSize: 12, color: '#666', fontWeight: 600, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>{label}</label>
          <input value={(data as any)[key] || ''} onChange={e => onChange(key, e.target.value)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box', outline: 'none' }} />
        </div>
      ))}
      <div>
        <label style={{ fontSize: 12, color: '#666', fontWeight: 600, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Description</label>
        <textarea value={data.description || ''} onChange={e => onChange('description', e.target.value)} rows={3}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box', outline: 'none', resize: 'vertical' }} />
      </div>
      <div>
        <label style={{ fontSize: 12, color: '#666', fontWeight: 600, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Requirements</label>
        <textarea value={data.requirements || ''} onChange={e => onChange('requirements', e.target.value)} rows={2}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box', outline: 'none', resize: 'vertical' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <div>
          <label style={{ fontSize: 12, color: '#666', fontWeight: 600, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Type</label>
          <select value={data.type || 'program'} onChange={e => onChange('type', e.target.value)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, outline: 'none' }}>
            {Object.entries(OPPORTUNITY_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, color: '#666', fontWeight: 600, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Cost</label>
          <select value={data.cost || 'free'} onChange={e => onChange('cost', e.target.value)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, outline: 'none' }}>
            <option value="free">Free</option>
            <option value="paid">Paid</option>
            <option value="financial_aid_available">Aid Available</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, color: '#666', fontWeight: 600, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Location Type</label>
          <select value={data.location_type || 'online'} onChange={e => onChange('location_type', e.target.value)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, outline: 'none' }}>
            <option value="online">Online</option>
            <option value="in_person">In Person</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </div>
      </div>
      <div>
        <label style={{ fontSize: 12, color: '#666', fontWeight: 600, display: 'block', marginBottom: 8, textTransform: 'uppercase' }}>Fields</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {FIELDS.map(f => (
            <button key={f} onClick={() => onChange('fields', (data.fields || []).includes(f) ? (data.fields || []).filter((x: string) => x !== f) : [...(data.fields || []), f])}
              style={{ padding: '6px 12px', borderRadius: 20, border: '1px solid #ddd', fontSize: 12, cursor: 'pointer', background: (data.fields || []).includes(f) ? '#3498db' : 'white', color: (data.fields || []).includes(f) ? 'white' : '#666' }}>
              {f}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label style={{ fontSize: 12, color: '#666', fontWeight: 600, display: 'block', marginBottom: 8, textTransform: 'uppercase' }}>Grade Levels</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {GRADE_LEVELS.map(g => (
            <button key={g} onClick={() => onChange('grade_levels', (data.grade_levels || []).includes(g) ? (data.grade_levels || []).filter((x: string) => x !== g) : [...(data.grade_levels || []), g])}
              style={{ padding: '6px 16px', borderRadius: 20, border: '1px solid #ddd', fontSize: 13, cursor: 'pointer', background: (data.grade_levels || []).includes(g) ? '#0f3460' : 'white', color: (data.grade_levels || []).includes(g) ? 'white' : '#666' }}>
              Grade {g}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label style={{ fontSize: 12, color: '#666', fontWeight: 600, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Admin Notes</label>
        <textarea value={data.admin_notes || ''} onChange={e => onChange('admin_notes', e.target.value)} rows={2}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box', outline: 'none', resize: 'vertical' }} />
      </div>
    </div>
  )

  if (!loggedIn) return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e, #0f3460)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <div style={{ background: 'white', borderRadius: 16, padding: 40, width: 360, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 700, color: '#1a1a2e' }}>Admin Login</h1>
        <p style={{ margin: '0 0 28px', color: '#666', fontSize: 14 }}>Opportunities & Programs</p>
        <input value={loginUser} onChange={e => setLoginUser(e.target.value)} placeholder="Username"
          style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid #ddd', fontSize: 15, marginBottom: 12, boxSizing: 'border-box', outline: 'none' }} />
        <input value={loginPass} onChange={e => setLoginPass(e.target.value)} type="password" placeholder="Password"
          onKeyDown={e => e.key === 'Enter' && login()}
          style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid #ddd', fontSize: 15, marginBottom: 16, boxSizing: 'border-box', outline: 'none' }} />
        {loginError && <p style={{ color: '#e74c3c', fontSize: 13, marginBottom: 12 }}>{loginError}</p>}
        <button onClick={login} style={{ width: '100%', padding: 13, background: '#0f3460', color: 'white', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Login</button>
        <a href="/" style={{ display: 'block', textAlign: 'center', marginTop: 16, color: '#666', fontSize: 13, textDecoration: 'none' }}>← Back to student view</a>
      </div>
    </div>
  )

  const tabConfig = [
    { id: 'new', label: '📥 New Reviews' },
    { id: 'review', label: '⚠️ Needs Review' },
    { id: 'published', label: '✅ Published' },
    { id: 'rejected', label: '❌ Rejected' },
    { id: 'keywords', label: '🔑 Keywords' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <div style={{ background: '#1a1a2e', color: 'white', padding: '0 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 20, fontWeight: 700 }}>⚙️ Admin Panel</span>
            <span style={{ opacity: 0.5, fontSize: 14 }}>|</span>
            <span style={{ opacity: 0.7, fontSize: 14 }}>Opportunities & Programs</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ opacity: 0.7, fontSize: 14 }}>👤 {admin?.display_name || admin?.username}</span>
            <button onClick={() => setAdding({ ...EMPTY_OPP })}
              style={{ padding: '8px 14px', background: '#9b59b6', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
              ➕ Add Manually
            </button>
            <button onClick={openAiSearchModal} disabled={aiSearching}
              style={{ padding: '8px 14px', background: aiSearching ? '#555' : '#2ecc71', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, cursor: aiSearching ? 'default' : 'pointer', fontWeight: 600 }}>
              {aiSearching ? '🤖 Searching...' : '🤖 AI Search'}
            </button>
            <button onClick={aiVerify} disabled={aiVerifying}
              style={{ padding: '8px 14px', background: aiVerifying ? '#555' : '#3498db', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, cursor: aiVerifying ? 'default' : 'pointer', fontWeight: 600 }}>
              {aiVerifying ? '🔍 Verifying...' : '🔍 AI Verify'}
            </button>
            <a href="/" style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.1)', color: 'white', borderRadius: 8, fontSize: 13, textDecoration: 'none' }}>Student View</a>
            <button onClick={logout} style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>Logout</button>
          </div>
        </div>
      </div>

      <div style={{ background: 'white', borderBottom: '1px solid #e0e0e0', padding: '0 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', gap: 4 }}>
          {tabConfig.map(t => (
            <button key={t.id} onClick={() => setTab(t.id as Tab)}
              style={{ padding: '16px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, fontWeight: tab === t.id ? 700 : 400,
                color: tab === t.id ? '#0f3460' : '#666', borderBottom: tab === t.id ? '3px solid #0f3460' : '3px solid transparent' }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {msg && (
        <div style={{ position: 'fixed', top: 80, right: 24, background: '#1a1a2e', color: 'white', padding: '12px 20px', borderRadius: 10, zIndex: 9999, fontSize: 14, fontWeight: 600, maxWidth: 320 }}>
          {msg}
        </div>
      )}

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
        {tab === 'keywords' && (
          <div>
            <div style={{ background: 'white', borderRadius: 12, padding: 20, marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Add New Keyword</h3>
              <div style={{ display: 'flex', gap: 12 }}>
                <input value={newKeyword} onChange={e => setNewKeyword(e.target.value)} placeholder="Enter search keyword..."
                  style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, outline: 'none' }} />
                <select value={newKeywordCat} onChange={e => setNewKeywordCat(e.target.value)}
                  style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, outline: 'none' }}>
                  {['general','STEM','Medicine','Leadership','Journalism','Business','Arts','Law','Environment','Community Service','Competition','College Prep'].map(c =>
                    <option key={c} value={c}>{c}</option>)}
                </select>
                <button onClick={addKeyword} style={{ padding: '10px 20px', background: '#0f3460', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer', fontWeight: 600 }}>Add</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {keywords.map(k => (
                <div key={k.id} style={{ background: 'white', borderRadius: 10, padding: '12px 16px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: k.active ? 1 : 0.5 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>{k.keyword}</div>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{k.category}</div>
                  </div>
                  <button onClick={() => toggleKeyword(k.id, !k.active)}
                    style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ddd', background: k.active ? '#e8f8e8' : '#f5f5f5', color: k.active ? '#27ae60' : '#999', fontSize: 12, cursor: 'pointer' }}>
                    {k.active ? 'Active' : 'Inactive'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab !== 'keywords' && (
          loading ? <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>Loading...</div> :
          opportunities.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, background: 'white', borderRadius: 12, color: '#999' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>{tab === 'new' ? '📭' : tab === 'review' ? '✅' : '📋'}</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>
                {tab === 'new' ? 'No pending reviews' : tab === 'review' ? 'No issues found' : 'Nothing here yet'}
              </div>
              {tab === 'new' && <div style={{ fontSize: 14, marginTop: 8 }}>Click "AI Search" to find new opportunities, or "Add Manually" to add one yourself</div>}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {opportunities.map(opp => (
                <div key={opp.id} style={{ background: 'white', borderRadius: 12, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: opp.verification_status === 'needs_review' ? '2px solid #f39c12' : '1px solid #f0f0f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                        <span style={{ background: TYPE_COLORS[opp.type]||'#95a5a6', color: 'white', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{OPPORTUNITY_TYPES[opp.type]}</span>
                        <span style={{ background: '#f0f4ff', color: '#3498db', padding: '2px 10px', borderRadius: 20, fontSize: 11 }}>{COST_LABELS[opp.cost]}</span>
                        {opp.verification_status === 'needs_review' && <span style={{ background: '#fff8e1', color: '#f39c12', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>⚠️ Needs Review</span>}
                      </div>
                      <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700, color: '#1a1a2e' }}>{opp.title}</h3>
                      {opp.organization && <p style={{ margin: '0 0 8px', fontSize: 13, color: '#666' }}>🏛 {opp.organization}</p>}
                      <p style={{ margin: '0 0 8px', fontSize: 13, color: '#555', lineHeight: 1.5 }}>{opp.description}</p>
                      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#888', flexWrap: 'wrap' }}>
                        {opp.deadline && <span>📅 Deadline: {new Date(opp.deadline + 'T12:00:00').toLocaleDateString()}</span>}
                        {opp.website_url && <a href={opp.website_url} target="_blank" rel="noopener noreferrer" style={{ color: '#3498db' }}>🔗 Website</a>}
                        {opp.fields.length > 0 && <span>🏷 {opp.fields.join(', ')}</span>}
                        {opp.grade_levels.length > 0 && <span>👤 Grades: {opp.grade_levels.join(', ')}</span>}
                      </div>
                      {opp.verification_notes && (
                        <div style={{ marginTop: 10, padding: '8px 12px', background: '#fff8e1', borderRadius: 6, fontSize: 12, color: '#856404' }}>
                          ⚠️ AI Note: {opp.verification_notes}
                        </div>
                      )}
                      {opp.ai_notes && (
                        <div style={{ marginTop: 6, padding: '8px 12px', background: '#f0f4ff', borderRadius: 6, fontSize: 12, color: '#3498db' }}>
                          🤖 {opp.ai_notes}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 140 }}>
                      {tab === 'new' && <>
                        <button onClick={() => updateStatus(opp.id, 'published')}
                          style={{ padding: '8px 16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>✅ Publish</button>
                        <button onClick={() => setEditing(opp)}
                          style={{ padding: '8px 16px', background: '#3498db', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>✏️ Edit</button>
                        <button onClick={() => updateStatus(opp.id, 'dismissed')}
                          style={{ padding: '8px 16px', background: '#e67e22', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
                          title="Info has issues, but program is real — AI can find it again later">🔄 Dismiss</button>
                        <button onClick={() => updateStatus(opp.id, 'rejected')}
                          style={{ padding: '8px 16px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
                          title="Permanently reject — AI will never show this again">❌ Reject</button>
                      </>}
                      {tab === 'review' && <>
                        <button onClick={() => setEditing(opp)}
                          style={{ padding: '8px 16px', background: '#3498db', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>✏️ Edit & Fix</button>
                        <button onClick={() => updateStatus(opp.id, 'dismissed')}
                          style={{ padding: '8px 16px', background: '#e67e22', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>🔄 Dismiss</button>
                        <button onClick={() => updateStatus(opp.id, 'rejected')}
                          style={{ padding: '8px 16px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>❌ Remove</button>
                      </>}
                      {tab === 'published' && <>
                        <button onClick={() => setEditing(opp)}
                          style={{ padding: '8px 16px', background: '#3498db', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>✏️ Edit</button>
                        <button onClick={() => updateStatus(opp.id, 'rejected')}
                          style={{ padding: '8px 16px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>❌ Remove</button>
                      </>}
                      {tab === 'rejected' && <>
                        <button onClick={() => updateStatus(opp.id, 'pending')}
                          style={{ padding: '8px 16px', background: '#95a5a6', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>↩️ Restore</button>
                        <button onClick={() => deleteOpp(opp.id)}
                          style={{ padding: '8px 16px', background: '#c0392b', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>🗑 Delete</button>
                      </>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* AI Search Modal */}
      {showAiModal && (
        <div onClick={() => setShowAiModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 16, maxWidth: 560, width: '100%', padding: 32, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>🤖 AI Search Parameters</h2>
              <button onClick={() => setShowAiModal(false)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#666' }}>×</button>
            </div>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#888' }}>Leave blank to search broadly. Selecting a state or fields will focus the search on matching opportunities.</p>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: '#666', fontWeight: 600, display: 'block', marginBottom: 8, textTransform: 'uppercase' }}>State (optional)</label>
              <select value={aiSearchState} onChange={e => setAiSearchState(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, outline: 'none' }}>
                <option value="">Any State (nationwide)</option>
                {US_STATES.map(([code, name]) => (
                  <option key={code} value={code}>{name}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 28 }}>
              <label style={{ fontSize: 12, color: '#666', fontWeight: 600, display: 'block', marginBottom: 8, textTransform: 'uppercase' }}>
                Fields (optional) {aiSearchFields.length > 0 && <span style={{ color: '#3498db', marginLeft: 6 }}>{aiSearchFields.length} selected</span>}
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {FIELDS.map(f => (
                  <button key={f} onClick={() => toggleAiField(f)}
                    style={{ padding: '6px 12px', borderRadius: 20, border: '1px solid #ddd', fontSize: 12, cursor: 'pointer',
                      background: aiSearchFields.includes(f) ? '#3498db' : 'white',
                      color: aiSearchFields.includes(f) ? 'white' : '#666' }}>
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={aiSearch}
                style={{ flex: 1, padding: 13, background: '#2ecc71', color: 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
                🤖 Start Search
              </button>
              <button onClick={() => setShowAiModal(false)}
                style={{ padding: '13px 20px', background: '#f5f5f5', color: '#666', border: 'none', borderRadius: 10, fontSize: 15, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 16, maxWidth: 700, width: '100%', maxHeight: '90vh', overflow: 'auto', padding: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Edit Opportunity</h2>
              <button onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#666' }}>×</button>
            </div>
            {renderFormFields(editing, (key, val) => setEditing({ ...editing, [key]: val }))}
            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button onClick={saveEdit} style={{ flex: 1, padding: 13, background: '#27ae60', color: 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Save Changes</button>
              <button onClick={() => setEditing(null)} style={{ padding: '13px 20px', background: '#f5f5f5', color: '#666', border: 'none', borderRadius: 10, fontSize: 15, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Manually Modal */}
      {adding && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 16, maxWidth: 700, width: '100%', maxHeight: '90vh', overflow: 'auto', padding: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>➕ Add Opportunity Manually</h2>
              <button onClick={() => setAdding(null)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#666' }}>×</button>
            </div>
            {renderFormFields(adding, (key, val) => setAdding({ ...adding, [key]: val }))}
            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button onClick={saveAdd} style={{ flex: 1, padding: 13, background: '#9b59b6', color: 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Add to Pending Review</button>
              <button onClick={() => setAdding(null)} style={{ padding: '13px 20px', background: '#f5f5f5', color: '#666', border: 'none', borderRadius: 10, fontSize: 15, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
