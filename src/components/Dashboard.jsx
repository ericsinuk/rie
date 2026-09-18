import { useState, useEffect } from 'react'
import { rie } from '../lib/api.js'
import { supabase } from '../lib/supabase.js'

const MEL_DAYS = { B: 3, C: 10, D: 120 }

const STATUS_FILTERS = ['All', 'Draft', 'Pending Manager', 'Authorised', 'Submitted to FOI', 'Closed', 'Overdue']

function daysUntil(isoDate) {
  if (!isoDate) return null
  const diff = new Date(isoDate) - new Date()
  return Math.ceil(diff / 86400000)
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function statusBadge(rec) {
  const isOverdue = rec.extension_expiry && new Date(rec.extension_expiry) < new Date()
  if (isOverdue && rec.status !== 'Closed') return <span className="badge badge-overdue">OVERDUE</span>
  const map = {
    Draft: 'badge-draft',
    'Pending Manager': 'badge-pending',
    Authorised: 'badge-auth',
    'Submitted to FOI': 'badge-foi',
    Closed: 'badge-closed',
  }
  return <span className={`badge ${map[rec.status] || 'badge-draft'}`}>{rec.status}</span>
}

function catBadge(cat) {
  return <span className={`badge badge-cat${cat}`}>{cat} · {MEL_DAYS[cat]}d</span>
}

function ExpiryCell({ date }) {
  const days = daysUntil(date)
  if (days === null) return <span className="expiry-ok">—</span>
  if (days < 0) return <span className="expiry-over">{fmtDate(date)} ({Math.abs(days)}d overdue)</span>
  if (days <= 3) return <span className="expiry-warn">{fmtDate(date)} ({days}d left)</span>
  return <span className="expiry-ok">{fmtDate(date)}</span>
}

export default function Dashboard({ onNew, onOpen }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('All')

  useEffect(() => {
    loadRecords()
    const ch = supabase.channel('rie-dash')
      .on('postgres_changes', { event: '*', filter: { table: 'rie_records' } }, () => loadRecords())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  async function loadRecords() {
    const { data } = await rie.list()
    if (data) setRecords(data)
    setLoading(false)
  }

  const filtered = records.filter(r => {
    if (filter === 'All') return true
    if (filter === 'Overdue') {
      return r.extension_expiry && new Date(r.extension_expiry) < new Date() && r.status !== 'Closed'
    }
    return r.status === filter
  })

  const counts = {}
  STATUS_FILTERS.forEach(f => {
    if (f === 'All') counts[f] = records.length
    else if (f === 'Overdue') counts[f] = records.filter(r => r.extension_expiry && new Date(r.extension_expiry) < new Date() && r.status !== 'Closed').length
    else counts[f] = records.filter(r => r.status === f).length
  })

  return (
    <div className="page">
      <div className="dash-toolbar">
        <h1>RIE Records</h1>
        <button className="btn btn-primary" onClick={onNew}>+ New RIE</button>
      </div>

      <div className="filter-bar">
        {STATUS_FILTERS.map(f => (
          <button
            key={f}
            className={`filter-btn ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f} {counts[f] > 0 ? `(${counts[f]})` : ''}
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="icon">📋</div>
            <p>{filter === 'All' ? 'No RIE records yet. Click "+ New RIE" to create one.' : `No ${filter} records.`}</p>
          </div>
        ) : (
          <table className="rie-table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>A/C Reg</th>
                <th>MEL Item</th>
                <th>Cat</th>
                <th>Status</th>
                <th>MEL Expiry</th>
                <th>Ext. Expiry</th>
                <th>FOI Due</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const overdue = r.extension_expiry && new Date(r.extension_expiry) < new Date() && r.status !== 'Closed'
                return (
                  <tr
                    key={r.id}
                    className={overdue ? 'row-overdue' : ''}
                    onClick={() => onOpen(r.id)}
                  >
                    <td className="ref">{r.ref_number}</td>
                    <td className="mono">{r.aircraft_registration}</td>
                    <td style={{ maxWidth: 180 }}>
                      <div className="mono" style={{ fontSize: 12 }}>{r.mel_item_ref}</div>
                      {r.mel_chapter_title && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{r.mel_chapter_title}</div>}
                    </td>
                    <td>{catBadge(r.mel_category)}</td>
                    <td>{statusBadge(r)}</td>
                    <td><ExpiryCell date={r.mel_interval_expiry} /></td>
                    <td><ExpiryCell date={r.extension_expiry} /></td>
                    <td>
                      {r.foi_due_at
                        ? <ExpiryCell date={r.foi_due_at} />
                        : <span style={{ color: 'var(--text-3)' }}>—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
