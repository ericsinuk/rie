import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase.js'
import AuthPage from './components/AuthPage.jsx'
import Dashboard from './components/Dashboard.jsx'
import RIEForm from './components/RIEForm.jsx'
import RIEDetail from './components/RIEDetail.jsx'
import AdminPanel from './components/AdminPanel.jsx'
import SignaturePad from './components/SignaturePad.jsx'
import { profiles, fleet as fleetApi } from './lib/api.js'
import dhlLogo from './assets/dhl-logo.svg'
import './styles/index.css'

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [view, setView] = useState({ page: 'dashboard' })
  const [enrolling, setEnrolling] = useState(false)
  const [fleetList, setFleetList] = useState([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_ev, session) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else { setProfile(null); setView({ page: 'dashboard' }) }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(userId) {
    const { data } = await profiles.get(userId)
    setProfile(data)
  }

  useEffect(() => {
    if (!session) return
    fleetApi.list().then(({ data }) => { if (data) setFleetList(data.filter(f => f.active)) })
  }, [session])

  async function saveSignature({ signature, password }) {
    const { data, error } = await profiles.saveSignature(signature, password)
    if (error) return error.error || 'Could not save signature'
    setProfile(data)
    setEnrolling(false)
    return null
  }

  const canSign = profile?.can_sign_applicant || profile?.can_sign_manager

  async function handleSignOut() {
    setProfile(null)
    setSession(null)
    setView({ page: 'dashboard' })
    await supabase.auth.signOut()
  }

  if (session === undefined) return <div className="loading">Loading…</div>
  if (!session) return <AuthPage />

  return (
    <>
      <header className="app-header">
        <span className="logo"><img src={dhlLogo} alt="DHL" /></span>
        <div>
          <div className="title">Rectification Interval Extension</div>
          <div className="subtitle">MEL Management System</div>
        </div>
        <div style={{ flex: 1 }} />
        {profile?.is_admin && (
          <button className="nav-btn" onClick={() => setView({ page: 'admin' })}>Admin</button>
        )}
        {canSign && (
          <button className="nav-btn" onClick={() => setEnrolling(true)}>
            My signature{!profile.has_signature && <span className="nav-dot" title="No saved signature yet" />}
          </button>
        )}
        {profile && (
          <button className="user-btn" onClick={handleSignOut} title="Sign out">
            {profile.full_name || profile.email}
            <span style={{ color: 'var(--text-3)' }}>↩</span>
          </button>
        )}
      </header>

      {view.page === 'dashboard' && (
        <Dashboard
          profile={profile}
          onNew={() => setView({ page: 'new' })}
          onOpen={(id) => setView({ page: 'detail', id })}
        />
      )}
      {view.page === 'new' && (
        <RIEForm
          profile={profile}
          fleetList={fleetList}
          onBack={() => setView({ page: 'dashboard' })}
          onSaved={(id) => setView({ page: 'detail', id })}
        />
      )}
      {view.page === 'edit' && (
        <RIEForm
          profile={profile}
          fleetList={fleetList}
          editId={view.id}
          onBack={() => setView({ page: 'detail', id: view.id })}
          onSaved={(id) => setView({ page: 'detail', id })}
        />
      )}
      {view.page === 'admin' && profile?.is_admin && (
        <AdminPanel
          profile={profile}
          onBack={() => setView({ page: 'dashboard' })}
          onSelfChange={() => loadProfile(profile.id)}
        />
      )}
      {enrolling && (
        <SignaturePad mode="enrol" profile={profile} onSign={saveSignature} onCancel={() => setEnrolling(false)} />
      )}
      {view.page === 'detail' && (
        <RIEDetail
          id={view.id}
          profile={profile}
          onBack={() => setView({ page: 'dashboard' })}
          onEdit={(id) => setView({ page: 'edit', id })}
        />
      )}
    </>
  )
}
