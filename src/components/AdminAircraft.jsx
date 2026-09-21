import { useState, useEffect } from 'react'
import { fleet } from '../lib/api.js'

export default function AdminAircraft() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newReg, setNewReg] = useState('')
  const [newType, setNewType] = useState('')
  const [editId, setEditId] = useState(null)
  const [editReg, setEditReg] = useState('')
  const [editType, setEditType] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await fleet.list()
    setRows(data || [])
    setLoading(false)
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!newReg.trim() || !newType.trim()) return
    setBusy(true); setError('')
    const { data, error: err } = await fleet.add({ registration: newReg, aircraft_type: newType })
    setBusy(false)
    if (err) { setError(err.error || 'Failed'); return }
    setRows(r => [...r, data].sort((a, b) => a.registration.localeCompare(b.registration)))
    setAdding(false); setNewReg(''); setNewType('')
  }

  async function handleUpdate(id) {
    setBusy(true); setError('')
    const { data, error: err } = await fleet.update(id, { registration: editReg, aircraft_type: editType })
    setBusy(false)
    if (err) { setError(err.error || 'Failed'); return }
    setRows(r => r.map(x => x.id === id ? data : x).sort((a, b) => a.registration.localeCompare(b.registration)))
    setEditId(null)
  }

  async function handleToggleActive(row) {
    const { data, error: err } = await fleet.update(row.id, { active: !row.active })
    if (err) { setError(err.error || 'Failed'); return }
    setRows(r => r.map(x => x.id === row.id ? data : x))
  }

  async function handleDelete(id) {
    if (!confirm('Remove this aircraft from the fleet? This cannot be undone.')) return
    const { error: err } = await fleet.remove(id)
    if (err) { setError(err.error || 'Failed'); return }
    setRows(r => r.filter(x => x.id !== id))
  }

  if (loading) return <div className="loading" style={{ height: 200 }}>Loading…</div>

  const active = rows.filter(r => r.active)
  const inactive = rows.filter(r => !r.active)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{active.length} active aircraft</span>
          {inactive.length > 0 && <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 10 }}>· {inactive.length} retired</span>}
        </div>
        {!adding && (
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>+ Add Aircraft</button>
        )}
      </div>

      {error && <div className="auth-error" style={{ marginBottom: 12 }}>{error}</div>}

      {adding && (
        <form onSubmit={handleAdd} className="fleet-add-row">
          <input
            value={newReg} onChange={e => setNewReg(e.target.value.toUpperCase())}
            placeholder="G-XXXX" maxLength={10} style={{ width: 110 }} autoFocus
          />
          <input
            value={newType} onChange={e => setNewType(e.target.value)}
            placeholder="B757" style={{ width: 90 }}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !newReg.trim() || !newType.trim()}>Add</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setAdding(false); setNewReg(''); setNewType('') }}>Cancel</button>
        </form>
      )}

      <table className="rie-table">
        <thead>
          <tr>
            <th>Registration</th>
            <th>Type</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id} className={row.active ? '' : 'fleet-inactive'}>
              {editId === row.id ? (
                <>
                  <td><input value={editReg} onChange={e => setEditReg(e.target.value.toUpperCase())} style={{ width: 100 }} /></td>
                  <td><input value={editType} onChange={e => setEditType(e.target.value)} style={{ width: 80 }} /></td>
                  <td></td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => handleUpdate(row.id)} disabled={busy}>Save</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>Cancel</button>
                  </td>
                </>
              ) : (
                <>
                  <td><span className="val mono">{row.registration}</span></td>
                  <td>{row.aircraft_type}</td>
                  <td>
                    <span className={`badge ${row.active ? 'badge-auth' : 'badge-closed'}`}>
                      {row.active ? 'Active' : 'Retired'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setEditId(row.id); setEditReg(row.registration); setEditType(row.aircraft_type) }}>Edit</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleToggleActive(row)}>
                        {row.active ? 'Retire' : 'Reactivate'}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(row.id)}>✕</button>
                    </div>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
