import { useState, useEffect } from 'react'
import { admin } from '../lib/api.js'

const RIGHTS = [
  { key: 'can_sign_applicant', label: 'Applicant' },
  { key: 'can_sign_manager',   label: 'Manager' },
  { key: 'is_admin',           label: 'Admin' },
]

const BLANK_ADD = { email: '', password: '', full_name: '', position: '', department: '' }
const BLANK_EDIT = { full_name: '', position: '', department: '', password: '' }

export default function AdminUsers({ profile, onBack, onSelfChange, embedded = false }) {
  const [users, setUsers] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(null)
  const [showInactive, setShowInactive] = useState(false)

  // add-user form
  const [adding, setAdding] = useState(false)
  const [addForm, setAddForm] = useState(BLANK_ADD)

  // inline edit
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState(BLANK_EDIT)

  useEffect(() => { load() }, [])

  async function load() {
    const { data, error: err } = await admin.users()
    if (err) return setError(err.error || 'Failed to load users')
    setUsers(data)
  }

  // ── Rights toggles ────────────────────────────────────────────────────────
  async function toggle(user, key) {
    setError(''); setSaving(`${user.id}:${key}`)
    const { data, error: err } = await admin.updateUser(user.id, { [key]: !user[key] })
    setSaving(null)
    if (err) return setError(err.error || 'Update failed')
    setUsers(us => us.map(u => u.id === data.id ? data : u))
    if (data.id === profile?.id) onSelfChange()
  }

  // ── Toggle active ─────────────────────────────────────────────────────────
  async function toggleActive(user) {
    setError('')
    const { data, error: err } = await admin.updateUser(user.id, { active: !user.active })
    if (err) return setError(err.error || 'Update failed')
    setUsers(us => us.map(u => u.id === data.id ? data : u))
  }

  // ── Add user ──────────────────────────────────────────────────────────────
  async function handleAdd(e) {
    e.preventDefault()
    if (!addForm.email.trim() || !addForm.password) return
    setSaving('add'); setError('')
    const { data, error: err } = await admin.addUser(addForm)
    setSaving(null)
    if (err) return setError(err.error || 'Failed to add user')
    setUsers(us => [...us, data].sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email)))
    setAdding(false); setAddForm(BLANK_ADD)
  }

  // ── Edit user ─────────────────────────────────────────────────────────────
  function startEdit(u) {
    setEditId(u.id)
    setEditForm({ full_name: u.full_name || '', position: u.position || '', department: u.department || '', password: '' })
  }

  async function handleEdit(id) {
    setSaving(`edit:${id}`); setError('')
    const payload = { ...editForm }
    if (!payload.password) delete payload.password
    const { data, error: err } = await admin.updateUser(id, payload)
    setSaving(null)
    if (err) return setError(err.error || 'Update failed')
    setUsers(us => us.map(u => u.id === data.id ? data : u))
    setEditId(null)
    if (data.id === profile?.id) onSelfChange()
  }

  const activeUsers   = users ? users.filter(u => u.active) : []
  const inactiveUsers = users ? users.filter(u => !u.active) : []
  const visible = showInactive ? users : activeUsers

  return (
    <div className={embedded ? '' : 'page'}>
      {!embedded && (
        <div className="form-header">
          <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
          <h1>Users &amp; Signatory Rights</h1>
        </div>
      )}

      <p className="page-note" style={{ marginBottom: 16 }}>
        Only people ticked here can sign. Nobody can sign both sides of the same RIE, even if they hold both rights.
      </p>

      {error && <div className="auth-error" style={{ marginBottom: 12 }}>{error}</div>}

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{activeUsers.length} active users</span>
          {inactiveUsers.length > 0 && (
            <label className="check-label" style={{ margin: 0, textTransform: 'none', fontSize: 12, color: 'var(--text-3)' }}>
              <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
              Show {inactiveUsers.length} inactive
            </label>
          )}
        </div>
        {!adding && (
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>+ Add User</button>
        )}
      </div>

      {/* Add user form */}
      {adding && (
        <form onSubmit={handleAdd} className="fleet-add-row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <input value={addForm.full_name} onChange={e => setAddForm(f => ({ ...f, full_name: e.target.value }))}
            placeholder="Full name" style={{ width: 150 }} autoFocus />
          <input value={addForm.position} onChange={e => setAddForm(f => ({ ...f, position: e.target.value }))}
            placeholder="Position" style={{ width: 140 }} />
          <input value={addForm.department} onChange={e => setAddForm(f => ({ ...f, department: e.target.value }))}
            placeholder="Department" style={{ width: 120 }} />
          <input value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
            placeholder="Email" type="email" style={{ width: 180 }} required />
          <input value={addForm.password} onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))}
            placeholder="Password" type="password" style={{ width: 130 }} required />
          <button type="submit" className="btn btn-primary btn-sm"
            disabled={saving === 'add' || !addForm.email.trim() || !addForm.password}>
            {saving === 'add' ? 'Adding…' : 'Add'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm"
            onClick={() => { setAdding(false); setAddForm(BLANK_ADD) }}>Cancel</button>
        </form>
      )}

      <div className={embedded ? '' : 'card'} style={embedded ? {} : { padding: 0, overflow: 'hidden' }}>
        {!users ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Loading…</div>
        ) : (
          <div className="table-scroll">
            <table className="rie-table users-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Position</th>
                  <th>Department</th>
                  {RIGHTS.map(r => <th key={r.key} className="center">{r.label}</th>)}
                  <th className="center">Signature</th>
                  <th className="center">Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(u => (
                  <tr key={u.id} className={`${u.active ? '' : 'fleet-inactive'} no-hover`}>
                    {editId === u.id ? (
                      <>
                        <td>
                          <input value={editForm.full_name}
                            onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))}
                            placeholder="Full name" style={{ width: '100%', minWidth: 120 }} autoFocus />
                        </td>
                        <td>
                          <input value={editForm.position}
                            onChange={e => setEditForm(f => ({ ...f, position: e.target.value }))}
                            placeholder="Position" style={{ width: '100%', minWidth: 110 }} />
                        </td>
                        <td>
                          <input value={editForm.department}
                            onChange={e => setEditForm(f => ({ ...f, department: e.target.value }))}
                            placeholder="Department" style={{ width: '100%', minWidth: 100 }} />
                        </td>
                        <td colSpan={RIGHTS.length + 1}>
                          <input value={editForm.password}
                            onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))}
                            placeholder="New password (leave blank to keep)" type="password"
                            style={{ width: '100%', minWidth: 200 }} />
                        </td>
                        <td></td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-primary btn-sm"
                              onClick={() => handleEdit(u.id)}
                              disabled={saving === `edit:${u.id}`}>
                              {saving === `edit:${u.id}` ? '…' : 'Save'}
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>Cancel</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>
                          <div>{u.full_name || '—'}{u.id === profile?.id && <span className="you-tag">you</span>}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{u.email}</div>
                        </td>
                        <td style={{ color: 'var(--text-2)' }}>{u.position || '—'}</td>
                        <td style={{ color: 'var(--text-2)' }}>{u.department || '—'}</td>
                        {RIGHTS.map(r => (
                          <td key={r.key} className="center">
                            <input type="checkbox" className="right-check"
                              checked={!!u[r.key]}
                              disabled={saving === `${u.id}:${r.key}` || !u.active}
                              onChange={() => toggle(u, r.key)}
                              aria-label={`${r.label} — ${u.full_name || u.email}`}
                            />
                          </td>
                        ))}
                        <td className="center" style={{ color: u.has_signature ? 'var(--success)' : 'var(--text-3)' }}>
                          {u.has_signature ? 'Yes' : '—'}
                        </td>
                        <td className="center">
                          <span className={`badge ${u.active ? 'badge-auth' : 'badge-closed'}`}>
                            {u.active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => startEdit(u)}>Edit</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(u)}>
                              {u.active ? 'Deactivate' : 'Reactivate'}
                            </button>
                          </div>
                        </td>
                      </>
                    )}
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
