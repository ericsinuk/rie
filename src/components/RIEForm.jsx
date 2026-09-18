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

function daysUntil(iso) {
  if (!iso) return null
  return Math.ceil((new Date(iso) - new Date()) / 86400000)
}

export default function RIEForm({ profile, editId, onBack, onSaved }) {
  const [loading, setLoading] = useState(!!editId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    aircraft_registration: '',
    aircraft_type: '',
    mel_item_ref: '',
    mel_chapter_title: '',
    defect_description: '',
    mel_category: 'C',
    date_defect_found: '',
    date_mel_start: '',
    extension_days: '5',
    extension_reason: '',
    additional_limitations: '',
    mcc_reference: '',
    ref_addp: '',
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
          mel_category: data.mel_category || 'C',
          date_defect_found: data.date_defect_found || '',
          date_mel_start: data.date_mel_start || '',
          extension_days: String(data.extension_days || '5'),
          extension_reason: data.extension_reason || '',
          additional_limitations: data.additional_limitations || '',
          mcc_reference: data.mcc_reference || '',
          ref_addp: data.ref_addp || '',
        })
        setLoading(false)
      })
    }
  }, [editId])

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  const melExpiry = form.date_mel_start && form.mel_category
    ? addDays(form.date_mel_start, MEL_DAYS[form.mel_category])
    : null

  const extExpiry = melExpiry && form.extension_days
    ? addDays(melExpiry, parseInt(form.extension_days) || 0)
    : null

  const daysToExtExpiry = daysUntil(extExpiry)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.aircraft_registration.trim()) return setError('Aircraft registration is required')
    if (!form.aircraft_type.trim()) return setError('Aircraft type is required')
    if (!form.mel_item_ref.trim()) return setError('MEL item reference is required')
    if (!form.defect_description.trim()) return setError('Defect description is required')
    if (!form.date_defect_found) return setError('Date defect found is required')
    if (!form.date_mel_start) return setError('MEL interval start date is required')
    if (!form.extension_days || parseInt(form.extension_days) < 1) return setError('Extension days must be at least 1')
    if (!form.extension_reason.trim()) return setError('Justification for extension is required')

    setSaving(true)
    const payload = { ...form, extension_days: parseInt(form.extension_days) }
    const { data, error: err } = editId
      ? await rie.update(editId, payload)
      : await rie.create(payload)

    setSaving(false)
    if (err) return setError(err.error || err.message || 'Save failed')
    onSaved(data.id)
  }

  if (loading) return <div className="loading">Loading…</div>

  return (
    <div className="page-sm">
      <div className="form-header">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
        <h1>{editId ? 'Edit RIE' : 'New Rectification Interval Extension'}</h1>
      </div>

      <form onSubmit={handleSubmit}>

        {/* Section 1 */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-title">1. Aircraft &amp; Defect Details</div>

          <div className="field-row">
            <div className="field">
              <label>Aircraft Registration *</label>
              <input value={form.aircraft_registration} onChange={e => set('aircraft_registration', e.target.value.toUpperCase())} placeholder="G-DHLA" required />
            </div>
            <div className="field">
              <label>Aircraft Type *</label>
              <input value={form.aircraft_type} onChange={e => set('aircraft_type', e.target.value)} placeholder="B757-200F" required />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>MEL Item Reference *</label>
              <input value={form.mel_item_ref} onChange={e => set('mel_item_ref', e.target.value)} placeholder="24-20-01A" required />
            </div>
            <div className="field">
              <label>MEL Chapter / Title</label>
              <input value={form.mel_chapter_title} onChange={e => set('mel_chapter_title', e.target.value)} placeholder="AC Electrical Power" />
            </div>
          </div>

          <div className="field">
            <label>Defect Description *</label>
            <textarea
              value={form.defect_description}
              onChange={e => set('defect_description', e.target.value)}
              rows={3}
              placeholder="Describe the defect/fault in detail…"
              required
            />
          </div>
        </div>

        {/* Section 2 */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-title">2. MEL Interval &amp; Extension</div>

          <div className="field">
            <label>MEL Category *</label>
            <div className="cat-select">
              {['B', 'C', 'D'].map(c => (
                <button
                  key={c} type="button"
                  className={`cat-btn ${form.mel_category === c ? `sel-${c}` : ''}`}
                  onClick={() => set('mel_category', c)}
                >
                  {c}
                  <span className="cat-label">{MEL_DAYS[c]} days</span>
                </button>
              ))}
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Date Defect Found *</label>
              <input type="date" value={form.date_defect_found} onChange={e => set('date_defect_found', e.target.value)} required />
            </div>
            <div className="field">
              <label>MEL Interval Start Date *</label>
              <input type="date" value={form.date_mel_start} onChange={e => set('date_mel_start', e.target.value)} required />
            </div>
          </div>

          <div className="field">
            <label>Extension Duration (days) *</label>
            <input
              type="number" min="1" max="365"
              value={form.extension_days}
              onChange={e => set('extension_days', e.target.value)}
              required
            />
          </div>

          {melExpiry && (
            <div className="mel-interval-info">
              <div className="item">
                <span className="lbl">MEL Interval Expiry</span>
                <span className="val">{fmtDate(melExpiry)}</span>
              </div>
              <div className="item">
                <span className="lbl">Extension Expiry</span>
                <span className={`val ${daysToExtExpiry !== null && daysToExtExpiry < 0 ? 'over' : daysToExtExpiry !== null && daysToExtExpiry <= 3 ? 'warn' : ''}`}>
                  {fmtDate(extExpiry)}
                  {daysToExtExpiry !== null && (
                    <span style={{ marginLeft: 6, fontSize: 11 }}>
                      ({daysToExtExpiry < 0 ? `${Math.abs(daysToExtExpiry)}d overdue` : `${daysToExtExpiry}d remaining`})
                    </span>
                  )}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Section 3 */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-title">3. Justification</div>

          <div className="field">
            <label>Reason for Extension *</label>
            <textarea
              value={form.extension_reason}
              onChange={e => set('extension_reason', e.target.value)}
              rows={4}
              placeholder="Explain why the defect cannot be rectified within the MEL interval…"
              required
            />
          </div>

          <div className="field">
            <label>Additional Operational Limitations / Conditions</label>
            <textarea
              value={form.additional_limitations}
              onChange={e => set('additional_limitations', e.target.value)}
              rows={2}
              placeholder="Any conditions or restrictions that apply during the extension period…"
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label>MCC / Technical Reference</label>
              <input value={form.mcc_reference} onChange={e => set('mcc_reference', e.target.value)} placeholder="MCC-2026-xxxx" />
            </div>
            <div className="field">
              <label>ADD "P" No</label>
              <input value={form.ref_addp} onChange={e => set('ref_addp', e.target.value)} placeholder="PADD reference" />
            </div>
          </div>
        </div>

        {error && <div className="auth-error" style={{ marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onBack}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : editId ? 'Save Changes' : 'Save as Draft'}
          </button>
        </div>
      </form>
    </div>
  )
}
