import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import './Success.css'

async function markSubscribed(userId) {
  console.log('[Success] markSubscribed: start, userId=', userId)
  try {
    await Promise.race([
      supabase.from('user_profiles').upsert({
        id: userId,
        is_subscribed: true,
        updated_at: new Date().toISOString(),
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
    ])
    console.log('[Success] markSubscribed: success')
  } catch (err) {
    console.error('[Success] markSubscribed: threw or timed out', err.message)
  }
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

  // On mount — if already logged in, mark subscribed and go to dashboard.
  // Falls back to showing the signup form after 5 seconds so the page never hangs.
  useEffect(() => {
    console.log('[Success] mount, url=', window.location.href)

    // 5-second safety net — if getSession hangs or throws, show the form anyway
    const fallback = setTimeout(() => {
      console.warn('[Success] 5s timeout reached — forcing signup form visible')
      setChecking(false)
    }, 5000)

    async function checkSession() {
      try {
        console.log('[Success] checkSession: calling supabase.auth.getSession')
        const { data, error: sessionError } = await supabase.auth.getSession()
        console.log('[Success] checkSession: getSession returned', { session: !!data?.session, sessionError })

        if (sessionError) {
          console.error('[Success] checkSession: session error', sessionError)
          setChecking(false)
          return
        }

        const session = data?.session
        if (session?.user) {
          console.log('[Success] checkSession: active session found for', session.user.email)
          await markSubscribed(session.user.id)
          console.log('[Success] checkSession: navigating to /dashboard')
          navigate('/dashboard', { replace: true })
        } else {
          console.log('[Success] checkSession: no active session — showing signup form')
          setChecking(false)
        }
      } catch (err) {
        console.error('[Success] checkSession: threw', err)
        setChecking(false)
      } finally {
        clearTimeout(fallback)
      }
    }

    checkSession()
    return () => clearTimeout(fallback)
  }, [navigate])

  async function handleSignup(e) {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      console.log('[Success] handleSignup: calling signUp for', email)
      const { data, error: err } = await Promise.race([
        supabase.auth.signUp({ email, password }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out — please try again.')), 10000)),
      ])
      console.log('[Success] handleSignup: signUp result', { user: !!data?.user, err })
      if (err) {
        console.error('[Success] handleSignup: error', err)
        setError(err.message)
        return
      }
      if (data?.user) {
        await markSubscribed(data.user.id)
        console.log('[Success] handleSignup: navigating to /dashboard')
        navigate('/dashboard', { replace: true })
      } else {
        console.warn('[Success] handleSignup: no user — email confirmation may be required')
        setError('Check your email for a confirmation link.')
      }
    } catch (err) {
      console.error('[Success] handleSignup: threw', err)
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      console.log('[Success] handleLogin: calling signInWithPassword for', email)
      const { data, error: err } = await Promise.race([
        supabase.auth.signInWithPassword({ email, password }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out — please try again.')), 10000)),
      ])
      console.log('[Success] handleLogin: result', { user: !!data?.user, err })
      if (err) {
        console.error('[Success] handleLogin: error', err)
        setError(err.message)
        return
      }
      if (data?.user) {
        await markSubscribed(data.user.id)
        console.log('[Success] handleLogin: navigating to /dashboard')
        navigate('/dashboard', { replace: true })
      }
    } catch (err) {
      console.error('[Success] handleLogin: threw', err)
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
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
