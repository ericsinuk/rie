import { useState, useEffect } from 'react'
import { rie } from '../lib/api.js'
import { supabase } from '../lib/supabase.js'
import SignaturePad from './SignaturePad.jsx'
import { generateRIEPdf } from '../lib/pdf.js'

const MEL_DAYS = { B: 3, C: 10, D: 120 }

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtDt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function daysUntil(iso) {
  if (!iso) return null
  return Math.ceil((new Date(iso) - new Date()) / 86400000)
}

const TIMELINE_STEPS = [
  { key: 'draft',   label: 'Created',          statusMatch: () => true },
  { key: 'app',     label: 'Applicant Signed',  statusMatch: s => ['Pending Manager','Authorised','Submitted to FOI','Closed'].includes(s) },
  { key: 'mgr',     label: 'Manager Authorised',statusMatch: s => ['Authorised','Submitted to FOI','Closed'].includes(s) },
  { key: 'foi',     label: 'Submitted to FOI',  statusMatch: s => ['Submitted to FOI','Closed'].includes(s) },
  { key: 'closed',  label: 'Closed',            statusMatch: s => s === 'Closed' },
]

export default function RIEDetail({ id, profile, onBack, onEdit }) {
  const [rec, setRec] = useState(null)
  const [loading, setLoading] = useState(true)
  const [signing, setSigning] = useState(null) // 'applicant' | 'manager' | null
  const [error, setError] = useState('')

  useEffect(() => {
    loadRec()
    const ch = supabase.channel(`rie-${id}`)
      .on('postgres_changes', { event: 'UPDATE', filter: { table: 'rie_records' } }, ({ new: updated }) => {
        if (updated.id === id) setRec(updated)
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [id])

  async function loadRec() {
    const { data } = await rie.get(id)
    setRec(data)
    setLoading(false)
  }

  async function handleSign(dataUrl, name, position, managerComments) {
    setError('')
    const { data, error: err } = await rie.sign(id, signing, dataUrl, name, position, managerComments)
    if (err) { setError(err.error || err.message || 'Sign failed'); return }
    setRec(data)
    setSigning(null)
  }

  async function handleMarkFoi() {
    const { data, error: err } = await rie.markFoi(id)
    if (err) { setError(err.error || err.message || 'Failed'); return }
    setRec(data)
  }

  async function handleClose() {
    const { data, error: err } = await rie.close(id)
    if (err) { setError(err.error || err.message || 'Failed'); return }
    setRec(data)
  }

  if (loading || !rec) return <div className="loading">Loading…</div>

  const isClosed = rec.status === 'Closed'
  const extDays = isClosed ? null : daysUntil(rec.extension_expiry)
  const foiDays = daysUntil(rec.foi_due_at)
  const isOverdue = extDays !== null && extDays < 0
  const foiOverdue = rec.foi_due_at && foiDays !== null && foiDays < 0 && rec.status === 'Authorised'

  return (
    <div className="page-sm">
      {/* Header */}
      <div className="detail-header">
        <div className="meta">
          <div className="ref">{rec.ref_number || <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>Ref assigned at authorisation</span>}</div>
          <div className="ac">{rec.aircraft_registration} · {rec.aircraft_type}</div>
          <div className="mel">{rec.mel_item_ref}{rec.mel_chapter_title ? ` — ${rec.mel_chapter_title}` : ''}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <span className={`badge badge-cat${rec.mel_category}`}>
            Cat {rec.mel_category} · {MEL_DAYS[rec.mel_category]}d
          </span>
          {isOverdue
            ? <span className="badge badge-overdue">OVERDUE</span>
            : (() => {
                const map = { Draft:'badge-draft','Pending Manager':'badge-pending',Authorised:'badge-auth','Submitted to FOI':'badge-foi',Closed:'badge-closed' }
                return <span className={`badge ${map[rec.status]||'badge-draft'}`}>{rec.status}</span>
              })()}
        </div>
      </div>

      {/* Timeline */}
      <div className="status-timeline">
        {TIMELINE_STEPS.map(step => {
          const done = step.statusMatch(rec.status)
          const isCurrent = TIMELINE_STEPS.findIndex(s => s.statusMatch(rec.status)) ===
                            TIMELINE_STEPS.findLastIndex(s => s.statusMatch(rec.status)) &&
                            step.key === TIMELINE_STEPS[TIMELINE_STEPS.findLastIndex(s => s.statusMatch(rec.status))]?.key
          return (
            <div key={step.key} className="timeline-step">
              <div className={`ts-dot ${done ? (isCurrent ? 'current' : 'done') : ''}`}>
                {done ? '✓' : ''}
              </div>
              <div className="ts-label">{step.label}</div>
            </div>
          )
        })}
      </div>

      {/* Alerts */}
      {foiOverdue && (
        <div className="foi-overdue-alert">
          <div className="msg">
            <strong>FOI submission is overdue!</strong> Due {fmtDate(rec.foi_due_at)} ({Math.abs(foiDays)} days ago). Submit to FOI immediately.
          </div>
        </div>
      )}
      {rec.status === 'Authorised' && !foiOverdue && rec.foi_due_at && (
        <div className="foi-alert">
          <span className="icon">⚠️</span>
          <div className="msg">
            FOI submission due by <strong>{fmtDate(rec.foi_due_at)}</strong>
            {foiDays !== null && ` (${foiDays} day${foiDays === 1 ? '' : 's'} remaining)`}.
            Download the PDF and submit to the Flight Operations Inspector.
          </div>
        </div>
      )}

      {error && <div className="auth-error" style={{ marginBottom: 12 }}>{error}</div>}

      {/* Section 1: Aircraft & Defect */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">Aircraft &amp; Defect Details</div>
        <div className="detail-grid">
          <div>
            <div className="detail-field"><div className="lbl">Aircraft Registration</div><div className="val mono">{rec.aircraft_registration}</div></div>
            <div className="detail-field"><div className="lbl">Aircraft Type</div><div className="val">{rec.aircraft_type}</div></div>
            <div className="detail-field"><div className="lbl">MEL Item Reference</div><div className="val mono">{rec.mel_item_ref}</div></div>
            {rec.mel_chapter_title && <div className="detail-field"><div className="lbl">MEL Chapter</div><div className="val">{rec.mel_chapter_title}</div></div>}
          </div>
          <div>
            <div className="detail-field"><div className="lbl">Date Defect Found</div><div className="val">{fmtDate(rec.date_defect_found)}</div></div>
            <div className="detail-field"><div className="lbl">MEL Interval Start</div><div className="val">{fmtDate(rec.date_mel_start)}</div></div>
            <div className="detail-field">
              <div className="lbl">MEL Interval Expiry</div>
              <div className={`val ${extDays !== null && extDays < 0 ? 'over' : extDays !== null && extDays <= 3 ? 'warn' : ''}`}>
                {fmtDate(rec.mel_interval_expiry)}
              </div>
            </div>
            <div className="detail-field">
              <div className="lbl">Extension ({rec.extension_days} days) Expiry</div>
              <div className={`val ${extDays !== null && extDays < 0 ? 'over' : extDays !== null && extDays <= 3 ? 'warn' : ''}`}>
                {fmtDate(rec.extension_expiry)}
                {extDays !== null && <span style={{ marginLeft: 6, fontSize: 11, color: 'inherit' }}>
                  ({extDays < 0 ? `${Math.abs(extDays)}d overdue` : `${extDays}d`})
                </span>}
              </div>
            </div>
          </div>
        </div>
        <div className="detail-field">
          <div className="lbl">Defect Description</div>
          <div className="val" style={{ whiteSpace: 'pre-wrap' }}>{rec.defect_description}</div>
        </div>
      </div>

      {/* Section 2: Justification */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">Justification</div>
        <div className="detail-field">
          <div className="lbl">Reason for Extension</div>
          <div className="val" style={{ whiteSpace: 'pre-wrap' }}>{rec.extension_reason}</div>
        </div>
        {rec.additional_limitations && (
          <div className="detail-field">
            <div className="lbl">Additional Limitations / Conditions</div>
            <div className="val" style={{ whiteSpace: 'pre-wrap' }}>{rec.additional_limitations}</div>
          </div>
        )}
        <div className="detail-field-row">
          {rec.mcc_reference && (
            <div className="detail-field">
              <div className="lbl">MCC Reference</div>
              <div className="val mono">{rec.mcc_reference}</div>
            </div>
          )}
          {rec.ref_addp && (
            <div className="detail-field">
              <div className="lbl">ADD "P" No</div>
              <div className="val mono">{rec.ref_addp}</div>
            </div>
          )}
        </div>
      </div>

      {/* Section 3: Signatures */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">Signatures</div>
        <div className="sig-grid">
          {/* Applicant */}
          <div className="sig-block">
            <div className="sig-title">Applicant</div>
            {rec.applicant_signed_at ? (
              <>
                {rec.applicant_signature && (
                  <div className="sig-img">
                    <img src={rec.applicant_signature} alt="Applicant signature" />
                  </div>
                )}
                <div className="sig-name">{rec.applicant_name}</div>
                {rec.applicant_position && <div className="sig-date">{rec.applicant_position}</div>}
                <div className="sig-date">{fmtDt(rec.applicant_signed_at)}</div>
              </>
            ) : (
              <div className="sig-pending">
                <div style={{ marginBottom: 8 }}>Not yet signed</div>
                {rec.status === 'Draft' && (
                  <button className="btn btn-primary btn-sm" onClick={() => setSigning('applicant')}>
                    Sign as Applicant
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Manager */}
          <div className="sig-block">
            <div className="sig-title">Authorising Manager</div>
            {rec.manager_signed_at ? (
              <>
                {rec.manager_signature && (
                  <div className="sig-img">
                    <img src={rec.manager_signature} alt="Manager signature" />
                  </div>
                )}
                <div className="sig-name">{rec.manager_name}</div>
                {rec.manager_position && <div className="sig-date">{rec.manager_position}</div>}
                <div className="sig-date">{fmtDt(rec.manager_signed_at)}</div>
              </>
            ) : (
              <div className="sig-pending">
                {rec.status === 'Pending Manager' ? (
                  <>
                    <div style={{ marginBottom: 8 }}>Awaiting manager authorisation</div>
                    <button className="btn btn-primary btn-sm" onClick={() => setSigning('manager')}>
                      Authorise as Manager
                    </button>
                  </>
                ) : (
                  <div>Awaiting applicant signature first</div>
                )}
              </div>
            )}
            {rec.manager_comments && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-2)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 3 }}>Manager Comments</div>
                {rec.manager_comments}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* FOI tracking (if authorised+) */}
      {['Authorised', 'Submitted to FOI', 'Closed'].includes(rec.status) && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-title">FOI Submission</div>
          <div className="detail-grid">
            <div>
              <div className="detail-field"><div className="lbl">Date Authorised</div><div className="val">{fmtDt(rec.manager_signed_at)}</div></div>
              <div className="detail-field">
                <div className="lbl">FOI Submission Due (10 days)</div>
                <div className={`val ${foiDays !== null && foiDays < 0 ? 'over' : foiDays !== null && foiDays <= 3 ? 'warn' : ''}`}>
                  {fmtDate(rec.foi_due_at)}
                  {foiDays !== null && rec.status === 'Authorised' && (
                    <span style={{ marginLeft: 6, fontSize: 11 }}>
                      ({foiDays < 0 ? `${Math.abs(foiDays)}d overdue` : `${foiDays}d remaining`})
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div>
              <div className="detail-field">
                <div className="lbl">Date Submitted to FOI</div>
                <div className="val">{rec.foi_submitted_at ? fmtDt(rec.foi_submitted_at) : <span style={{ color: 'var(--text-3)' }}>Pending</span>}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="action-bar">
        <button className="btn btn-ghost" onClick={onBack}>← Dashboard</button>
        {rec.status === 'Draft' && (
          <button className="btn btn-ghost" onClick={() => onEdit(id)}>Edit</button>
        )}
        {(rec.status === 'Authorised' || rec.status === 'Submitted to FOI' || rec.status === 'Closed') && (
          <button className="btn btn-primary btn-lg" onClick={() => generateRIEPdf(rec).catch(e => setError(e.message || 'PDF generation failed'))}>
            ⬇ Download PDF
          </button>
        )}
        {rec.status === 'Authorised' && (
          <button className="btn btn-success" onClick={handleMarkFoi}>
            Mark Submitted to FOI
          </button>
        )}
        {rec.status !== 'Closed' && (
          <button className="btn btn-danger btn-sm" style={{ marginLeft: 'auto' }} onClick={handleClose}>
            Close Record
          </button>
        )}
      </div>

      {/* Signature modal */}
      {signing && (
        <SignaturePad
          role={signing}
          signerName={profile?.full_name || ''}
          signerPosition={profile?.department || ''}
          onSign={handleSign}
          onCancel={() => setSigning(null)}
        />
      )}
    </div>
  )
}
