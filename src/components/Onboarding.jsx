import { useState, useEffect, useRef } from 'react'
import './Onboarding.css'
import { generateWebsite } from '../lib/generateWebsite'
import { redirectToCheckout } from '../utils/stripe'

const VIBES = [
  { id: 'trustworthy', icon: '🛡️', name: 'Trustworthy', desc: 'Professional, reliable, and clean' },
  { id: 'bold',        icon: '⚡',  name: 'Bold',        desc: 'Strong, confident, and impactful' },
  { id: 'warm',        icon: '🌿',  name: 'Warm',        desc: 'Inviting, natural, and human' },
  { id: 'exciting',    icon: '🚀',  name: 'Exciting',    desc: 'Energetic, dynamic, and fun' },
  { id: 'elegant',     icon: '💎',  name: 'Elegant',     desc: 'Refined, sophisticated, and luxurious' },
]

const BUSINESS_TYPES = ['Contractor', 'Restaurant', 'Salon', 'Retail', 'Fitness', 'Medical', 'Other']

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

export default function Onboarding({ onClose, onComplete, user }) {
  const [step, setStep]               = useState(1)
  const [vibe, setVibe]               = useState(null)
  const [form, setForm]               = useState({ name: '', type: '', city: '', state: '', about: '' })
  const [genProgress, setGenProgress] = useState(0)
  const [genMsgIdx, setGenMsgIdx]     = useState(0)
  const [generatedHtml, setGeneratedHtml] = useState(null)
  const [genError, setGenError]       = useState(null)
  const [countdown, setCountdown]     = useState(14 * 60 + 59)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError]     = useState(null)
  const cancelledRef = useRef(false)

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

    generateWebsite(
      {
        themeVibe:           vibe,
        businessName:        form.name,
        businessType:        form.type,
        city:                form.city,
        state:               form.state,
        businessDescription: form.about,
      },
      null, // No user — don't save to Supabase yet; persisted via localStorage before checkout
      (pct) => { if (!cancelledRef.current) setGenProgress(pct) }
    )
      .then(html => {
        if (cancelledRef.current) return
        setGeneratedHtml(html)
        setStep(4)
      })
      .catch(err => {
        if (cancelledRef.current) return
        console.error('Generation failed:', err)
        setGenError(err?.message ?? 'Something went wrong. Please try again.')
      })

    return () => { cancelledRef.current = true }
  }, [step])

  // Countdown timer — starts when pricing screen opens
  useEffect(() => {
    if (step !== 5) return
    setCountdown(14 * 60 + 59)
    const timer = setInterval(() => setCountdown(c => (c <= 1 ? 0 : c - 1)), 1000)
    return () => clearInterval(timer)
  }, [step])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const formValid = form.name.trim() && form.type && form.city.trim() && form.state.trim()
  const canNext   = (step === 1 && vibe) || (step === 2 && formValid)

  const countdownMins = String(Math.floor(countdown / 60)).padStart(2, '0')
  const countdownSecs = String(countdown % 60).padStart(2, '0')

  // ── Step 4: "Go live" handler ─────────────────────────────────────────────
  // Authenticated users (theme change) skip pricing and apply directly.
  // New users proceed to the pricing + Stripe checkout step.
  function handleGoLive() {
    if (user) {
      onComplete(user, generatedHtml, {
        themeVibe:           vibe,
        businessName:        form.name,
        businessType:        form.type,
        city:                form.city,
        state:               form.state,
        businessDescription: form.about,
      })
    } else {
      setStep(5)
    }
  }

  // ── Step 5: Stripe checkout ───────────────────────────────────────────────
  async function handleCheckout() {
    setCheckoutLoading(true)
    setCheckoutError(null)

    // Persist generated website + business data through the Stripe redirect.
    // App.jsx reads these from localStorage after the user signs up on /success.
    localStorage.setItem('sf_pending_html', generatedHtml)
    localStorage.setItem('sf_pending_data', JSON.stringify({
      themeVibe:           vibe,
      businessName:        form.name,
      businessType:        form.type,
      city:                form.city,
      state:               form.state,
      businessDescription: form.about,
    }))

    try {
      await redirectToCheckout(null, null)
    } catch (err) {
      console.error('Checkout error:', err)
      localStorage.removeItem('sf_pending_html')
      localStorage.removeItem('sf_pending_data')
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
            key={generatedHtml}
            className="ob-preview-iframe ob-fadein"
            srcDoc={generatedHtml}
            title="Your generated website"
          />
        </div>
      </div>
    )
  }

  // ── Step 5: Pricing → Stripe checkout ────────────────────────────────────
  if (step === 5) {
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

            <button className="ob-pricing-back" onClick={() => setStep(4)}>
              ← Back to preview
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
                  />
                </div>
                <div className="ob-field">
                  <label>Business Type</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                    <option value="">Select a type...</option>
                    {BUSINESS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
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
