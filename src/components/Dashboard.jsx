import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

const DEPT_LABELS = { FSS: 'FOP', GOP: 'GOP', SAFE: 'Safety', ENG: 'ENG', MGT: 'MGT' }
const STATUS_OPTIONS = ['Assessment Completed', 'Assessment Terminated', 'In Progress', 'CATB', 'ENG', 'Safety']
const OPS_OPTIONS = ['Destination Airfield', 'Destination Alternate', 'ETOPS Alternate', 'En Route Alternate', 'Emergency Alternate']

function statusClass(s) {
  if (s === 'Assessment Completed') return 'completed'
  if (s === 'ENG') return 'eng'
  if (s === 'Safety') return 'safety'
  if (s === 'CATB') return 'catb'
  return 'progress'
}

function dfsLabel(n) {
  if (n >= 5) return 'Submitted'
  if (n >= 4) return 'Signed'
  if (n >= 3) return 'Synced'
  if (n >= 2) return 'TBS'
  return 'Pending'
}

export default function Dashboard({ profile, onSelect, onSignOut }) {
  const [airfields, setAirfields] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ icao: '', iata: '', name: '', country: '', operations_type: 'Destination Airfield' })
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadAirfields()
    const sub = supabase.channel('airfields-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'airfields' }, loadAirfields)
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [])

  async function loadAirfields() {
    const { data } = await supabase
      .from('airfields')
      .select(`*, fss_assessments(dfs_status), gop_assessments(dfs_status), safety_assessments(dfs_status), eng_assessments(dfs_status), mgt_assessments(dfs_status)`)
      .order('created_at')
    if (data) setAirfields(data)
    setLoading(false)
  }

  async function handleCreate() {
    if (!form.icao.trim()) { setErr('ICAO code required'); return }
    if (!form.name.trim()) { setErr('Name required'); return }
    setSaving(true); setErr('')
    const { data, error } = await supabase.from('airfields').insert({
      icao: form.icao.trim().toUpperCase(),
      iata: form.iata.trim().toUpperCase() || null,
      name: form.name.trim(),
      country: form.country.trim(),
      operations_type: form.operations_type
    }).select().single()
    setSaving(false)
    if (error) { setErr(error.message); return }
    setShowModal(false)
    setForm({ icao: '', iata: '', name: '', country: '', operations_type: 'Destination Airfield' })
    onSelect(data)
  }

  const canCreate = ['ADMIN', 'FSS', 'MGT'].includes(profile?.department)

  if (loading) return (
    <>
      <header className="app-header">
        <h1>Rectification Interval Extensions</h1>
        <div className="header-right">
          <span className="dept-badge">{profile?.department}</span>
          <button className="header-btn" onClick={onSignOut}>Sign Out</button>
        </div>
      </header>
      <div className="loading">Loading airfields…</div>
    </>
  )

  return (
    <>
      <header className="app-header">
        <h1>Rectification Interval Extensions</h1>
        <div className="header-right">
          <span className="dept-badge">{profile?.department} — {profile?.full_name}</span>
          {canCreate && <button className="add-btn" onClick={() => setShowModal(true)}>+ New Airfield</button>}
          <button className="header-btn" onClick={onSignOut}>Sign Out</button>
        </div>
      </header>

      <div className="dashboard">
        <div className="dashboard-title">Airfield Assessments</div>
        <div className="dashboard-sub">{airfields.length} airfield{airfields.length !== 1 ? 's' : ''} tracked</div>

        {airfields.length === 0 ? (
          <div className="empty">No airfields yet. {canCreate ? 'Create one to get started.' : 'Waiting for an admin to add airfields.'}</div>
        ) : (
          <div className="airfield-grid">
            {airfields.map(af => {
              const depts = [
                { label: 'FOP', val: af.fss_assessments?.[0]?.dfs_status || 0 },
                { label: 'GOP', val: af.gop_assessments?.[0]?.dfs_status || 0 },
                { label: 'Safety', val: af.safety_assessments?.[0]?.dfs_status || 0 },
                { label: 'ENG', val: af.eng_assessments?.[0]?.dfs_status || 0 },
                { label: 'MGT', val: af.mgt_assessments?.[0]?.dfs_status || 0 },
              ]
              return (
                <div key={af.id} className="airfield-card" onClick={() => onSelect(af)}>
                  <div className="card-top">
                    <div className="card-codes">
                      <span className="card-icao">{af.icao}</span>
                      {af.iata && <span className="card-iata">{af.iata}</span>}
                    </div>
                    <span className={`status-badge ${statusClass(af.status)}`}>{af.status}</span>
                  </div>
                  <div className="card-name">{af.name}</div>
                  <div className="card-country">{af.country} {af.operations_type && `· ${af.operations_type}`}</div>
                  <div className="card-dfs">
                    {depts.map(d => (
                      <span key={d.label} className={`dfs-chip ${d.val >= 4 ? 'signed' : d.val >= 3 ? 'synced' : d.val >= 2 ? 'tbs' : ''}`}>
                        {d.label}: {dfsLabel(d.val)}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <h2>New Airfield</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field"><label>ICAO Code *</label><input type="text" maxLength={4} value={form.icao} onChange={e => setForm(f => ({ ...f, icao: e.target.value }))} placeholder="e.g. EGLL" /></div>
              <div className="field"><label>IATA Code</label><input type="text" maxLength={3} value={form.iata} onChange={e => setForm(f => ({ ...f, iata: e.target.value }))} placeholder="e.g. LHR" /></div>
              <div className="field"><label>Name *</label><input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. London Heathrow" /></div>
              <div className="field"><label>Country</label><input type="text" value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} placeholder="e.g. United Kingdom" /></div>
              <div className="field"><label>Operations Type</label>
                <select value={form.operations_type} onChange={e => setForm(f => ({ ...f, operations_type: e.target.value }))}>
                  {OPS_OPTIONS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              {err && <div className="auth-err">{err}</div>}
            </div>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => { setShowModal(false); setErr('') }}>Cancel</button>
              <button className="confirm-btn" onClick={handleCreate} disabled={saving}>{saving ? 'Creating…' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
