import { useState, useEffect, useRef } from 'react'
import { supabase } from '../utils/supabase'
import { updateWebsite, askSupportQuestion } from '../lib/generateWebsite'
import { redirectToPortal } from '../utils/stripe'
import './Dashboard.css'

const TABS = [
  { id: 'website', icon: '🌐', label: 'My Website' },
  { id: 'leads',   icon: '📋', label: 'My Leads'   },
  { id: 'plan',    icon: '💳', label: 'My Plan'    },
  { id: 'help',    icon: '❓', label: 'Help'        },
]

const FAQS = [
  {
    q: 'How do I update my website?',
    a: 'Click the "Update My Content" button on the My Website tab. Type what you\'d like to change — for example, "Update my phone number to 555-1234" — and we\'ll apply it automatically.',
  },
  {
    q: 'How do customer leads work?',
    a: 'When someone fills out the contact form on your website, their name, phone, and email show up automatically in your Leads tab. You\'ll never miss a new inquiry.',
  },
  {
    q: 'Can I use my own domain name?',
    a: 'Yes! Contact us at support@siteforge.co and we\'ll connect your custom domain (like www.yourbusiness.com) for you — no technical knowledge needed.',
  },
  {
    q: 'How do I cancel my subscription?',
    a: 'Go to the My Plan tab and click "Cancel Subscription." You can cancel anytime and your website stays live until the end of your billing period.',
  },
  {
    q: 'What if I want a completely different look for my website?',
    a: 'Click "Change My Theme" on the My Website tab. You\'ll be taken back to pick a new style and we\'ll rebuild your website with a fresh design.',
  },
]

export default function Dashboard({ user, generatedHtml, regenerating, onSiteUpdate, onChangeTheme, onRegenerate, stripeCustomerId, siteUrl, deploying }) {
  const [activeTab, setActiveTab]   = useState('website')
  const [siteHtml, setSiteHtml]     = useState(generatedHtml)
  const [siteUrl, setSiteUrl]       = useState(null)
  const siteUrlRef                  = useRef(null)

  // Create a blob URL whenever siteHtml changes; revoke the previous one
  useEffect(() => {
    if (!siteHtml) return
    const blob = new Blob([siteHtml], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    if (siteUrlRef.current) URL.revokeObjectURL(siteUrlRef.current)
    siteUrlRef.current = url
    setSiteUrl(url)
    return () => {
      URL.revokeObjectURL(url)
      siteUrlRef.current = null
    }
  }, [siteHtml])

  // Leads
  const [leads, setLeads] = useState([])
  const [leadsLoading, setLeadsLoading] = useState(true)

  async function fetchLeads() {
    if (!user) return
    try {
      const { data } = await supabase
        .from('leads')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      setLeads(data ?? [])
    } catch {
      // Silently fail — leads are non-critical
    } finally {
      setLeadsLoading(false)
    }
  }

  useEffect(() => {
    fetchLeads()
    const interval = setInterval(fetchLeads, 60_000)
    return () => clearInterval(interval)
  }, [user])

  // Update content
  const [showUpdatePanel, setShowUpdatePanel] = useState(false)
  const [updateRequest, setUpdateRequest] = useState('')
  const [updating, setUpdating] = useState(false)
  const [updateProgress, setUpdateProgress] = useState(0)
  const [updateError, setUpdateError] = useState(null)

  // Copy link
  const [copied, setCopied] = useState(false)

  function handleCopyLink() {
    if (!siteUrl) return
    navigator.clipboard.writeText(siteUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // Billing portal
  const [portalLoading, setPortalLoading] = useState(false)

  async function handleOpenPortal() {
    if (!stripeCustomerId || portalLoading) return
    setPortalLoading(true)
    try {
      await redirectToPortal(stripeCustomerId)
    } catch {
      setPortalLoading(false)
    }
  }

  // Help chat
  const [helpQuestion, setHelpQuestion] = useState('')
  const [helpAnswer, setHelpAnswer] = useState('')
  const [helpLoading, setHelpLoading] = useState(false)
  const [openFaq, setOpenFaq] = useState(null)

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.reload()
  }

  async function handleUpdateSubmit(e) {
    e.preventDefault()
    if (!updateRequest.trim()) return
    setUpdating(true)
    setUpdateProgress(0)
    setUpdateError(null)

    try {
      const html = await updateWebsite(
        { currentHtml: siteHtml, request: updateRequest },
        user,
        (pct) => setUpdateProgress(pct)
      )
      setSiteHtml(html)
      onSiteUpdate(html)
      setUpdateRequest('')
      setShowUpdatePanel(false)
    } catch (err) {
      setUpdateError('Something went wrong. Please try again.')
    } finally {
      setUpdating(false)
    }
  }

  async function handleHelpSubmit(e) {
    e.preventDefault()
    if (!helpQuestion.trim() || helpLoading) return
    setHelpAnswer('')
    setHelpLoading(true)
    try {
      await askSupportQuestion(helpQuestion, (chunk) => {
        setHelpAnswer(prev => prev + chunk)
      })
    } catch {
      setHelpAnswer('Sorry, something went wrong. Please email support@siteforge.co for help.')
    } finally {
      setHelpLoading(false)
    }
  }

  return (
    <div className="dash-wrap">

      {/* ── Top nav ───────────────────────────────────── */}
      <nav className="dash-nav">
        <span className="dash-logo">siteforge<span className="dash-logo-dot">.</span></span>
        <div className="dash-nav-right">
          <span className="dash-email">{user?.email}</span>
          <button className="dash-logout-btn" onClick={handleLogout}>Log Out</button>
        </div>
      </nav>

      {/* ── Tab bar ───────────────────────────────────── */}
      <div className="dash-tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`dash-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="dash-tab-icon">{tab.icon}</span>
            <span className="dash-tab-label">{tab.label}</span>
            {tab.id === 'leads' && leads.length > 0 && (
              <span className="dash-lead-badge">{leads.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content ───────────────────────────────── */}
      <main className="dash-main">

        {/* MY WEBSITE ───────────────────────────────── */}
        {activeTab === 'website' && (
          <div className="dash-section">
            <div className="dash-section-header">
              <div>
                <h2>My Website</h2>
                <p>This is what your customers see when they visit your site.</p>
              </div>
            </div>

            <div className="dash-website-actions">
              <button className="dash-action-btn secondary" onClick={onChangeTheme}>
                🎨 Change My Theme
              </button>
              <button
                className="dash-action-btn secondary"
                onClick={() => { setShowUpdatePanel(v => !v); setUpdateError(null) }}
              >
                ✏️ Update My Content
              </button>
            </div>

            {deploying ? (
              <div className="dash-site-status">
                <div className="dash-regen-spinner" />
                <span>Publishing your site...</span>
              </div>
            ) : siteUrl ? (
              <div className="dash-site-status live">
                <span className="dash-site-live-dot" />
                <span className="dash-site-url">{siteUrl}</span>
                <a
                  href={siteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dash-action-btn secondary dash-site-btn"
                >
                  View Live Site ↗
                </a>
                <button className="dash-action-btn secondary dash-site-btn" onClick={handleCopyLink}>
                  {copied ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
            ) : null}

            {showUpdatePanel && (
              <div className="dash-update-panel">
                {updating ? (
                  <div className="dash-update-progress">
                    <p>Updating your website...</p>
                    <div className="dash-progress-track">
                      <div className="dash-progress-fill" style={{ width: `${updateProgress}%` }} />
                    </div>
                    <span className="dash-progress-pct">{updateProgress}%</span>
                  </div>
                ) : (
                  <form onSubmit={handleUpdateSubmit}>
                    <textarea
                      className="dash-update-textarea"
                      placeholder="Describe what you'd like to change... e.g. Update the phone number, add a lunch special, change the business hours"
                      value={updateRequest}
                      rows={4}
                      onChange={e => setUpdateRequest(e.target.value)}
                    />
                    {updateError && <p className="dash-error">{updateError}</p>}
                    <div className="dash-update-footer">
                      <button type="button" className="dash-action-btn ghost" onClick={() => setShowUpdatePanel(false)}>
                        Cancel
                      </button>
                      <button type="submit" className="dash-action-btn primary" disabled={!updateRequest.trim()}>
                        Apply Changes
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {siteHtml ? (
              <div className="dash-iframe-wrap">
                <iframe
                  key={siteUrl}
                  src={siteUrl}
                  title="Your website preview"
                />
              </div>
            ) : regenerating ? (
              <div className="dash-empty">
                <div className="dash-regen-spinner" />
                <p>Rebuilding your website...</p>
              </div>
            ) : (
              <div className="dash-empty">
                <div className="dash-empty-icon">🌐</div>
                <p>
                  {onRegenerate
                    ? 'Your website data is saved. Click below to rebuild it instantly.'
                    : 'Your website will appear here once it\'s generated.'}
                </p>
                <button
                  className="dash-action-btn primary"
                  onClick={onRegenerate ?? onChangeTheme}
                >
                  {onRegenerate ? '🔄 Regenerate My Website' : 'Build My Website'}
                </button>
                {onRegenerate && (
                  <button
                    className="dash-action-btn secondary"
                    style={{ marginTop: '10px' }}
                    onClick={onChangeTheme}
                  >
                    🎨 Start Over with New Theme
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* MY LEADS ────────────────────────────────── */}
        {activeTab === 'leads' && (
          <div className="dash-section">
            <div className="dash-section-header">
              <div>
                <h2>My Leads</h2>
                <p>Every time someone fills out your contact form, they'll show up here.</p>
              </div>
            </div>

            {leadsLoading ? (
              <div className="dash-leads-loading">
                <div className="dash-regen-spinner" />
                <p>Loading leads...</p>
              </div>
            ) : leads.length === 0 ? (
              <div className="dash-leads-empty">
                <div className="dash-empty-icon">📬</div>
                <h3>No leads yet</h3>
                <p>Your forms are live and ready! As soon as someone submits your contact form, their information will appear here.</p>
              </div>
            ) : (
              <div className="dash-table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Phone</th>
                      <th>Email</th>
                      <th>Message</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map(lead => (
                      <tr key={lead.id}>
                        <td>{lead.name || '—'}</td>
                        <td>
                          {lead.phone
                            ? <a href={`tel:${lead.phone.replace(/\D/g, '')}`}>{lead.phone}</a>
                            : '—'}
                        </td>
                        <td>
                          {lead.email
                            ? <a href={`mailto:${lead.email}`}>{lead.email}</a>
                            : '—'}
                        </td>
                        <td className="dash-table-message">{lead.message || '—'}</td>
                        <td className="dash-table-date">
                          {new Date(lead.created_at).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric'
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* MY PLAN ─────────────────────────────────── */}
        {activeTab === 'plan' && (
          <div className="dash-section">
            <div className="dash-section-header">
              <div>
                <h2>My Plan</h2>
                <p>Your current subscription details.</p>
              </div>
            </div>

            <div className="dash-plan-card">
              <div className="dash-plan-badge">Active</div>
              <div className="dash-plan-name">SiteForge All-In-One</div>
              <div className="dash-plan-price">$19.99<span>/month</span></div>
              <ul className="dash-plan-features">
                <li>✓ AI Website Generation</li>
                <li>✓ Up to 5 Pages</li>
                <li>✓ Lead Forms &amp; Click-to-Call</li>
                <li>✓ AI Content Updates</li>
                <li>✓ Hosting &amp; SSL Included</li>
                <li>✓ Mobile Ready &amp; SEO Optimized</li>
              </ul>
              <div className="dash-plan-billing">
                <span>Next billing date</span>
                <strong>—</strong>
              </div>
              <button
                className="dash-action-btn primary"
                onClick={handleOpenPortal}
                disabled={!stripeCustomerId || portalLoading}
              >
                {portalLoading ? 'Opening...' : 'Manage Billing'}
              </button>
            </div>

            <button
              className="dash-cancel-link"
              onClick={handleOpenPortal}
              disabled={!stripeCustomerId || portalLoading}
            >
              Cancel Subscription
            </button>
          </div>
        )}

        {/* HELP ────────────────────────────────────── */}
        {activeTab === 'help' && (
          <div className="dash-section">
            <div className="dash-section-header">
              <div>
                <h2>Help Center</h2>
                <p>Common questions and instant AI support.</p>
              </div>
            </div>

            <div className="dash-faqs">
              {FAQS.map((faq, i) => (
                <div key={i} className={`dash-faq ${openFaq === i ? 'open' : ''}`}>
                  <button className="dash-faq-q" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                    <span>{faq.q}</span>
                    <span className="dash-faq-arrow">{openFaq === i ? '▲' : '▼'}</span>
                  </button>
                  {openFaq === i && <div className="dash-faq-a">{faq.a}</div>}
                </div>
              ))}
            </div>

            <div className="dash-help-chat">
              <h3>Ask anything</h3>
              <p className="dash-help-sub">Get an instant answer about your account or website.</p>
              <form onSubmit={handleHelpSubmit}>
                <textarea
                  className="dash-update-textarea"
                  placeholder="Ask anything... e.g. How do I change my business hours?"
                  value={helpQuestion}
                  rows={3}
                  onChange={e => setHelpQuestion(e.target.value)}
                />
                <button
                  type="submit"
                  className="dash-action-btn primary"
                  disabled={!helpQuestion.trim() || helpLoading}
                >
                  {helpLoading ? 'Thinking...' : 'Ask'}
                </button>
              </form>

              {(helpAnswer || helpLoading) && (
                <div className="dash-help-answer">
                  {helpAnswer || <span className="dash-help-typing">●●●</span>}
                </div>
              )}
            </div>

            <div className="dash-help-contact">
              <span>Still need help?</span>
              <a href="mailto:support@siteforge.co">support@siteforge.co</a>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
