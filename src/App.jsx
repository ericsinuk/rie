import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase.js'
import AuthPage from './components/AuthPage.jsx'
import Dashboard from './components/Dashboard.jsx'
import RIEForm from './components/RIEForm.jsx'
import RIEDetail from './components/RIEDetail.jsx'
import dhlLogo from './assets/dhl-logo.svg'
import './styles/index.css'

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [view, setView] = useState({ page: 'dashboard' })

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
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(data)
  }

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
          onBack={() => setView({ page: 'dashboard' })}
          onSaved={(id) => setView({ page: 'detail', id })}
        />
      )}
      {view.page === 'edit' && (
        <RIEForm
          profile={profile}
          editId={view.id}
          onBack={() => setView({ page: 'detail', id: view.id })}
          onSaved={(id) => setView({ page: 'detail', id })}
        />
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
