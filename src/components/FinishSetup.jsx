import { useState, useRef } from 'react'
import { supabase } from '../utils/supabase'
import { generateWebsite } from '../lib/generateWebsite'
import './FinishSetup.css'

export default function FinishSetup({ user, currentHtml, businessData, onComplete }) {
  const [phone, setPhone] = useState('')
  const [displayEmail, setDisplayEmail] = useState('')
  const [hours, setHours] = useState('')
  const [address, setAddress] = useState('')
  const [facebookUrl, setFacebookUrl] = useState('')
  const [instagramUrl, setInstagramUrl] = useState('')
  const [photoPreview, setPhotoPreview] = useState(null)
  const [photoBase64, setPhotoBase64] = useState(null)
  const [photoMimeType, setPhotoMimeType] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)

  function handlePhotoChange(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target.result
      setPhotoPreview(dataUrl)
      const commaIdx = dataUrl.indexOf(',')
      const header = dataUrl.substring(5, commaIdx)
      setPhotoMimeType(header.split(';')[0])
      setPhotoBase64(dataUrl.substring(commaIdx + 1))
    }
    reader.readAsDataURL(file)
  }

  async function saveProfile(siteHtml) {
    try {
      await supabase.from('user_profiles').upsert({
        id: user.id,
        setup_complete: true,
        // Business info from onboarding
        business_name:        businessData?.businessName        ?? null,
        business_type:        businessData?.businessType        ?? null,
        city:                 businessData?.city                ?? null,
        state:                businessData?.state               ?? null,
        business_description: businessData?.businessDescription ?? null,
        theme_vibe:           businessData?.themeVibe           ?? null,
        // Contact info from this screen
        phone:          phone          || null,
        display_email:  displayEmail   || null,
        hours:          hours          || null,
        address:        address        || null,
        facebook_url:   facebookUrl    || null,
        instagram_url:  instagramUrl   || null,
        // Generated HTML
        site_html:      siteHtml       || null,
        updated_at: new Date().toISOString(),
      })
    } catch {
      // Non-blocking — setup still completes even if profile save fails
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!phone.trim()) return
    setLoading(true)
    setError(null)

    try {
      const newHtml = await generateWebsite(
        {
          ...(businessData ?? {}),
          phone,
          email: displayEmail,
          businessHours: hours,
          address,
          facebook: facebookUrl,
          instagram: instagramUrl,
          photoBase64,
          photoMimeType,
        },
        user,
        () => {}
      )
      await saveProfile(newHtml)
      onComplete(newHtml, {
        ...(businessData ?? {}),
        phone,
        email:         displayEmail,
        businessHours: hours,
        address,
        facebook:      facebookUrl,
        instagram:     instagramUrl,
      })
    } catch (err) {
      setError(err?.message ?? 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  async function handleSkip() {
    await supabase.from('user_profiles').upsert({
      id: user.id,
      setup_complete: true,
      updated_at: new Date().toISOString(),
    }).catch(() => {})
    onComplete(currentHtml)
  }

  if (loading) {
    return (
      <div className="fs-overlay">
        <div className="fs-loading-wrap">
          <div className="fs-loading-sparkle">✨</div>
          <h2>Adding your finishing touches...</h2>
          <p>We're personalizing your website with your business information.</p>
          <div className="fs-dots">
            <span /><span /><span />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fs-overlay">
      <div className="fs-scroll">
        <div className="fs-card">

          <div className="fs-brand">
            <span className="fs-logo">siteforge<span className="fs-logo-dot">.</span></span>
          </div>

          <div className="fs-header">
            <h1>Let's add the finishing touches 🎉</h1>
            <p>Just a few more details to make your website complete.</p>
          </div>

          <form onSubmit={handleSubmit} className="fs-form" noValidate>

            <div className="fs-field">
              <label>Phone Number <span className="fs-req">*</span></label>
              <input
                type="tel"
                placeholder="e.g. (555) 123-4567"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                required
              />
            </div>

            <div className="fs-field">
              <label>Email to Display on Site <span className="fs-opt">optional</span></label>
              <input
                type="email"
                placeholder="e.g. hello@yourbusiness.com"
                value={displayEmail}
                onChange={e => setDisplayEmail(e.target.value)}
              />
            </div>

            <div className="fs-field">
              <label>Business Hours <span className="fs-opt">optional</span></label>
              <input
                type="text"
                placeholder="e.g. Mon–Fri 9am–5pm, Sat 10am–3pm"
                value={hours}
                onChange={e => setHours(e.target.value)}
              />
            </div>

            <div className="fs-field">
              <label>Business Address or Service Area <span className="fs-opt">optional</span></label>
              <input
                type="text"
                placeholder='e.g. "123 Main St Dallas TX" or "Serving all of Dallas TX"'
                value={address}
                onChange={e => setAddress(e.target.value)}
              />
            </div>

            <div className="fs-row">
              <div className="fs-field">
                <label>Facebook URL <span className="fs-opt">optional</span></label>
                <input
                  type="url"
                  placeholder="https://facebook.com/yourbusiness"
                  value={facebookUrl}
                  onChange={e => setFacebookUrl(e.target.value)}
                />
              </div>
              <div className="fs-field">
                <label>Instagram URL <span className="fs-opt">optional</span></label>
                <input
                  type="url"
                  placeholder="https://instagram.com/yourbusiness"
                  value={instagramUrl}
                  onChange={e => setInstagramUrl(e.target.value)}
                />
              </div>
            </div>

            <div className="fs-field">
              <label>Business Photo <span className="fs-opt">optional</span></label>
              <p className="fs-hint">Add a photo of yourself or your business</p>
              <div
                className={`fs-photo-zone ${photoPreview ? 'fs-photo-zone--filled' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
              >
                {photoPreview ? (
                  <>
                    <img src={photoPreview} alt="Preview" className="fs-photo-img" />
                    <div className="fs-photo-change-overlay">Click to change photo</div>
                  </>
                ) : (
                  <div className="fs-photo-empty">
                    <span className="fs-photo-icon">📷</span>
                    <p>Click to upload a photo</p>
                    <span className="fs-photo-types">JPG, PNG or WEBP</span>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handlePhotoChange}
                className="fs-file-hidden"
              />
            </div>

            {error && <p className="fs-error">{error}</p>}

            <button
              type="submit"
              className="fs-cta"
              disabled={!phone.trim()}
            >
              Complete My Website →
            </button>

            <button type="button" className="fs-skip" onClick={handleSkip}>
              I'll do this later
            </button>

          </form>
        </div>
      </div>
    </div>
  )
}
