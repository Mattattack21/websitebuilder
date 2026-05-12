import { useState, useEffect, useRef } from 'react'
import './Onboarding.css'
import { supabase } from '../utils/supabase'
import { generateWebsite, suggestIndustries } from '../lib/generateWebsite'
import { redirectToCheckout } from '../utils/stripe'

const VIBES = [
  { id: 'trustworthy', icon: '🛡️', name: 'Trustworthy', desc: 'Professional, reliable, and clean' },
  { id: 'bold',        icon: '⚡',  name: 'Bold',        desc: 'Strong, confident, and impactful' },
  { id: 'warm',        icon: '🌿',  name: 'Warm',        desc: 'Inviting, natural, and human' },
  { id: 'exciting',    icon: '🚀',  name: 'Exciting',    desc: 'Energetic, dynamic, and fun' },
  { id: 'elegant',     icon: '💎',  name: 'Elegant',     desc: 'Refined, sophisticated, and luxurious' },
]

const GEN_MESSAGES = [
  'Choosing your colors...',
  'Designing your layout...',
  'Writing your content...',
  'Building your pages...',
  'Adding finishing touches...',
]

const FEATURES = [
  'AI Website Generation',
  'Up to 5 Pages',
  'Lead Forms',
  'Click-to-Call',
  'AI Content Updates',
  'Theme Changes',
  'Photo Uploads',
  'SEO Optimized',
  'Mobile Ready',
  'Hosting Included',
]

const STEP_LABELS = ['Theme', 'Business']

export default function Onboarding({ onClose, onComplete, user, isSubscribed }) {
  const [step, setStep]               = useState(1)
  const [vibe, setVibe]               = useState(null)
  const [form, setForm]               = useState({ name: '', type: '', city: '', state: '', about: '' })
  const [genProgress, setGenProgress] = useState(0)
  const [genMsgIdx, setGenMsgIdx]     = useState(0)
  const [generatedHtml, setGeneratedHtml] = useState(null)
  const [genError, setGenError]           = useState(null)
  const [genRetryMsg, setGenRetryMsg]     = useState(null)
  const [countdown, setCountdown]         = useState(14 * 60 + 59)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError]     = useState(null)
  const [industrySuggestions, setIndustrySuggestions] = useState([])
  const [suggestingIndustry, setSuggestingIndustry]   = useState(false)

  // Auth step state
  const [authUser, setAuthUser]           = useState(null)
  const [authTab, setAuthTab]             = useState('signup')
  const [authEmail, setAuthEmail]         = useState('')
  const [authPassword, setAuthPassword]   = useState('')
  const [authConfirmPw, setAuthConfirmPw] = useState('')
  const [authLoading, setAuthLoading]     = useState(false)
  const [authError, setAuthError]         = useState(null)

  const cancelledRef = useRef(false)
  const iframeRef    = useRef(null)

  useEffect(() => {
    if (!generatedHtml || !iframeRef.current) return
    iframeRef.current.srcdoc = generatedHtml
  }, [generatedHtml])

  useEffect(() => {
    if (step !== 3) return
    const msgTimer = setInterval(() => setGenMsgIdx(i => (i + 1) % GEN_MESSAGES.length), 2200)
    return () => clearInterval(msgTimer)
  }, [step])

  useEffect(() => {
    if (step !== 3) return
    cancelledRef.current = false
    setGenProgress(0)
    setGenError(null)
    setGenRetryMsg(null)

    generateWebsite(
      {
        themeVibe:           vibe,
        businessName:        form.name,
        businessType:        form.type,
        city:                form.city,
        state:               form.state,
        businessDescription: form.about,
      },
      null,
      (pct) => { if (!cancelledRef.current) setGenProgress(pct) },
      () => { if (!cancelledRef.current) setGenRetryMsg('Generation took too long, trying again…') }
    )
      .then(html => {
        if (cancelledRef.current) return
        setGeneratedHtml(html)
        setStep(4)
      })
      .catch(err => {
        if (cancelledRef.current) return
        setGenError(err?.message ?? 'Something went wrong. Please try again.')
      })

    return () => { cancelledRef.current = true }
  }, [step])

  // Countdown timer for pricing step (step 6)
  useEffect(() => {
    if (step !== 6) return
    setCountdown(14 * 60 + 59)
    const timer = setInterval(() => setCountdown(c => (c <= 1 ? 0 : c - 1)), 1000)
    return () => clearInterval(timer)
  }, [step])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  async function handleNameBlur() {
    if (!form.name.trim()) return
    setSuggestingIndustry(true)
    const suggestions = await suggestIndustries(form.name)
    setIndustrySuggestions(suggestions)
    setSuggestingIndustry(false)
  }

  const formValid = form.name.trim() && form.type && form.city.trim() && form.state.trim()
  const canNext   = (step === 1 && vibe) || (step === 2 && formValid)

  const countdownMins = String(Math.floor(countdown / 60)).padStart(2, '0')
  const countdownSecs = String(countdown % 60).padStart(2, '0')

  // ── Step 4: "Go live" handler ─────────────────────────────────────────────
  function handleGoLive() {
    const bData = {
      themeVibe:           vibe,
      businessName:        form.name,
      businessType:        form.type,
      city:                form.city,
      state:               form.state,
      businessDescription: form.about,
    }
    if (user && isSubscribed) {
      // Subscribed user doing a theme change — apply directly
      onComplete(user, generatedHtml, bData)
    } else if (user && !isSubscribed) {
      // Logged in but not subscribed — skip auth, go straight to pricing
      setAuthUser(user)
      setStep(6)
    } else {
      // Anonymous — collect account first
      setStep(5)
    }
  }

  // ── Step 5: Account creation ──────────────────────────────────────────────
  async function handleAuthSuccess(newUser) {
    const bData = {
      themeVibe:           vibe,
      businessName:        form.name,
      businessType:        form.type,
      city:                form.city,
      state:               form.state,
      businessDescription: form.about,
    }
    setAuthUser(newUser)

    // Save generated site to their profile immediately
    supabase.from('user_profiles').upsert({
      id:                   newUser.id,
      site_html:            generatedHtml,
      theme_vibe:           vibe,
      business_name:        form.name,
      business_type:        form.type,
      city:                 form.city,
      state:                form.state,
      business_description: form.about,
      setup_complete:       false,
      updated_at:           new Date().toISOString(),
    }).then(null, () => {})

    // Check if they're already subscribed (returning user)
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('is_subscribed')
      .eq('id', newUser.id)
      .maybeSingle()

    if (profile?.is_subscribed) {
      onComplete(newUser, generatedHtml, bData)
    } else {
      setStep(6)
    }
  }

  async function handleAuthSubmit(e) {
    e.preventDefault()
    setAuthError(null)
    if (authTab === 'signup' && authPassword !== authConfirmPw) {
      setAuthError('Passwords do not match.')
      return
    }
    if (authPassword.length < 6) {
      setAuthError('Password must be at least 6 characters.')
      return
    }
    setAuthLoading(true)
    try {
      let data, error
      if (authTab === 'signup') {
        ({ data, error } = await supabase.auth.signUp({ email: authEmail, password: authPassword }))
      } else {
        ({ data, error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword }))
      }
      if (error) { setAuthError(error.message); return }
      if (data?.user) {
        await handleAuthSuccess(data.user)
      } else {
        setAuthError('Check your email for a confirmation link.')
      }
    } catch (err) {
      setAuthError('Something went wrong. Please try again.')
    } finally {
      setAuthLoading(false)
    }
  }

  // ── Step 6: Stripe checkout ───────────────────────────────────────────────
  async function handleCheckout() {
    setCheckoutLoading(true)
    setCheckoutError(null)
    try {
      await redirectToCheckout(authUser?.id ?? null, authUser?.email ?? null)
    } catch (err) {
      console.error('Checkout error:', err)
      setCheckoutError('Something went wrong. Please try again.')
      setCheckoutLoading(false)
    }
  }

  // ── Step 3: Generating ────────────────────────────────────────────────────
  if (step === 3) {
    return (
      <div className="ob-overlay">
        <div className="ob-generating">
          <div className="ob-gen-sparkle">✨</div>
          <h2>Building your website...</h2>
          {genError ? (
            <p className="ob-gen-error">{genError}</p>
          ) : genRetryMsg ? (
            <p className="ob-gen-msg ob-gen-retry">{genRetryMsg}</p>
          ) : (
            <p className="ob-gen-msg">{GEN_MESSAGES[genMsgIdx]}</p>
          )}
          <div className="ob-gen-track">
            <div className="ob-gen-fill" style={{ width: `${genProgress}%` }} />
          </div>
          <span className="ob-gen-pct">{genProgress}%</span>
          {genError && (
            <button className="ob-btn-retry" onClick={() => setStep(2)}>← Go Back</button>
          )}
        </div>
      </div>
    )
  }

  // ── Step 4: Preview ───────────────────────────────────────────────────────
  if (step === 4) {
    return (
      <div className="ob-overlay">
        <div className="ob-preview-wrap">
          <div className="ob-preview-bar">
            <div className="ob-preview-bar-left">
              <span className="ob-preview-logo">siteforge<span className="ob-preview-logo-dot">.</span></span>
            </div>
            <div className="ob-preview-bar-right">
              <button
                className="ob-btn-changetheme"
                onClick={() => {
                  setVibe(null)
                  setGeneratedHtml(null)
                  setGenProgress(0)
                  setGenError(null)
                  setStep(1)
                }}
              >
                Change Theme
              </button>
              <button className="ob-btn-golive" onClick={handleGoLive}>
                This is perfect, let's go live →
              </button>
            </div>
          </div>
          <p className="ob-preview-subtitle">Here's your new website. Scroll through and see how it looks.</p>
          <iframe
            ref={iframeRef}
            className="ob-preview-iframe"
            title="Your generated website"
          />
        </div>
      </div>
    )
  }

  // ── Step 5: Create account ────────────────────────────────────────────────
  if (step === 5) {
    return (
      <div className="ob-overlay">
        <div className="ob-modal">
          <div className="ob-header">
            <div className="ob-header-top">
              <div style={{ flex: 1 }} />
              <button className="ob-close" onClick={onClose} aria-label="Close">✕</button>
            </div>
          </div>
          <div className="ob-content">
            <div className="ob-section">
              <h2>Save your website</h2>
              <p className="ob-sub">Create an account to publish and manage your site.</p>

              <div className="ob-auth-tabs">
                <button
                  type="button"
                  className={`ob-auth-tab${authTab === 'signup' ? ' active' : ''}`}
                  onClick={() => { setAuthTab('signup'); setAuthError(null) }}
                >
                  Sign Up
                </button>
                <button
                  type="button"
                  className={`ob-auth-tab${authTab === 'login' ? ' active' : ''}`}
                  onClick={() => { setAuthTab('login'); setAuthError(null) }}
                >
                  Log In
                </button>
              </div>

              <form className="ob-form" onSubmit={handleAuthSubmit} noValidate>
                <div className="ob-field">
                  <label>Email</label>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={authEmail}
                    onChange={e => setAuthEmail(e.target.value)}
                    required
                    autoComplete="email"
                    autoFocus
                  />
                </div>
                <div className="ob-field">
                  <label>Password</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={authPassword}
                    onChange={e => setAuthPassword(e.target.value)}
                    required
                    autoComplete={authTab === 'signup' ? 'new-password' : 'current-password'}
                  />
                </div>
                {authTab === 'signup' && (
                  <div className="ob-field">
                    <label>Confirm Password</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={authConfirmPw}
                      onChange={e => setAuthConfirmPw(e.target.value)}
                      required
                      autoComplete="new-password"
                    />
                  </div>
                )}
                {authError && <p className="ob-gen-error">{authError}</p>}
                <button
                  className="ob-btn-next"
                  type="submit"
                  disabled={authLoading}
                  style={{ width: '100%', marginTop: 8 }}
                >
                  {authLoading
                    ? 'Please wait...'
                    : authTab === 'signup' ? 'Create Account →' : 'Log In →'}
                </button>
              </form>
            </div>
          </div>
          <div className="ob-footer">
            <button className="ob-btn-back" onClick={() => setStep(4)}>← Back</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Step 6: Pricing → Stripe checkout ────────────────────────────────────
  if (step === 6) {
    return (
      <div className="ob-overlay ob-pricing-overlay">
        <div className="ob-pricing-scroll">
          <div className="ob-pricing-card ob-fadein">

            <div className="ob-pricing-badge">🔥 Limited Time Special</div>

            <div className="ob-pricing-header">
              <div className="ob-pricing-crossed-prices">
                <span className="ob-pricing-cross">$39.99</span>
                <span className="ob-pricing-cross">$29.99</span>
              </div>
              <div className="ob-pricing-main-price">
                $19.99<span className="ob-pricing-period">/month</span>
              </div>
              <p className="ob-pricing-billing">Billed monthly. Cancel anytime.</p>
            </div>

            <ul className="ob-pricing-features">
              {FEATURES.map(f => (
                <li key={f}>
                  <span className="ob-pricing-check">✓</span>
                  {f}
                </li>
              ))}
            </ul>

            <p className="ob-pricing-fine">No contracts. Cancel anytime.</p>

            <div className={`ob-pricing-countdown ${countdown === 0 ? 'expired' : ''}`}>
              {countdown > 0 ? (
                <>
                  <span className="ob-countdown-icon">⏱</span>
                  Offer expires in <strong>{countdownMins}:{countdownSecs}</strong>
                </>
              ) : (
                <span className="ob-countdown-expired">Offer expired — price may increase soon</span>
              )}
            </div>

            <button
              className="ob-pricing-cta"
              onClick={handleCheckout}
              disabled={checkoutLoading}
            >
              {checkoutLoading ? 'Redirecting to checkout…' : 'Start For $19.99/month'}
            </button>

            {checkoutError && (
              <p className="ob-gen-error" style={{ margin: '0 24px 8px', textAlign: 'center' }}>
                {checkoutError}
              </p>
            )}

            <button className="ob-pricing-back" onClick={() => setStep(5)}>
              ← Back
            </button>

          </div>
        </div>
      </div>
    )
  }

  // ── Steps 1 & 2 ───────────────────────────────────────────────────────────
  return (
    <div className="ob-overlay">
      <div className="ob-modal">

        <div className="ob-header">
          <div className="ob-header-top">
            <div className="ob-steps">
              {STEP_LABELS.map((label, i) => {
                const n = i + 1
                return (
                  <div key={label} className={`ob-step ${step === n ? 'active' : ''} ${step > n ? 'done' : ''}`}>
                    <div className="ob-step-dot">{step > n ? '✓' : n}</div>
                    <span className="ob-step-label">{label}</span>
                    {i < STEP_LABELS.length - 1 && <div className="ob-step-line" />}
                  </div>
                )
              })}
            </div>
            <button className="ob-close" onClick={onClose} aria-label="Close">✕</button>
          </div>
          <div className="ob-progress-track">
            <div className="ob-progress-fill" style={{ width: `${((step - 1) / 2) * 100}%` }} />
          </div>
        </div>

        <div className="ob-content">

          {step === 1 && (
            <div className="ob-section">
              <h2>What's your brand vibe?</h2>
              <p className="ob-sub">Choose the feel that best represents your business.</p>
              <div className="ob-vibes">
                {VIBES.map(v => (
                  <button
                    key={v.id}
                    className={`ob-vibe-card ${vibe === v.id ? 'selected' : ''}`}
                    onClick={() => setVibe(v.id)}
                  >
                    <span className="ob-vibe-icon">{v.icon}</span>
                    <strong>{v.name}</strong>
                    <span className="ob-vibe-desc">{v.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="ob-section">
              <h2>Tell us about your business</h2>
              <p className="ob-sub">We'll use this to generate your website content.</p>
              <div className="ob-form">
                <div className="ob-field">
                  <label>Business Name</label>
                  <input
                    placeholder="e.g. Joe's Plumbing"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    onBlur={handleNameBlur}
                  />
                </div>
                <div className="ob-field">
                  <label>
                    What industry are you in?
                    {suggestingIndustry && <span className="ob-suggest-spinner"> ✦</span>}
                  </label>
                  <input
                    placeholder="e.g. Plumbing, Bakery, Landscaping..."
                    value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  />
                  {industrySuggestions.length > 0 && (
                    <div className="ob-pills">
                      {industrySuggestions.map(s => (
                        <button
                          key={s}
                          type="button"
                          className={`ob-pill ${form.type === s ? 'ob-pill-active' : ''}`}
                          onClick={() => setForm(f => ({ ...f, type: s }))}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="ob-row">
                  <div className="ob-field">
                    <label>City</label>
                    <input
                      placeholder="e.g. Austin"
                      value={form.city}
                      onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                    />
                  </div>
                  <div className="ob-field ob-field-state">
                    <label>State</label>
                    <input
                      placeholder="TX"
                      maxLength={2}
                      value={form.state}
                      onChange={e => setForm(f => ({ ...f, state: e.target.value.toUpperCase() }))}
                    />
                  </div>
                </div>
                <div className="ob-field">
                  <label>About your business <span className="ob-optional">(optional)</span></label>
                  <textarea
                    placeholder="What makes you unique? Any special services, hours, or details..."
                    value={form.about}
                    rows={4}
                    onChange={e => setForm(f => ({ ...f, about: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          )}

        </div>

        <div className="ob-footer">
          {step > 1 && (
            <button className="ob-btn-back" onClick={() => setStep(s => s - 1)}>← Back</button>
          )}
          <button
            className="ob-btn-next"
            disabled={!canNext}
            onClick={() => setStep(s => s + 1)}
          >
            {step === 2 ? 'Build My Website →' : 'Next →'}
          </button>
        </div>

      </div>
    </div>
  )
}
