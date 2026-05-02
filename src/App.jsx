import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import './App.css'
import { supabase } from './utils/supabase'
import { generateWebsite } from './lib/generateWebsite'
import Onboarding from './components/Onboarding'
import Dashboard from './components/Dashboard'
import FinishSetup from './components/FinishSetup'
import Success from './pages/Success'

export default function App() {
  const navigate = useNavigate()
  const [initializing, setInitializing]   = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showFinishSetup, setShowFinishSetup] = useState(false)
  const [regenerating, setRegenerating]   = useState(false)
  const [user, setUser]                   = useState(null)
  const [siteHtml, setSiteHtml]           = useState(null)
  const [businessData, setBusinessData]   = useState(null)

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
    }).catch(() => {})

    return true
  }

  // ── Session restore on mount ──────────────────────────────────────────────
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
          // New user with no profile — check for data saved before Stripe redirect
          const hasPending = await loadPendingData(sessionUser.id)
          if (hasPending) setShowFinishSetup(true)
        }
      } catch (err) {
        console.error('Session restore error:', err)
      } finally {
        setInitializing(false)
      }
    }

    restoreSession()

    // React to new sign-ins from other pages (e.g. Success.jsx after Stripe)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user)
        const hasPending = await loadPendingData(session.user.id)
        if (hasPending) setShowFinishSetup(true)
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        setSiteHtml(null)
        setBusinessData(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

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
      }).catch(() => {})
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
  }

  // ── Called by FinishSetup on completion ───────────────────────────────────
  function handleFinishSetupComplete(updatedHtml, combinedData) {
    setSiteHtml(updatedHtml)
    if (combinedData) setBusinessData(combinedData)
    setShowFinishSetup(false)
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

  // ── Authenticated: dashboard + modals ─────────────────────────────────────
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
          user={user}
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
    </>
  )

  return (
    <Routes>
      <Route path="/success" element={<Success />} />
      <Route
        path="/dashboard"
        element={user ? dashboardView : <Navigate to="/" replace />}
      />
      <Route
        path="*"
        element={user ? <Navigate to="/dashboard" replace /> : landingView}
      />
    </Routes>
  )
}
