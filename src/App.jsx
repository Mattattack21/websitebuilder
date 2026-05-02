import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import './App.css'
import { supabase } from './utils/supabase'
import { generateWebsite } from './lib/generateWebsite'
import { redirectToCheckout } from './utils/stripe'
import Onboarding from './components/Onboarding'
import Dashboard from './components/Dashboard'
import FinishSetup from './components/FinishSetup'
import Success from './pages/Success'

export default function App() {
  const navigate = useNavigate()
  const [initializing, setInitializing] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showFinishSetup, setShowFinishSetup] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [user, setUser] = useState(null)
  const [siteHtml, setSiteHtml] = useState(null)
  const [businessData, setBusinessData] = useState(null)

  // ── Session restore on mount ───────────────────────────────
  useEffect(() => {
    async function restoreSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) return

        const sessionUser = session.user
        setUser(sessionUser)

        const { data: profile, error } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', sessionUser.id)
          .single()

        if (error && error.code !== 'PGRST116') {
          console.error('Profile fetch error:', error)
        }

        if (profile) {
          setSiteHtml(profile.site_html ?? null)
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
        } else {
          setShowFinishSetup(true)
        }
      } catch (err) {
        console.error('Session restore error:', err)
      } finally {
        setInitializing(false)
      }
    }

    restoreSession()
  }, [])

  // ── Called by Onboarding after auth ───────────────────────
  async function handleComplete(newUser, html, bData) {
    setUser(newUser)
    setSiteHtml(html)
    setBusinessData(bData ?? null)
    setShowOnboarding(false)
    navigate('/dashboard')

    try {
      const { data } = await supabase
        .from('user_profiles')
        .select('setup_complete')
        .eq('id', newUser.id)
        .single()

      if (!data?.setup_complete) setShowFinishSetup(true)
    } catch {
      setShowFinishSetup(true)
    }
  }

  // ── Called by FinishSetup on completion ───────────────────
  function handleFinishSetupComplete(updatedHtml, combinedData) {
    setSiteHtml(updatedHtml)
    if (combinedData) setBusinessData(combinedData)
    setShowFinishSetup(false)
  }

  // ── Regenerate from saved profile (returning user) ────────
  async function handleRegenerate() {
    if (!businessData?.businessName) {
      setShowOnboarding(true)
      return
    }
    setRegenerating(true)
    try {
      const html = await generateWebsite(businessData, user, () => {})
      setSiteHtml(html)
    } catch (err) {
      console.error('Regeneration failed:', err)
    } finally {
      setRegenerating(false)
    }
  }

  // ── Stripe checkout ───────────────────────────────────────
  async function handleCheckout() {
    setCheckoutLoading(true)
    try {
      await redirectToCheckout(user?.id)
    } catch (err) {
      console.error('Checkout error:', err)
      setCheckoutLoading(false)
    }
  }

  // ── Init splash ───────────────────────────────────────────
  if (initializing) {
    return (
      <div className="app-init">
        <span className="app-init-logo">siteforge<span>.</span></span>
      </div>
    )
  }

  // ── Authenticated: dashboard + modals ─────────────────────
  const dashboardView = (
    <>
      <Dashboard
        user={user}
        generatedHtml={siteHtml}
        regenerating={regenerating}
        onSiteUpdate={(html) => setSiteHtml(html)}
        onChangeTheme={() => setShowOnboarding(true)}
        onRegenerate={businessData?.businessName ? handleRegenerate : null}
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
          onClose={() => setShowOnboarding(false)}
          onComplete={handleComplete}
        />
      )}
    </>
  )

  // ── Landing / pricing page ────────────────────────────────
  const landingView = (
    <>
      <main className="hero">
        <nav className="nav">
          <span className="logo">siteforge<span className="logo-dot">.</span></span>
        </nav>

        <div className="hero-content">
          <div className="badge">AI-Powered Website Builder</div>
          <h1>Your Business Deserves a<br /><span className="gradient-text">Beautiful Website</span></h1>
          <p className="subheadline">Built in 60 seconds. No experience needed.</p>
          <button
            className="cta-btn"
            onClick={handleCheckout}
            disabled={checkoutLoading}
          >
            {checkoutLoading ? 'Loading…' : 'Start For $19.99/month'}
            {!checkoutLoading && <span className="cta-arrow">→</span>}
          </button>
          <p className="cta-note">Cancel anytime &nbsp;·&nbsp; Hosting, SSL &amp; AI updates included</p>
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
    </>
  )

  return (
    <Routes>
      {/* Stripe redirects here after successful payment */}
      <Route path="/success" element={<Success />} />

      {/* Dashboard — redirect to landing if not authenticated */}
      <Route
        path="/dashboard"
        element={user ? dashboardView : <Navigate to="/" replace />}
      />

      {/* Landing + /pricing (Stripe cancel URL target) */}
      <Route
        path="*"
        element={user ? <Navigate to="/dashboard" replace /> : landingView}
      />
    </Routes>
  )
}
