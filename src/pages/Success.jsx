import { useEffect, useState } from 'react'
import { supabase } from '../utils/supabase'
import './Success.css'

export default function Success() {
  const [done, setDone] = useState(false)

  useEffect(() => {
    async function activate() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
          await Promise.race([
            fetch('/.netlify/functions/mark-subscribed', {
              method: 'POST',
              headers: { Authorization: `Bearer ${session.access_token}` },
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
          ])
        }
      } catch (err) {
        console.warn('[Success] activate error:', err.message)
      }
      setDone(true)
      setTimeout(() => window.location.replace('/dashboard'), 1500)
    }
    activate()
  }, [])

  return (
    <div className="success-wrap">
      <div className="success-card">
        <div className="success-brand">
          siteforge<span className="success-brand-dot">.</span>
        </div>
        <div className="success-checkmark">✓</div>
        <h1>Payment Successful!</h1>
        <p className="success-sub">
          {done ? 'Redirecting to your dashboard…' : 'Activating your account…'}
        </p>
      </div>
      <div className="success-glow success-glow-1" />
      <div className="success-glow success-glow-2" />
    </div>
  )
}
