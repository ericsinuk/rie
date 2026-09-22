import { useState, useEffect } from 'react'
import { rie } from '../lib/api.js'

const MEL_DAYS = { B: 3, C: 10, D: 120 }

function addDays(isoDate, days) {
  const d = new Date(isoDate)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const RIE_RULES = [
  { key: 'A', text: 'The defect must be re-inspected at each regular flight check.' },
  { key: 'B', text: 'The defect must not exceed the maximum rectification interval specified in the MEL.' },
  { key: 'C', text: 'The aircraft must be operated in compliance with all associated (O) and (M) procedures.' },
  { key: 'D', text: 'The RIE is subject to review at each subsequent base maintenance visit or as directed by the Maintenance Manager.' },
]

export default function RIEForm({ profile, editId, onBack, onSaved, fleetList = [] }) {
  const [loading, setLoading] = useState(!!editId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    aircraft_registration: '',
    aircraft_type: '',
    mel_item_ref: '',
    mel_chapter_title: '',
    defect_description: '',
    reason_not_rectifying: '',
    mel_category: 'C',
    date_defect_found: '',
    srp_raised: '',
    ref_addp: '',
    operational_restriction: false,
    // Part 2
    applicant_position: '',
    extension_days: '10',
    extension_reason: '',
    mcc_reference: '',
    additional_limitations: '',
  })

  useEffect(() => {
    if (editId) {
      rie.get(editId).then(({ data }) => {
        if (data) setForm({
          aircraft_registration: data.aircraft_registration || '',
          aircraft_type: data.aircraft_type || '',
          mel_item_ref: data.mel_item_ref || '',
          mel_chapter_title: data.mel_chapter_title || '',
          defect_description: data.defect_description || '',
          reason_not_rectifying: data.reason_not_rectifying || '',
          mel_category: data.mel_category || 'C',
          date_defect_found: data.date_defect_found || '',
          srp_raised: data.srp_raised || '',
          ref_addp: data.ref_addp || '',
          operational_restriction: !!data.operational_restriction,
          applicant_position: data.applicant_position || '',
          extension_days: String(data.extension_days || '5'),
          extension_reason: data.extension_reason || '',
          mcc_reference: data.mcc_reference || '',
          additional_limitations: data.additional_limitations || '',
        })
        setLoading(false)
      })
    }
  }, [editId])

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  const melExpiry = form.date_defect_found && form.mel_category
    ? addDays(form.date_defect_found, MEL_DAYS[form.mel_category])
    : null

  // An RIE may extend an item by at most its original rectification interval
  const maxExtension = MEL_DAYS[form.mel_category]

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.aircraft_registration.trim()) return setError('Aircraft registration is required')
    if (!form.mel_item_ref.trim()) return setError('MEL item reference is required')
    if (!form.defect_description.trim()) return setError('Detail of defect is required')
    if (!form.date_defect_found) return setError('Date of defect is required')
    if (!form.extension_reason.trim()) return setError('Justification (Why RIE Required) is required')
    if (!form.extension_days || parseInt(form.extension_days) < 1) return setError('Extension duration must be at least 1 day')
    if (parseInt(form.extension_days) > maxExtension)
      return setError(`A Cat ${form.mel_category} item may be extended by at most ${maxExtension} days — an RIE cannot exceed the original rectification interval`)

    setSaving(true)
    const payload = {
      ...form,
      date_mel_start: form.date_defect_found,
      extension_days: parseInt(form.extension_days),
      operational_restriction: form.operational_restriction ? 1 : 0,
    }
    const { data, error: err } = editId
      ? await rie.update(editId, payload)
      : await rie.create(payload)

    setSaving(false)
    if (err) return setError(err.error || err.message || 'Save failed')
    onSaved(data.id)
  }

  if (loading) return <div className="loading">Loading…</div>

  return (
    <div className="page-wide">
      <div className="sticky-bar">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
        <h1>{editId ? 'Edit RIE' : 'New Rectification Interval Extension'}</h1>
        <div className="spacer" />
        <div className="bar-actions">
          <button type="submit" form="rie-form" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : editId ? 'Save Changes' : 'Save as Draft'}
          </button>
        </div>
      </div>

      {error && <div className="auth-error" style={{ marginBottom: 16 }}>{error}</div>}

      <form id="rie-form" onSubmit={handleSubmit}>

        <div className="rie-parts-row">
        {/* PART 1 — MEL DEFECT */}
        <div className="rie-part-card">
          <div className="rie-part-header">Part 1 — MEL Defect</div>

          {/* Row 1: Date of Defect | Aircraft Reg | Aircraft Type */}
          <div className="field-row-3">
            <div className="field">
              <label>Date of Defect *</label>
              <input type="date" value={form.date_defect_found} onChange={e => set('date_defect_found', e.target.value)} required />
            </div>
            <div className="field">
              <label>Aircraft Registration *</label>
              {fleetList.length > 0 ? (
                <select
                  value={form.aircraft_registration}
                  onChange={e => {
                    const ac = fleetList.find(f => f.registration === e.target.value)
                    setForm(f => ({ ...f, aircraft_registration: e.target.value, aircraft_type: ac ? ac.aircraft_type : f.aircraft_type }))
                  }}
                  required
                >
                  <option value="">— Select aircraft —</option>
                  {fleetList.map(f => (
                    <option key={f.id} value={f.registration}>{f.registration}</option>
                  ))}
                </select>
              ) : (
                <input value={form.aircraft_registration} onChange={e => set('aircraft_registration', e.target.value.toUpperCase())} placeholder="G-DHLA" required />
              )}
            </div>
            <div className="field">
              <label>Aircraft Type</label>
              <div className="computed-field">{form.aircraft_type || '—'}</div>
            </div>
          </div>

          {/* Row 2: MEL Expiry | MEL Interval | MEL Ref No */}
          <div className="field-row-3">
            <div className="field">
              <label>MEL Expiry Date</label>
              <div className="computed-field">{melExpiry ? fmtDate(melExpiry) : '—'}</div>
            </div>
            <div className="field">
              <label>MEL Interval *</label>
              <select
                value={form.mel_category}
                onChange={e => setForm(f => ({ ...f, mel_category: e.target.value, extension_days: String(MEL_DAYS[e.target.value]) }))}
                required
              >
                <option value="B">B — 3 days</option>
                <option value="C">C — 10 days</option>
                <option value="D">D — 120 days</option>
              </select>
            </div>
            <div className="field">
              <label>MEL Reference No *</label>
              <input value={form.mel_item_ref} onChange={e => set('mel_item_ref', e.target.value)} placeholder="24-20-01A" required />
            </div>
          </div>

          {/* Row 3: SRP No | MDDR "P" No */}
          <div className="field-row">
            <div className="field">
              <label>SRP No</label>
              <input value={form.srp_raised} onChange={e => set('srp_raised', e.target.value)} placeholder="e.g. SRP-2026-001" />
            </div>
            <div className="field">
              <label>MDDR / "P" No</label>
              <input value={form.ref_addp} onChange={e => set('ref_addp', e.target.value)} placeholder="P-ADD reference" />
            </div>
          </div>

          {/* Full-width text fields */}
          <div className="field">
            <label>MEL System Title</label>
            <input value={form.mel_chapter_title} onChange={e => set('mel_chapter_title', e.target.value)} placeholder="AC Electrical Power" />
          </div>

          <div className="field">
            <label>Detail of Defect *</label>
            <textarea value={form.defect_description} onChange={e => set('defect_description', e.target.value)} rows={3}
              placeholder="Describe the defect in detail…" required />
          </div>

          <div className="field">
            <label>Reason for not rectifying</label>
            <textarea value={form.reason_not_rectifying} onChange={e => set('reason_not_rectifying', e.target.value)} rows={2}
              placeholder="Why cannot the defect be rectified now (e.g. part not available, AOG situation)…" />
          </div>

          {/* Operational restriction at bottom of Part 1 */}
          <div className="field">
            <label className="check-label">
              <input type="checkbox" checked={form.operational_restriction} onChange={e => set('operational_restriction', e.target.checked)} />
              Operational Restriction applies
            </label>
            {form.operational_restriction && (
              <textarea value={form.additional_limitations} onChange={e => set('additional_limitations', e.target.value)} rows={2}
                placeholder="Describe the operational restriction or limitation…" style={{ marginTop: 6 }} />
            )}
          </div>
        </div>{/* end Part 1 */}

        {/* PART 2 — RIE APPLICATION */}
        <div className="rie-part-card">
          <div className="rie-part-header">Part 2 — RIE Application</div>

          <div className="field-row">
            <div className="field">
              <label>Name of Applicant</label>
              <div className="computed-field">{profile?.full_name || '—'}</div>
            </div>
            <div className="field">
              <label>Position</label>
              <input value={form.applicant_position} onChange={e => set('applicant_position', e.target.value)} placeholder="e.g. MOC Engineer" />
            </div>
          </div>

          <div className="field">
            <label>Why a Rectification Interval Extension is Required *</label>
            <textarea value={form.extension_reason} onChange={e => set('extension_reason', e.target.value)} rows={4}
              placeholder="Justify why an extension to the MEL interval is required…" required />
          </div>

          <div className="field-row">
            <div className="field">
              <label>Requested Duration (days) *</label>
              <input type="number" min="1" max={maxExtension} value={form.extension_days}
                onChange={e => set('extension_days', e.target.value)} required />
              <div className="field-hint">
                Max {maxExtension} days — a Cat {form.mel_category} extension cannot exceed its original interval
              </div>
            </div>
            <div className="field">
              <label>MCC Reference</label>
              <input value={form.mcc_reference} onChange={e => set('mcc_reference', e.target.value)} placeholder="MCC-2026-xxxx" />
            </div>
          </div>

          <div className="rie-rules-box">
            <div className="rie-rules-title">RIE Conditions — the following apply to all approved RIEs:</div>
            {RIE_RULES.map(r => (
              <div key={r.key} className="rie-rule-row">
                <span className="rie-rule-key">{r.key}.</span>
                <span>{r.text}</span>
              </div>
            ))}
          </div>
        </div>{/* end Part 2 */}
        </div>{/* end rie-parts-row */}

        {/* PART 3 — placeholder (completed at signing) */}
        <div className="rie-part-card rie-part-readonly" style={{ marginBottom: 16 }}>
          <div className="rie-part-header">Part 3 — Authorisation</div>
          <p className="page-note" style={{ margin: 0 }}>
            Part 3 is completed when the applicant and authorising manager sign the RIE.
            Duration, latest rectification date, signatures, and manager comments are recorded at that stage.
          </p>
        </div>

      </form>
    </div>
  )
}
