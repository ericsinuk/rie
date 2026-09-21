import { useState, useEffect } from 'react'
import { admin } from '../lib/api.js'

const RIGHTS = [
  { key: 'can_sign_applicant', label: 'Applicant' },
  { key: 'can_sign_manager',   label: 'Authorising Manager' },
  { key: 'is_admin',           label: 'Admin' },
]

export default function AdminUsers({ profile, onBack, onSelfChange, embedded = false }) {
  const [users, setUsers] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data, error: err } = await admin.users()
    if (err) return setError(err.error || 'Failed to load users')
    setUsers(data)
  }

  async function toggle(user, key) {
    setError('')
    setSaving(`${user.id}:${key}`)
    const { data, error: err } = await admin.setRights(user.id, { [key]: !user[key] })
    setSaving(null)
    if (err) return setError(err.error || 'Update failed')
    setUsers(us => us.map(u => (u.id === data.id ? data : u)))
    if (data.id === profile?.id) onSelfChange()
  }

  return (
    <div className={embedded ? '' : 'page'}>
      {!embedded && (
        <>
          <div className="form-header">
            <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
            <h1>Users &amp; Signatory Rights</h1>
          </div>
          <p className="page-note">
            Only people ticked here can sign. Nobody can sign both sides of the same RIE, even if they hold both rights.
          </p>
        </>
      )}
      {embedded && (
        <p className="page-note" style={{ marginBottom: 16 }}>
          Only people ticked here can sign. Nobody can sign both sides of the same RIE, even if they hold both rights.
          Department is what the person entered at registration and grants nothing.
        </p>
      )}
      {error && <div className="auth-error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className={embedded ? '' : 'card'} style={embedded ? {} : { padding: 0, overflow: 'hidden' }}>
        {!users ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Loading…</div>
        ) : (
          <div className="table-scroll">
            <table className="rie-table users-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Department</th>
                  {RIGHTS.map(r => <th key={r.key} className="center">{r.label}</th>)}
                  <th className="center">Saved signature</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="no-hover">
                    <td>
                      <div>{u.full_name || '—'}{u.id === profile?.id && <span className="you-tag">you</span>}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{u.email}</div>
                    </td>
                    <td style={{ color: 'var(--text-2)' }}>{u.department || '—'}</td>
                    {RIGHTS.map(r => (
                      <td key={r.key} className="center">
                        <input
                          type="checkbox"
                          className="right-check"
                          checked={!!u[r.key]}
                          disabled={saving === `${u.id}:${r.key}`}
                          onChange={() => toggle(u, r.key)}
                          aria-label={`${r.label} — ${u.full_name || u.email}`}
                        />
                      </td>
                    ))}
                    <td className="center" style={{ color: u.has_signature ? 'var(--success)' : 'var(--text-3)' }}>
                      {u.has_signature ? 'Yes' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
