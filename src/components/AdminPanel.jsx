import { useState } from 'react'
import AdminUsers from './AdminUsers.jsx'
import AdminAircraft from './AdminAircraft.jsx'

const TABS = [
  { key: 'users', label: 'Users & Permissions' },
  { key: 'aircraft', label: 'Fleet' },
]

export default function AdminPanel({ profile, onBack, onSelfChange }) {
  const [tab, setTab] = useState('users')

  return (
    <div className="page-wide">
      <div className="form-header">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
        <h1>Administration</h1>
      </div>

      <div className="admin-tabs">
        {TABS.map(t => (
          <button key={t.key} className={`admin-tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginTop: 0 }}>
        {tab === 'users' && (
          <AdminUsers profile={profile} onBack={onBack} onSelfChange={onSelfChange} embedded />
        )}
        {tab === 'aircraft' && <AdminAircraft />}
      </div>
    </div>
  )
}
