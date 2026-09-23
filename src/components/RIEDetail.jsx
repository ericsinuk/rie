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

function SigSource({ source }) {
  if (!source) return null
  return <div className="sig-source">{source === 'enrolled' ? 'Saved signature applied · password confirmed' : 'Drawn at signing · password confirmed'}</div>
}

const TIMELINE_STEPS = [
  { key: 'draft',   label: 'Created',           statusMatch: () => true },
  { key: 'app',     label: 'Applicant Signed',   statusMatch: s => ['Pending Manager','Authorised','Submitted to FOI','Closed'].includes(s) },
  { key: 'mgr',     label: 'Manager Authorised', statusMatch: s => ['Authorised','Submitted to FOI','Closed'].includes(s) },
  { key: 'foi',     label: 'Submitted to FOI',   statusMatch: s => ['Submitted to FOI','Closed'].includes(s) },
  { key: 'closed',  label: 'Closed',             statusMatch: s => s === 'Closed' },
]

export default function RIEDetail({ id, profile, onBack, onEdit, autoSign = false }) {
  const [rec, setRec] = useState(null)
  const [loading, setLoading] = useState(true)
  const [signing, setSigning] = useState(null)
  const [error, setError] = useState('')
  const [closeForm, setCloseForm] = useState({ closure_date: '', srp_clearance: '' })
  const [showCloseForm, setShowCloseForm] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

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
    if (autoSign && data?.status === 'Draft' && profile?.can_sign_applicant) {
      setSigning('applicant')
    }
  }

  async function handleSign(body) {
    const { data, error: err } = await rie.sign(id, { role: signing, ...body })
    if (err) return err.error || err.message || 'Sign failed'
    setRec(data)
    setSigning(null)
    return null
  }

  async function handleMarkFoi() {
    const { data, error: err } = await rie.markFoi(id)
    if (err) { setError(err.error || err.message || 'Failed'); return }
    setRec(data)
  }

  async function handleClose() {
    const { data, error: err } = await rie.close(id, closeForm)
    if (err) { setError(err.error || err.message || 'Failed'); return }
    setRec(data)
    setShowCloseForm(false)
  }

  async function handleTechlogUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(''); setUploading(true)
    const { data, error: err } = await rie.uploadTechlog(id, file)
    setUploading(false)
    if (err) { setUploadError(err.error || 'Upload failed'); return }
    setRec(data)
    e.target.value = ''
  }

  if (loading || !rec) return <div className="loading">Loading…</div>

  const isClosed = rec.status === 'Closed'
  const extDays = isClosed ? null : daysUntil(rec.extension_expiry)
  const foiDays = daysUntil(rec.foi_due_at)
  const isOverdue = extDays !== null && extDays < 0
  const foiOverdue = rec.foi_due_at && foiDays !== null && foiDays < 0 && rec.status === 'Authorised'

  return (
    <div className="page-wide">
      {/* Sticky navigation + actions */}
      <div className="sticky-bar">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Dashboard</button>
        <h1 className="bar-ref">{rec.ref_number || 'Draft'}</h1>
        <div className="spacer" />
        <div className="bar-actions">
          {rec.status === 'Draft' && (
            <button className="btn btn-ghost" onClick={() => onEdit(id)}>Edit</button>
          )}
          {(rec.status === 'Authorised' || rec.status === 'Submitted to FOI' || rec.status === 'Closed') && (
            <button className="btn btn-primary" onClick={() => generateRIEPdf(rec).catch(e => setError(e.message || 'PDF generation failed'))}>
              ⬇ Download PDF
            </button>
          )}
          {rec.status === 'Authorised' && (
            <button className="btn btn-success"
              onClick={handleMarkFoi}
              disabled={!rec.techlog_filename}
              title={!rec.techlog_filename ? 'Attach tech log page first' : undefined}>
              Mark Submitted to FOI
            </button>
          )}
        </div>
      </div>

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
              <div className={`ts-dot ${done ? (isCurrent ? 'current' : 'done') : ''}`}>{done ? '✓' : ''}</div>
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

      <div className="rie-parts-row">
      {/* PART 1 — MEL DEFECT */}
      <div className="rie-part-card">
        <div className="rie-part-header">Part 1 — MEL Defect</div>

        <div className="detail-grid">
          <div className="detail-field"><div className="lbl">Date of Defect</div><div className="val">{fmtDate(rec.date_defect_found)}</div></div>
          <div className="detail-field"><div className="lbl">Aircraft Registration</div><div className="val mono">{rec.aircraft_registration}</div></div>
          <div className="detail-field"><div className="lbl">Aircraft Type</div><div className="val">{rec.aircraft_type}</div></div>
          <div className="detail-field"><div className="lbl">MEL Reference No</div><div className="val mono">{rec.mel_item_ref}</div></div>
          <div>
            {rec.mel_chapter_title && <div className="detail-field"><div className="lbl">MEL System Title</div><div className="val">{rec.mel_chapter_title}</div></div>}
            <div className="detail-field">
              <div className="lbl">MEL Interval</div>
              <div className="val">Category {rec.mel_category} ({MEL_DAYS[rec.mel_category]} days)</div>
            </div>
            <div className="detail-field">
              <div className="lbl">MEL Expiry</div>
              <div className="val">{fmtDate(rec.mel_interval_expiry)}</div>
            </div>
          </div>
        </div>

        <div className="detail-field">
          <div className="lbl">Detail of Defect</div>
          <div className="val" style={{ whiteSpace: 'pre-wrap' }}>{rec.defect_description}</div>
        </div>

        {rec.reason_not_rectifying && (
          <div className="detail-field">
            <div className="lbl">Reason for not rectifying</div>
            <div className="val" style={{ whiteSpace: 'pre-wrap' }}>{rec.reason_not_rectifying}</div>
          </div>
        )}

        <div className="detail-field-row">
          {rec.srp_raised && (
            <div className="detail-field">
              <div className="lbl">SRP No</div>
              <div className="val mono">{rec.srp_raised}</div>
            </div>
          )}
          {rec.ref_addp && (
            <div className="detail-field">
              <div className="lbl">MDDR / "P" No</div>
              <div className="val mono">{rec.ref_addp}</div>
            </div>
          )}
        </div>

        {rec.operational_restriction ? (
          <div className="detail-field">
            <div className="lbl">Operational Restriction</div>
            <div className="val">
              <span className="badge badge-overdue" style={{ fontSize: 11 }}>YES</span>
              {rec.additional_limitations && <span style={{ marginLeft: 8 }}>{rec.additional_limitations}</span>}
            </div>
          </div>
        ) : null}
      </div>{/* end Part 1 */}

      {/* PART 2 — RIE APPLICATION */}
      <div className="rie-part-card">
        <div className="rie-part-header">Part 2 — RIE Application</div>

        <div className="detail-grid">
          <div className="detail-field"><div className="lbl">Name of Applicant</div><div className="val">{rec.applicant_name || '—'}</div></div>
          <div className="detail-field"><div className="lbl">Position</div><div className="val">{rec.applicant_position || '—'}</div></div>
          <div className="detail-field">
            <div className="lbl">Requested Duration</div>
            <div className="val">{rec.extension_days} day{rec.extension_days !== 1 ? 's' : ''}</div>
          </div>
          <div className="detail-field">
            <div className="lbl">Extension Expiry</div>
            <div className={`val ${extDays !== null && extDays < 0 ? 'over' : extDays !== null && extDays <= 3 ? 'warn' : ''}`}>
              {fmtDate(rec.extension_expiry)}
              {extDays !== null && <span style={{ marginLeft: 6, fontSize: 11, color: 'inherit' }}>
                ({extDays < 0 ? `${Math.abs(extDays)}d overdue` : `${extDays}d remaining`})
              </span>}
            </div>
          </div>
          {rec.mcc_reference && <div className="detail-field"><div className="lbl">MCC Reference</div><div className="val mono">{rec.mcc_reference}</div></div>}
        </div>

        <div className="detail-field">
          <div className="lbl">Why a Rectification Interval Extension is Required</div>
          <div className="val" style={{ whiteSpace: 'pre-wrap' }}>{rec.extension_reason}</div>
        </div>

        {/* Applicant signature */}
        <div className="sig-block" style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div className="sig-title">Applicant Signature</div>
          {rec.applicant_signed_at ? (
            <>
              {rec.applicant_signature && <div className="sig-img"><img src={rec.applicant_signature} alt="Applicant signature" /></div>}
              <div className="sig-name">{rec.applicant_name}</div>
              {rec.applicant_position && <div className="sig-date">{rec.applicant_position}</div>}
              <div className="sig-date">{fmtDt(rec.applicant_signed_at)}</div>
              <SigSource source={rec.applicant_sig_source} />
            </>
          ) : (
            <div className="sig-pending">
              <div style={{ marginBottom: 8 }}>Not yet signed</div>
              {rec.status === 'Draft' && (profile?.can_sign_applicant ? (
                <button className="btn btn-primary btn-sm" onClick={() => setSigning('applicant')}>Sign as Applicant</button>
              ) : (
                <div className="sig-note">You are not authorised to sign as applicant</div>
              ))}
            </div>
          )}
        </div>
      </div>{/* end Part 2 */}
      </div>{/* end rie-parts-row */}

      {/* PART 3 — AUTHORISATION */}
      <div className="rie-part-card" style={{ marginBottom: 16 }}>
        <div className="rie-part-header">Part 3 — Authorisation</div>

        {rec.manager_signed_at ? (
          <>
            <div className="detail-grid-wide">
              <div className="detail-field"><div className="lbl">RIE Reference</div><div className="val mono">{rec.ref_number || '—'}</div></div>
              <div className="detail-field">
                <div className="lbl">Latest Date for Rectification</div>
                <div className={`val ${extDays !== null && extDays < 0 ? 'over' : extDays !== null && extDays <= 3 ? 'warn' : ''}`}>
                  {fmtDate(rec.extension_expiry)}
                </div>
              </div>
              <div className="detail-field"><div className="lbl">Authorising Manager</div><div className="val">{rec.manager_name}</div></div>
              <div>
                {rec.manager_position && <div className="detail-field"><div className="lbl">Position</div><div className="val">{rec.manager_position}</div></div>}
                <div className="detail-field"><div className="lbl">Date Authorised</div><div className="val">{fmtDt(rec.manager_signed_at)}</div></div>
                <div className="detail-field"><div className="lbl">Duration Authorised</div><div className="val">{rec.extension_days} days</div></div>
              </div>
            </div>

            {rec.manager_comments && (
              <div className="detail-field">
                <div className="lbl">Manager Comments</div>
                <div className="val" style={{ whiteSpace: 'pre-wrap' }}>{rec.manager_comments}</div>
              </div>
            )}

            <div className="sig-block" style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <div className="sig-title">Manager Signature</div>
              {rec.manager_signature && <div className="sig-img"><img src={rec.manager_signature} alt="Manager signature" /></div>}
              <div className="sig-name">{rec.manager_name}</div>
              {rec.manager_position && <div className="sig-date">{rec.manager_position}</div>}
              <div className="sig-date">{fmtDt(rec.manager_signed_at)}</div>
              <SigSource source={rec.manager_sig_source} />
            </div>

            {/* Tech log attachment */}
            {['Authorised', 'Submitted to FOI', 'Closed'].includes(rec.status) && (
              <div className="techlog-section">
                <div className="techlog-header">
                  <span className="techlog-label">Tech Log Attachment</span>
                  {rec.techlog_filename
                    ? <span className="badge badge-auth" style={{ fontSize: 10 }}>✓ Attached</span>
                    : rec.status === 'Authorised'
                      ? <span className="badge badge-pending" style={{ fontSize: 10 }}>Required</span>
                      : null}
                </div>
                {rec.techlog_filename ? (
                  <div className="techlog-attached">
                    <span className="techlog-filename">{rec.techlog_original_name || rec.techlog_filename}</span>
                    <span className="techlog-meta">Attached by {rec.techlog_attached_by} · {fmtDt(rec.techlog_attached_at)}</span>
                    <a className="btn btn-ghost btn-sm" href={rie.techdocUrl(id)}
                      target="_blank" rel="noreferrer" style={{ marginTop: 4 }}>
                      View / Download
                    </a>
                    {rec.status === 'Authorised' && profile?.can_sign_applicant && (
                      <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', marginTop: 4 }}>
                        Replace
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }}
                          onChange={handleTechlogUpload} disabled={uploading} />
                      </label>
                    )}
                  </div>
                ) : rec.status === 'Authorised' && profile?.can_sign_applicant ? (
                  <div className="techlog-upload">
                    <p className="page-note" style={{ margin: '0 0 8px' }}>
                      Attach the relevant tech log page as proof the MEL entry has been recorded before submitting to FOI.
                    </p>
                    {uploadError && <div className="auth-error" style={{ marginBottom: 8 }}>{uploadError}</div>}
                    <label className={`btn btn-primary btn-sm ${uploading ? 'disabled' : ''}`} style={{ cursor: 'pointer' }}>
                      {uploading ? 'Uploading…' : 'Attach Tech Log Page'}
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }}
                        onChange={handleTechlogUpload} disabled={uploading} />
                    </label>
                  </div>
                ) : rec.status === 'Authorised' ? (
                  <p className="page-note" style={{ margin: 0 }}>No tech log attached yet — an applicant must attach it before FOI submission.</p>
                ) : null}
              </div>
            )}

            {/* FOI notice */}
            {['Authorised', 'Submitted to FOI', 'Closed'].includes(rec.status) && (
              <div className="foi-notice">
                <span className="foi-notice-label">FOI 10-Day Notice</span>
                This RIE must be submitted to the Flight Operations Inspector within 10 days of authorisation.
                {' '}Due: <strong>{fmtDate(rec.foi_due_at)}</strong>
                {rec.foi_submitted_at && <> · Submitted: <strong>{fmtDt(rec.foi_submitted_at)}</strong></>}
              </div>
            )}
          </>
        ) : (
          <div className="sig-pending">
            {rec.status === 'Pending Manager' ? (
              <>
                <div style={{ marginBottom: 8 }}>Awaiting manager authorisation</div>
                {rec.applicant_id === profile?.id ? (
                  <div className="sig-note">You signed as applicant — a different manager must authorise</div>
                ) : profile?.can_sign_manager ? (
                  <button className="btn btn-primary btn-sm" onClick={() => setSigning('manager')}>Authorise as Manager</button>
                ) : (
                  <div className="sig-note">You are not authorised to sign as manager</div>
                )}
              </>
            ) : (
              <div className="page-note">Awaiting applicant signature first (Part 2 above)</div>
            )}
          </div>
        )}
      </div>

      {/* RIE CLOSURE */}
      <div className="rie-part-card rie-closure" style={{ marginBottom: 16 }}>
        <div className="rie-part-header">RIE Closure</div>

        {isClosed ? (
          <div className="detail-grid-wide">
            <div className="detail-field"><div className="lbl">RIE Raised SRP No</div><div className="val mono">{rec.srp_raised || '—'}</div></div>
            <div className="detail-field"><div className="lbl">Closure Date</div><div className="val">{fmtDate(rec.closure_date)}</div></div>
            <div className="detail-field"><div className="lbl">Clearance SRP No</div><div className="val mono">{rec.srp_clearance || '—'}</div></div>
            <div className="detail-field"><div className="lbl">RIE Closed</div><div className="val"><span className="badge badge-closed">✓ Closed</span></div></div>
          </div>
        ) : (
          <>
            {showCloseForm ? (
              <div>
                <div className="field-row" style={{ marginBottom: 8 }}>
                  <div className="field">
                    <label>Closure Date</label>
                    <input type="date" value={closeForm.closure_date} onChange={e => setCloseForm(f => ({ ...f, closure_date: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label>Clearance SRP No</label>
                    <input value={closeForm.srp_clearance} onChange={e => setCloseForm(f => ({ ...f, srp_clearance: e.target.value }))} placeholder="e.g. SRP-2026-002" />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowCloseForm(false)}>Cancel</button>
                  <button className="btn btn-danger btn-sm" onClick={handleClose}>Confirm Close Record</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="page-note" style={{ margin: 0 }}>Record is not yet closed.</span>
                {profile?.is_admin && (
                  <button className="btn btn-danger btn-sm" onClick={() => setShowCloseForm(true)}>Close Record</button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Signature modal */}
      {signing && (
        <SignaturePad
          mode={signing}
          profile={profile}
          maxDays={MEL_DAYS[rec.mel_category]}
          onSign={handleSign}
          onCancel={() => setSigning(null)}
        />
      )}
    </div>
  )
}
