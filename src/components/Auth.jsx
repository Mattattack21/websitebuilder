import { useState } from 'react'
import { supabase } from '../utils/supabase'
import './Auth.css'

export default function Auth({ onSuccess, onBack }) {
  const [tab, setTab] = useState('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  const clearMessages = () => { setError(null); setNotice(null) }

  const switchTab = (t) => { setTab(t); clearMessages(); setPassword(''); setConfirmPassword('') }

  async function handleSignUp(e) {
    e.preventDefault()
    clearMessages()
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({ email, password })
    setLoading(false)
    if (error) { setError(error.message); return }
    if (data.session) {
      onSuccess(data.user)
    } else {
      setNotice('Check your email for a confirmation link to activate your account.')
    }
  }

  async function handleLogin(e) {
    e.preventDefault()
    clearMessages()
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) { setError(error.message); return }
    onSuccess(data.user)
  }

  async function handleForgotPassword() {
    clearMessages()
    if (!email.trim()) { setError('Enter your email above first.'); return }
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    setLoading(false)
    if (error) { setError(error.message); return }
    setNotice('Password reset link sent — check your inbox.')
  }

  return (
    <div className="auth-overlay">
      <div className="auth-scroll">
      <div className="auth-card">

        <div className="auth-brand">
          <span className="auth-logo">siteforge<span className="auth-logo-dot">.</span></span>
          <p className="auth-tagline">Create your account to publish your site</p>
        </div>

        <div className="auth-tabs">
          <button
            className={`auth-tab ${tab === 'signup' ? 'active' : ''}`}
            onClick={() => switchTab('signup')}
          >
            Sign Up
          </button>
          <button
            className={`auth-tab ${tab === 'login' ? 'active' : ''}`}
            onClick={() => switchTab('login')}
          >
            Log In
          </button>
          <div className={`auth-tab-indicator ${tab === 'login' ? 'right' : 'left'}`} />
        </div>

        <form
          className="auth-form"
          onSubmit={tab === 'signup' ? handleSignUp : handleLogin}
          noValidate
        >
          <div className="auth-field">
            <label>Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="auth-field">
            <label>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
            />
          </div>

          {tab === 'signup' && (
            <div className="auth-field">
              <label>Confirm Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
          )}

          {error && <p className="auth-error">{error}</p>}
          {notice && <p className="auth-notice">{notice}</p>}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading
              ? 'Please wait...'
              : tab === 'signup' ? 'Create Account' : 'Log In'}
          </button>

          {tab === 'login' && (
            <button
              type="button"
              className="auth-forgot"
              onClick={handleForgotPassword}
              disabled={loading}
            >
              Forgot Password?
            </button>
          )}
        </form>

        <button className="auth-back" onClick={onBack}>
          ← Back to pricing
        </button>

      </div>
      </div>
    </div>
  )
}
