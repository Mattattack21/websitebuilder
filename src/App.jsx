import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import './App.css'
import { supabase } from './utils/supabase'
import { generateWebsite } from './lib/generateWebsite'
import { redirectToCheckout } from './utils/stripe'
import { deployWebsite } from './utils/deploy'
import Onboarding from './components/Onboarding'
import Dashboard from './components/Dashboard'
import FinishSetup from './components/FinishSetup'
import Auth from './components/Auth'
import Success from './pages/Success'

export default function App() {
  const navigate = useNavigate()
  const [initializing, setInitializing]     = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showFinishSetup, setShowFinishSetup] = useState(false)
  const [showAuth, setShowAuth]             = useState(false)
  const [authInitialTab, setAuthInitialTab] = useState('login')
  const [regenerating, setRegenerating]     = useState(false)
  const [user, setUser]                     = useState(null)
  const [siteHtml, setSiteHtml]             = useState(null)
  const [businessData, setBusinessData]     = useState(null)
  const [isSubscribed, setIsSubscribed]     = useState(null)
  const [stripeCustomerId, setStripeCustomerId] = useState(null)
  const [siteUrl, setSiteUrl]               = useState(null)
  const [deploying, setDeploying]           = useState(false)

  // ── Load website + business data saved to localStorage before Stripe redirect ──
  // Returns true if pending data was found and loaded.
  async function loadPendingData(userId) {
    const pendingHtml    = localStorage.getItem('sf_pending_html')
    const pendingDataStr = localStorage.getItem('sf_pending_data')
    if (!pendingHtml || !pendingDataStr) return false

    const bData = JSON.parse(pendingDataStr)

    // Clear before any async work so a page reload won't double-process
    localStorage.removeItem('sf_pending_html')
    localStorage.removeItem('sf_pending_data')

    setSiteHtml(pendingHtml)
    setBusinessData(bData)

    supabase.from('user_profiles').upsert({
      id:                   userId,
      site_html:            pendingHtml,
      theme_vibe:           bData.themeVibe           ?? null,
      business_name:        bData.businessName        ?? null,
      business_type:        bData.businessType        ?? null,
      city:                 bData.city                ?? null,
      state:                bData.state               ?? null,
      business_description: bData.businessDescription ?? null,
      setup_complete:       false,
      updated_at:           new Date().toISOString(),
    }).then(null, () => {})

    return true
  }

  async function loadUserProfile(userId) {
    const { data: profile, error } = await Promise.race([
      supabase.from('user_profiles').select('*').eq('id', userId).single(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('profile timeout')), 6000)),
    ]).catch(err => {
      console.error('Profile fetch error or timeout:', err.message)
      return { data: null, error: err }
    })

    if (error && error.code !== 'PGRST116') {
      console.error('Profile fetch error:', error.message ?? error)
    }

    if (profile) {
      setSiteHtml(profile.site_html ?? null)
      setIsSubscribed(profile.is_subscribed ?? false)
      setStripeCustomerId(profile.stripe_customer_id ?? null)
      setSiteUrl(profile.site_url ?? null)
      setBusinessData({
        themeVibe:           profile.theme_vibe,
        businessName:        profile.business_name,
        businessType:        profile.business_type,
        city:                profile.city,
        state:               profile.state,
        businessDescription: profile.business_description,
        phone:               profile.phone,
        email:               profile.display_email,
        businessHours:       profile.hours,
        address:             profile.address,
        facebook:            profile.facebook_url,
        instagram:           profile.instagram_url,
      })
      if (!profile.setup_complete) setShowFinishSetup(true)
      return { hasProfile: true, hasPending: false }
    }

    // New user with no profile — check for data saved before Stripe redirect
    const hasPending = await loadPendingData(userId)
    setIsSubscribed(false)
    return { hasProfile: false, hasPending }
  }

  // ── Session restore on mount ──────────────────────────────────────────────
  useEffect(() => {
    // If getSession hangs (stale token refresh, Supabase unreachable), abort
    // after 5 s and show the landing page. The aborted flag ensures any
    // late-resolving getSession/loadUserProfile result is silently discarded
    // so it can't redirect the user back into a loading loop.
    let aborted = false

    const fallback = setTimeout(() => {
      console.warn('[App] restoreSession timed out — unblocking UI')
      aborted = true
      setInitializing(false)
    }, 5000)

    async function restoreSession() {
      try {
        console.log('[App] restoreSession: calling getSession')
        const { data, error: sessionError } = await supabase.auth.getSession()

        if (aborted) {
          console.warn('[App] restoreSession: result arrived after timeout — discarding')
          return
        }

        console.log('[App] restoreSession: getSession returned', { session: !!data?.session, sessionError })

        if (sessionError) {
          console.error('[App] restoreSession: session error', sessionError)
          return
        }

        const session = data?.session
        if (!session?.user) {
          console.log('[App] restoreSession: no active session')
          return
        }

        console.log('[App] restoreSession: session found for', session.user.email)
        const sessionUser = session.user
        setUser(sessionUser)
        clearTimeout(fallback)
        if (!aborted) setInitializing(false)

        const { hasPending } = await loadUserProfile(sessionUser.id)
        if (!aborted && hasPending) setShowFinishSetup(true)
      } catch (err) {
        if (!aborted) console.error('[App] restoreSession: threw', err)
      } finally {
        clearTimeout(fallback)
        if (!aborted) setInitializing(false)
      }
    }

    restoreSession()

    // React to new sign-ins from other pages (e.g. Success.jsx after Stripe)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user)
        setShowAuth(false)
        const { hasPending } = await loadUserProfile(session.user.id)
        if (hasPending) setShowFinishSetup(true)
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        setSiteHtml(null)
        setBusinessData(null)
        setIsSubscribed(null)
        setStripeCustomerId(null)
        setSiteUrl(null)
      }
    })

    return () => { aborted = true; clearTimeout(fallback); subscription.unsubscribe() }
  }, [])

  // ── Deploy to Netlify after any HTML update ───────────────────────────────
  async function triggerDeploy(html, currentUser, bData) {
    const uid = (currentUser ?? user)?.id
    const name = (bData ?? businessData)?.businessName
    if (!uid || !html) return
    setDeploying(true)
    try {
      const url = await deployWebsite(html, uid, name)
      setSiteUrl(url)
    } catch (err) {
      console.error('Deploy failed:', err)
    } finally {
      setDeploying(false)
    }
  }

  // ── Called by Onboarding for authenticated users (theme change) ───────────
  async function handleComplete(existingUser, html, bData) {
    setUser(existingUser)
    setSiteHtml(html)
    setBusinessData(bData ?? null)
    setShowOnboarding(false)
    navigate('/dashboard')

    // Persist new theme/HTML to Supabase
    if (existingUser?.id && html) {
      supabase.from('user_profiles').upsert({
        id:                   existingUser.id,
        site_html:            html,
        theme_vibe:           bData?.themeVibe           ?? null,
        business_name:        bData?.businessName        ?? null,
        business_type:        bData?.businessType        ?? null,
        city:                 bData?.city                ?? null,
        state:                bData?.state               ?? null,
        business_description: bData?.businessDescription ?? null,
        updated_at:           new Date().toISOString(),
      }).then(null, () => {})
    }

    try {
      const { data } = await supabase
        .from('user_profiles')
        .select('setup_complete')
        .eq('id', existingUser.id)
        .single()
      if (!data?.setup_complete) setShowFinishSetup(true)
    } catch {
      setShowFinishSetup(true)
    }

    triggerDeploy(html, existingUser, bData)
  }

  // ── Called by FinishSetup on completion ───────────────────────────────────
  function handleFinishSetupComplete(updatedHtml, combinedData) {
    setSiteHtml(updatedHtml)
    if (combinedData) setBusinessData(combinedData)
    setShowFinishSetup(false)
    if (updatedHtml) triggerDeploy(updatedHtml, user, combinedData)
  }

  // ── Regenerate from saved profile ─────────────────────────────────────────
  async function handleRegenerate() {
    if (!businessData?.businessName) {
      setShowOnboarding(true)
      return
    }
    setRegenerating(true)
    try {
      const html = await generateWebsite(businessData, user, () => {})
      setSiteHtml(html)
      triggerDeploy(html, user, businessData)
    } catch (err) {
      console.error('Regeneration failed:', err)
    } finally {
      setRegenerating(false)
    }
  }

  // ── Init splash ───────────────────────────────────────────────────────────
  if (initializing) {
    return (
      <div className="app-init">
        <span className="app-init-logo">siteforge<span>.</span></span>
      </div>
    )
  }

  // ── Subscription gate ─────────────────────────────────────────────────────
  const subscriptionGate = isSubscribed === null
    ? (
      <div className="app-init">
        <span className="app-init-logo">siteforge<span>.</span></span>
      </div>
    )
    : <Navigate to="/pricing" replace />

  // ── Authenticated: dashboard + modals ─────────────────────────────────────
  const dashboardView = (
    <>
      <Dashboard
        user={user}
        generatedHtml={siteHtml}
        regenerating={regenerating}
        onSiteUpdate={(html) => { setSiteHtml(html); triggerDeploy(html, user, businessData) }}
        onChangeTheme={() => setShowOnboarding(true)}
        onRegenerate={businessData?.businessName ? handleRegenerate : null}
        stripeCustomerId={stripeCustomerId}
        siteUrl={siteUrl}
        deploying={deploying}
      />
      {showFinishSetup && (
        <FinishSetup
          user={user}
          currentHtml={siteHtml}
          businessData={businessData}
          onComplete={handleFinishSetupComplete}
        />
      )}
      {showOnboarding && (
        <Onboarding
          user={user}
          isSubscribed={isSubscribed}
          onClose={() => setShowOnboarding(false)}
          onComplete={handleComplete}
        />
      )}
    </>
  )

  // ── Landing page ──────────────────────────────────────────────────────────
  const landingView = (
    <>
      <main className="hero">
        <nav className="nav">
          <span className="logo">siteforge<span className="logo-dot">.</span></span>
          <button
            className="nav-login-btn"
            onClick={() => { setAuthInitialTab('login'); setShowAuth(true) }}
          >
            Log In
          </button>
        </nav>

        <div className="hero-content">
          <div className="badge">AI-Powered Website Builder</div>
          <h1>Your Business Deserves a<br /><span className="gradient-text">Beautiful Website</span></h1>
          <p className="subheadline">Built in 60 seconds. No experience needed.</p>
          <button className="cta-btn" onClick={() => setShowOnboarding(true)}>
            Build My Free Website <span className="cta-arrow">→</span>
          </button>
          <p className="cta-note">No credit card required &nbsp;·&nbsp; See your site before you pay</p>
        </div>

        <div className="glow glow-1" />
        <div className="glow glow-2" />
      </main>

      {showOnboarding && (
        <Onboarding
          onClose={() => setShowOnboarding(false)}
          onComplete={handleComplete}
        />
      )}

      {showAuth && (
        <Auth
          initialTab={authInitialTab}
          onSuccess={() => setShowAuth(false)}
          onBack={() => setShowAuth(false)}
        />
      )}
    </>
  )

  // ── Pricing page (for authenticated unsubscribed users) ───────────────────
  const pricingView = user ? (
    <main className="hero">
      <nav className="nav">
        <span className="logo">siteforge<span className="logo-dot">.</span></span>
      </nav>
      <div className="hero-content">
        <div className="badge">One More Step</div>
        <h1>Subscribe to <span className="gradient-text">Activate Your Website</span></h1>
        <p className="subheadline">$19.99/month — cancel anytime.</p>
        <button className="cta-btn" onClick={() => redirectToCheckout(user.id, user.email)}>
          Subscribe Now <span className="cta-arrow">→</span>
        </button>
        <p className="cta-note" style={{ marginTop: 24 }}>
          Already paid?{' '}
          <button
            style={{ background: 'none', border: 'none', color: '#7c3aed', fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: 'inherit' }}
            onClick={() => loadUserProfile(user.id)}
          >
            Refresh my account →
          </button>
        </p>
      </div>
      <div className="glow glow-1" />
      <div className="glow glow-2" />
    </main>
  ) : <Navigate to="/" replace />

  return (
    <Routes>
      <Route path="/success" element={<Success />} />
      <Route path="/pricing" element={pricingView} />
      <Route
        path="/dashboard"
        element={
          !user
            ? <Navigate to="/" replace />
            : isSubscribed
              ? dashboardView
              : subscriptionGate
        }
      />
      <Route
        path="*"
        element={user ? <Navigate to="/dashboard" replace /> : landingView}
      />
    </Routes>
  )
}
