import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import './Success.css'

async function markSubscribed(userId) {
  try {
    await supabase.from('user_profiles').upsert({
      id: userId,
      is_subscribed: true,
      updated_at: new Date().toISOString(),
    })
  } catch { /* non-blocking */ }
}

export default function Success() {
  const navigate = useNavigate()
  const [checking, setChecking]           = useState(true)
  const [mode, setMode]                   = useState('signup') // 'signup' | 'login'
  const [email, setEmail]                 = useState('')
  const [password, setPassword]           = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState(null)

  // On mount — if already logged in, mark subscribed and go straight to dashboard
  useEffect(() => {
    async function checkSession() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        await markSubscribed(session.user.id)
        navigate('/dashboard', { replace: true })
      } else {
        setChecking(false)
      }
    }
    checkSession()
  }, [navigate])

  async function handleSignup(e) {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.auth.signUp({ email, password })
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    if (data.user) {
      await markSubscribed(data.user.id)
      navigate('/dashboard', { replace: true })
    }
  }

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    if (data.user) {
      navigate('/dashboard', { replace: true })
    }
  }

  function switchMode(next) {
    setMode(next)
    setError(null)
    setPassword('')
    setConfirmPassword('')
  }

  // Checking session — show branded splash
  if (checking) {
    return (
      <div className="success-wrap">
        <span className="success-init-logo">siteforge<span>.</span></span>
      </div>
    )
  }

  return (
    <div className="success-wrap">
      <div className="success-card">

        <div className="success-brand">
          siteforge<span className="success-brand-dot">.</span>
        </div>

        <div className="success-checkmark">✓</div>
        <h1>Welcome to SiteForge!</h1>
        <p className="success-sub">
          Your site is live and ready for customers.{' '}
          {mode === 'signup' ? 'Create your account to access your dashboard.' : 'Log in to access your dashboard.'}
        </p>

        <form
          className="success-form"
          onSubmit={mode === 'signup' ? handleSignup : handleLogin}
          noValidate
        >
          <div className="success-field">
            <label>Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="success-field">
            <label>Password</label>
            <input
              type="password"
              placeholder={mode === 'signup' ? 'Choose a password' : 'Your password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          {mode === 'signup' && (
            <div className="success-field">
              <label>Confirm Password</label>
              <input
                type="password"
                placeholder="Repeat your password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          )}

          {error && <p className="success-error">{error}</p>}

          <button className="success-btn" type="submit" disabled={loading}>
            {loading
              ? 'Please wait…'
              : mode === 'signup' ? 'Create Your Account →' : 'Log In →'}
          </button>
        </form>

        <p className="success-toggle">
          {mode === 'signup'
            ? <>Already have an account? <button type="button" onClick={() => switchMode('login')}>Log in</button></>
            : <>New here? <button type="button" onClick={() => switchMode('signup')}>Sign up</button></>
          }
        </p>

        <p className="success-note">Your subscription is active · Cancel anytime</p>

      </div>
      <div className="success-glow success-glow-1" />
      <div className="success-glow success-glow-2" />
    </div>
  )
}
