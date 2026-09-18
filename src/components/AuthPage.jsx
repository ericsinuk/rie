import { useState } from 'react'
import { auth } from '../lib/api.js'
import dhlLogo from '../assets/dhl-logo.svg'

const ROLES = ['Engineer', 'Maintenance Manager', 'Flight Operations', 'Quality', 'Admin']

export default function AuthPage() {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [department, setDepartment] = useState('Engineer')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await auth.signInWithPassword({ email, password })
    if (error) setError(error.message || 'Invalid credentials')
    setLoading(false)
  }

  async function handleSignup(e) {
    e.preventDefault()
    if (!fullName.trim()) { setError('Full name is required'); return }
    setLoading(true); setError('')
    const { error } = await auth.signUp({ email, password, options: { data: { full_name: fullName, department } } })
    if (error) { setError(error.message || 'Sign up failed'); setLoading(false); return }
    setLoading(false)
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="dhl"><img src={dhlLogo} alt="DHL" /></div>
          <div className="app">Rectification Interval Extension</div>
        </div>

        {mode === 'login' ? (
          <form onSubmit={handleLogin}>
            {error && <div className="auth-error">{error}</div>}
            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="name@dhl.com" autoComplete="email" />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" autoComplete="current-password" />
            </div>
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 4 }} disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignup}>
            {error && <div className="auth-error">{error}</div>}
            <div className="field">
              <label>Full Name</label>
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} required placeholder="John Smith" autoComplete="name" />
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="name@dhl.com" autoComplete="email" />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Min 6 characters" autoComplete="new-password" />
            </div>
            <div className="field">
              <label>Role / Department</label>
              <select value={department} onChange={e => setDepartment(e.target.value)}>
                {ROLES.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 4 }} disabled={loading}>
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>
        )}

        <div className="auth-toggle">
          {mode === 'login' ? (
            <>No account? <button onClick={() => { setMode('signup'); setError('') }}>Register</button></>
          ) : (
            <>Have an account? <button onClick={() => { setMode('login'); setError('') }}>Sign In</button></>
          )}
        </div>
      </div>
    </div>
  )
}
