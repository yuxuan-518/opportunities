'use client'
import { useEffect, useState } from 'react'
import { Opportunity, OPPORTUNITY_TYPES, FIELDS, GRADE_LEVELS } from '@/lib/types'

type Lang = 'en' | 'zh' | 'es'

const PAGE_SIZE = 12

const T = {
  en: {
    title: '🎓 Opportunities & Programs',
    subtitle: 'Curated extracurricular opportunities for high school students',
    admin: 'Admin',
    searchPlaceholder: 'Search opportunities...',
    filter: 'FILTER:',
    allTypes: 'All Types', allFields: 'All Fields', allGrades: 'All Grades',
    anyCost: 'Any Cost', anyLocation: 'Any Location',
    openOnly: 'Open Only', openOnlyActive: '✅ Open Only', clear: '✕ Clear',
    results: (n: number) => `${n} results`,
    loading: 'Loading...', noResults: 'No opportunities found', noResultsSub: 'Try adjusting your filters',
    grade: (g: string) => `Grade ${g}`, grades: (gs: string[]) => `Grades: ${gs.join(', ')}`,
    free: 'Free', paid: 'Paid', aidAvailable: 'Aid Available',
    online: 'Online', inPerson: 'In Person', hybrid: 'Hybrid',
    deadlineDue: (d: string) => `Due ${d}`, deadlineClosed: (d: string) => `Closed ${d}`,
    visitWebsite: 'Visit Official Website →',
    type: 'TYPE', cost: 'COST', location: 'LOCATION', duration: 'DURATION',
    deadline: 'DEADLINE', gradesLabel: 'GRADES', fields: 'FIELDS', requirements: 'REQUIREMENTS',
    rollingTBA: 'Rolling / TBA', allGradesLabel: 'All grades', na: 'N/A',
    deadlinePassedWarning: "This opportunity's deadline has passed. Check the official website for updated dates.",
    showMore: 'Show More', showing: (n: number, total: number) => `Showing ${n} of ${total}`,
  },
  zh: {
    title: '🎓 课外活动与项目', subtitle: '为高中生精心整理的课外活动机会', admin: '管理员',
    searchPlaceholder: '搜索活动...', filter: '筛选：',
    allTypes: '所有类型', allFields: '所有领域', allGrades: '所有年级',
    anyCost: '任意费用', anyLocation: '任意地点',
    openOnly: '仅看开放中', openOnlyActive: '✅ 仅看开放中', clear: '✕ 清除',
    results: (n: number) => `${n} 个结果`,
    loading: '加载中...', noResults: '未找到相关活动', noResultsSub: '请尝试调整筛选条件',
    grade: (g: string) => `${g}年级`, grades: (gs: string[]) => `年级：${gs.join('、')}`,
    free: '免费', paid: '付费', aidAvailable: '可申请资助',
    online: '线上', inPerson: '线下', hybrid: '混合',
    deadlineDue: (d: string) => `截止 ${d}`, deadlineClosed: (d: string) => `已截止 ${d}`,
    visitWebsite: '访问官方网站 →',
    type: '类型', cost: '费用', location: '地点', duration: '时长',
    deadline: '截止日期', gradesLabel: '适用年级', fields: '领域', requirements: '申请要求',
    rollingTBA: '滚动申请 / 待定', allGradesLabel: '所有年级', na: '暂无',
    deadlinePassedWarning: '此活动的申请截止日期已过，请访问官方网站查看最新日期。',
    showMore: '加载更多', showing: (n: number, total: number) => `显示 ${n} / ${total} 个`,
  },
  es: {
    title: '🎓 Oportunidades y Programas', subtitle: 'Oportunidades extracurriculares para estudiantes de preparatoria', admin: 'Admin',
    searchPlaceholder: 'Buscar oportunidades...', filter: 'FILTRAR:',
    allTypes: 'Todos los tipos', allFields: 'Todas las áreas', allGrades: 'Todos los grados',
    anyCost: 'Cualquier costo', anyLocation: 'Cualquier lugar',
    openOnly: 'Solo abiertas', openOnlyActive: '✅ Solo abiertas', clear: '✕ Limpiar',
    results: (n: number) => `${n} resultados`,
    loading: 'Cargando...', noResults: 'No se encontraron oportunidades', noResultsSub: 'Intenta ajustar los filtros',
    grade: (g: string) => `Grado ${g}`, grades: (gs: string[]) => `Grados: ${gs.join(', ')}`,
    free: 'Gratis', paid: 'De pago', aidAvailable: 'Ayuda disponible',
    online: 'En línea', inPerson: 'Presencial', hybrid: 'Híbrido',
    deadlineDue: (d: string) => `Vence ${d}`, deadlineClosed: (d: string) => `Cerrado ${d}`,
    visitWebsite: 'Visitar sitio oficial →',
    type: 'TIPO', cost: 'COSTO', location: 'UBICACIÓN', duration: 'DURACIÓN',
    deadline: 'FECHA LÍMITE', gradesLabel: 'GRADOS', fields: 'ÁREAS', requirements: 'REQUISITOS',
    rollingTBA: 'Continuo / Por anunciar', allGradesLabel: 'Todos los grados', na: 'N/D',
    deadlinePassedWarning: 'La fecha límite de esta oportunidad ha pasado. Consulta el sitio web oficial para fechas actualizadas.',
    showMore: 'Ver más', showing: (n: number, total: number) => `Mostrando ${n} de ${total}`,
  }
}

const COST_KEYS = { free: 'free', paid: 'paid', financial_aid_available: 'aidAvailable' } as const
const LOCATION_KEYS = { online: 'online', in_person: 'inPerson', hybrid: 'hybrid' } as const
const TYPE_COLORS: Record<string, string> = {
  competition: '#e74c3c', program: '#3498db', internship: '#2ecc71',
  scholarship: '#f39c12', volunteer: '#9b59b6', research: '#1abc9c',
  workshop: '#e67e22', other: '#95a5a6'
}
const TYPE_LABELS: Record<Lang, Record<string, string>> = {
  en: { competition: 'Competition', program: 'Program', internship: 'Internship', scholarship: 'Scholarship', volunteer: 'Volunteer', research: 'Research', workshop: 'Workshop', other: 'Other' },
  zh: { competition: '竞赛', program: '项目', internship: '实习', scholarship: '奖学金', volunteer: '志愿者', research: '科研', workshop: '工作坊', other: '其他' },
  es: { competition: 'Competencia', program: 'Programa', internship: 'Pasantía', scholarship: 'Beca', volunteer: 'Voluntariado', research: 'Investigación', workshop: 'Taller', other: 'Otro' }
}

export default function HomePage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterField, setFilterField] = useState('')
  const [filterGrade, setFilterGrade] = useState('')
  const [filterCost, setFilterCost] = useState('')
  const [filterLocation, setFilterLocation] = useState('')
  const [filterOpenOnly, setFilterOpenOnly] = useState(false)
  const [selected, setSelected] = useState<Opportunity | null>(null)
  const [lang, setLang] = useState<Lang>('en')

  const t = T[lang]

  const fetchOpportunities = async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (filterType) params.set('type', filterType)
    if (filterField) params.set('field', filterField)
    if (filterGrade) params.set('grade', filterGrade)
    if (filterCost) params.set('cost', filterCost)
    if (filterLocation) params.set('location', filterLocation)
    const res = await fetch('/api/opportunities?' + params)
    const data = await res.json()
    let filtered = Array.isArray(data) ? data : []
    if (filterOpenOnly) {
      const now = Date.now()
      filtered = filtered.filter((o: Opportunity) => {
        if (!o.deadline) return true
        return new Date(o.deadline).getTime() >= now
      })
    }
    setOpportunities(filtered)
    setPage(1)
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

  const formatDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(
    lang === 'zh' ? 'zh-CN' : lang === 'es' ? 'es-ES' : 'en-US',
    { year: 'numeric', month: 'long', day: 'numeric' }
  )

  const formatDateShort = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(
    lang === 'zh' ? 'zh-CN' : lang === 'es' ? 'es-ES' : 'en-US'
  )

  const hasActiveFilters = filterType || filterField || filterGrade || filterCost || filterLocation || filterOpenOnly || search
  const visibleOpportunities = opportunities.slice(0, page * PAGE_SIZE)
  const hasMore = visibleOpportunities.length < opportunities.length

  const langButtons: { code: Lang; label: string }[] = [
    { code: 'en', label: 'EN' }, { code: 'zh', label: '中文' }, { code: 'es', label: 'ES' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fa', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <div style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', padding: '40px 24px 60px', color: 'white' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
            <div>
              <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0 }}>{t.title}</h1>
              <p style={{ margin: '8px 0 0', opacity: 0.75, fontSize: 15 }}>{t.subtitle}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', background: 'rgba(255,255,255,0.1)', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.2)' }}>
                {langButtons.map(lb => (
                  <button key={lb.code} onClick={() => setLang(lb.code)}
                    style={{ padding: '7px 13px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                      background: lang === lb.code ? 'rgba(255,255,255,0.25)' : 'transparent', color: 'white' }}>
                    {lb.label}
                  </button>
                ))}
              </div>
              <a href="/admin" style={{ background: 'rgba(255,255,255,0.1)', color: 'white', padding: '8px 16px', borderRadius: 8, textDecoration: 'none', fontSize: 14, border: '1px solid rgba(255,255,255,0.2)' }}>
                {t.admin}
              </a>
            </div>
          </div>
          <div style={{ position: 'relative' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.searchPlaceholder}
              style={{ width: '100%', padding: '14px 20px 14px 48px', borderRadius: 12, border: 'none', fontSize: 16, background: 'rgba(255,255,255,0.95)', boxSizing: 'border-box', outline: 'none' }} />
            <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 20 }}>🔍</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '-20px auto 0', padding: '0 24px 40px' }}>
        <div style={{ background: 'white', borderRadius: 12, padding: '16px 20px', marginBottom: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.08)', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#666' }}>{t.filter}</span>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 13, background: filterType ? '#e8f4fd' : 'white', cursor: 'pointer', outline: 'none' }}>
            <option value="">{t.allTypes}</option>
            {Object.entries(TYPE_LABELS[lang]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={filterField} onChange={e => setFilterField(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 13, background: filterField ? '#e8f4fd' : 'white', cursor: 'pointer', outline: 'none' }}>
            <option value="">{t.allFields}</option>
            {FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={filterGrade} onChange={e => setFilterGrade(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 13, background: filterGrade ? '#e8f4fd' : 'white', cursor: 'pointer', outline: 'none' }}>
            <option value="">{t.allGrades}</option>
            {GRADE_LEVELS.map(g => <option key={g} value={g}>{t.grade(g)}</option>)}
          </select>
          <select value={filterCost} onChange={e => setFilterCost(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 13, background: filterCost ? '#e8f4fd' : 'white', cursor: 'pointer', outline: 'none' }}>
            <option value="">{t.anyCost}</option>
            <option value="free">{t.free}</option>
            <option value="paid">{t.paid}</option>
            <option value="financial_aid_available">{t.aidAvailable}</option>
          </select>
          <select value={filterLocation} onChange={e => setFilterLocation(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 13, background: filterLocation ? '#e8f4fd' : 'white', cursor: 'pointer', outline: 'none' }}>
            <option value="">{t.anyLocation}</option>
            <option value="online">{t.online}</option>
            <option value="in_person">{t.inPerson}</option>
            <option value="hybrid">{t.hybrid}</option>
          </select>
          <button onClick={() => setFilterOpenOnly(v => !v)}
            style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 500,
              border: filterOpenOnly ? '1px solid #27ae60' : '1px solid #e0e0e0',
              background: filterOpenOnly ? '#eafaf1' : 'white', color: filterOpenOnly ? '#27ae60' : '#666' }}>
            {filterOpenOnly ? t.openOnlyActive : `📅 ${t.openOnly}`}
          </button>
          {hasActiveFilters && (
            <button onClick={() => { setFilterType(''); setFilterField(''); setFilterGrade(''); setFilterCost(''); setFilterLocation(''); setFilterOpenOnly(false); setSearch('') }}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ffcccc', background: '#fff5f5', color: '#e74c3c', fontSize: 13, cursor: 'pointer' }}>
              {t.clear}
            </button>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 13, color: '#999' }}>{t.results(opportunities.length)}</span>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>{t.loading}</div>
        ) : opportunities.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔎</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{t.noResults}</div>
            <div style={{ fontSize: 14, marginTop: 8 }}>{t.noResultsSub}</div>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
              {visibleOpportunities.map(opp => (
                <div key={opp.id} onClick={() => setSelected(opp)}
                  style={{ background: 'white', borderRadius: 12, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', cursor: 'pointer',
                    border: deadlinePassed(opp.deadline) ? '1px solid #f0e0e0' : '1px solid #f0f0f0',
                    opacity: deadlinePassed(opp.deadline) ? 0.75 : 1, transition: 'all 0.15s' }}
                  onMouseEnter={e => { const d = e.currentTarget as HTMLDivElement; d.style.transform = 'translateY(-2px)'; d.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)' }}
                  onMouseLeave={e => { const d = e.currentTarget as HTMLDivElement; d.style.transform = ''; d.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ background: TYPE_COLORS[opp.type] || '#95a5a6', color: 'white', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                      {TYPE_LABELS[lang][opp.type]}
                    </span>
                    <span style={{ fontSize: 11, color: opp.cost === 'free' ? '#27ae60' : '#e67e22', fontWeight: 600 }}>
                      {t[COST_KEYS[opp.cost]]}
                    </span>
                  </div>
                  <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: '#1a1a2e', lineHeight: 1.3 }}>{opp.title}</h3>
                  {opp.organization && <p style={{ margin: '0 0 8px', fontSize: 13, color: '#666' }}>🏛 {opp.organization}</p>}
                  <p style={{ margin: '0 0 12px', fontSize: 13, color: '#555', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{opp.description}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                    {opp.fields.slice(0, 3).map(f => <span key={f} style={{ background: '#f0f4ff', color: '#3498db', padding: '2px 8px', borderRadius: 12, fontSize: 11 }}>{f}</span>)}
                    {opp.fields.length > 3 && <span style={{ fontSize: 11, color: '#999' }}>+{opp.fields.length - 3}</span>}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#888' }}>
                    <span>📍 {t[LOCATION_KEYS[opp.location_type]]}</span>
                    {opp.deadline && (
                      <span style={{ color: deadlinePassed(opp.deadline) ? '#bbb' : deadlineSoon(opp.deadline) ? '#e74c3c' : '#888', fontWeight: deadlineSoon(opp.deadline) ? 600 : 400 }}>
                        {deadlinePassed(opp.deadline)
                          ? `🔒 ${t.deadlineClosed(formatDateShort(opp.deadline))}`
                          : `${deadlineSoon(opp.deadline) ? '⚠️ ' : '📅 '}${t.deadlineDue(formatDateShort(opp.deadline))}`}
                      </span>
                    )}
                  </div>
                  {opp.grade_levels.length > 0 && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>{t.grades(opp.grade_levels)}</div>
                  )}
                </div>
              ))}
            </div>

            {/* 分页 Show More 按钮 */}
            {hasMore && (
              <div style={{ textAlign: 'center', marginTop: 32 }}>
                <div style={{ fontSize: 13, color: '#999', marginBottom: 12 }}>
                  {t.showing(visibleOpportunities.length, opportunities.length)}
                </div>
                <button onClick={() => setPage(p => p + 1)}
                  style={{ padding: '12px 32px', background: '#0f3460', color: 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
                  {t.showMore}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {selected && (
        <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 16, maxWidth: 640, width: '100%', maxHeight: '85vh', overflow: 'auto', padding: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <span style={{ background: TYPE_COLORS[selected.type], color: 'white', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                {TYPE_LABELS[lang][selected.type]}
              </span>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#666' }}>×</button>
            </div>
            <h2 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, color: '#1a1a2e' }}>{selected.title}</h2>
            {selected.organization && <p style={{ margin: '0 0 16px', color: '#666' }}>🏛 {selected.organization}</p>}
            {deadlinePassed(selected.deadline) && (
              <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#b26a00' }}>
                ⚠️ {t.deadlinePassedWarning}
              </div>
            )}
            <p style={{ color: '#444', lineHeight: 1.7, marginBottom: 20 }}>{selected.description}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              {[
                { label: t.type, value: TYPE_LABELS[lang][selected.type] },
                { label: t.cost, value: selected.cost_amount ? `${t[COST_KEYS[selected.cost]]} (${selected.cost_amount})` : t[COST_KEYS[selected.cost]] },
                { label: t.location, value: selected.location ? `${t[LOCATION_KEYS[selected.location_type]]} — ${selected.location}` : t[LOCATION_KEYS[selected.location_type]] },
                { label: t.duration, value: selected.duration || t.na },
                { label: t.deadline, value: selected.deadline ? formatDate(selected.deadline) : t.rollingTBA },
                { label: t.gradesLabel, value: selected.grade_levels.length ? t.grades(selected.grade_levels) : t.allGradesLabel },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: '#f8f9fa', padding: '10px 14px', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 2, textTransform: 'uppercase' }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>{value}</div>
                </div>
              ))}
            </div>
            {selected.fields.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: '#999', marginBottom: 8, textTransform: 'uppercase' }}>{t.fields}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selected.fields.map(f => <span key={f} style={{ background: '#e8f4fd', color: '#2980b9', padding: '4px 12px', borderRadius: 20, fontSize: 13 }}>{f}</span>)}
                </div>
              </div>
            )}
            {selected.requirements && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: '#999', marginBottom: 6, textTransform: 'uppercase' }}>{t.requirements}</div>
                <p style={{ margin: 0, color: '#444', lineHeight: 1.6, fontSize: 14 }}>{selected.requirements}</p>
              </div>
            )}
            {selected.website_url && (
              <a href={selected.website_url} target="_blank" rel="noopener noreferrer"
                style={{ display: 'block', background: '#0f3460', color: 'white', textAlign: 'center', padding: 14, borderRadius: 10, textDecoration: 'none', fontWeight: 600, fontSize: 15 }}>
                {t.visitWebsite}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}