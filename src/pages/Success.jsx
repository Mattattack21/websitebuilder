import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import './Success.css'

export default function Success() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function markSubscribed() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          await supabase.from('user_profiles').upsert({
            id: session.user.id,
            is_subscribed: true,
            updated_at: new Date().toISOString(),
          })
        }
      } catch {
        // Non-blocking
      } finally {
        setReady(true)
      }
    }
    markSubscribed()
  }, [])

  return (
    <div className="success-wrap">
      <div className="success-card">
        <div className="success-checkmark">✓</div>
        <h1>Welcome to SiteForge!</h1>
        <p className="success-sub">Your site is live and ready for customers.</p>
        <button
          className="success-btn"
          onClick={() => navigate('/dashboard')}
          disabled={!ready}
        >
          {ready ? 'Go to My Dashboard →' : 'Setting up your account…'}
        </button>
        <p className="success-note">Your subscription is active · Cancel anytime</p>
      </div>
      <div className="success-glow success-glow-1" />
      <div className="success-glow success-glow-2" />
    </div>
  )
}
