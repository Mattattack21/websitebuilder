import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { join } from 'path'

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY })

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// Loaded once on cold start — included_files ensures this path exists in Lambda
const TEMPLATE = readFileSync(join(process.cwd(), 'src/templates/base.html'), 'utf8')

// ── Google Fonts imports per theme ────────────────────────────────────────────

const FONT_IMPORTS = {
  trustworthy: "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Playfair+Display:wght@700;900&display=swap');",
  bold:        "@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@600;700&family=Open+Sans:wght@400;600&display=swap');",
  warm:        "@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=Quicksand:wght@500;600;700&display=swap');",
  exciting:    "@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800;900&family=Raleway:wght@400;600&display=swap');",
  elegant:     "@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Libre+Baskerville:wght@400;700&display=swap');",
}

// ── Theme CSS variable sets ───────────────────────────────────────────────────

const THEMES = {
  trustworthy: {
    primary:     '#1B3A6B',
    primaryDark: '#0f2547',
    accent:      '#2563eb',
    text:        '#1e293b',
    bg:          '#f8fafc',
    surface:     '#ffffff',
    headingFont: "'Playfair Display', Georgia, serif",
    bodyFont:    "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  bold: {
    primary:     '#CC0000',
    primaryDark: '#1a1a1a',
    accent:      '#FF0000',
    text:        '#f0f0f0',
    bg:          '#000000',
    surface:     '#111111',
    headingFont: "'Oswald', sans-serif",
    bodyFont:    "'Open Sans', system-ui, sans-serif",
  },
  warm: {
    primary:     '#d4547a',
    primaryDark: '#3d1a24',
    accent:      '#FF69B4',
    text:        '#5c2d3a',
    bg:          '#FFFDD0',
    surface:     '#fff0f3',
    headingFont: "'Quicksand', 'Nunito', sans-serif",
    bodyFont:    "'Nunito', system-ui, sans-serif",
  },
  exciting: {
    primary:     '#FF6B35',
    primaryDark: '#7a2500',
    accent:      '#e6a800',
    text:        '#1a0a00',
    bg:          '#fff8f0',
    surface:     '#ffffff',
    headingFont: "'Montserrat', sans-serif",
    bodyFont:    "'Raleway', system-ui, sans-serif",
  },
  elegant: {
    primary:     '#C9A84C',
    primaryDark: '#0a0a0a',
    accent:      '#e8d5a3',
    text:        '#d4c9b8',
    bg:          '#1A1A1A',
    surface:     '#242424',
    headingFont: "'Cormorant Garamond', 'Libre Baskerville', serif",
    bodyFont:    "'Libre Baskerville', Georgia, serif",
  },
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  try {
    const body = JSON.parse(event.body)

    if (body.type === 'website') {
      const html = await handleGenerateWebsite(body)
      return ok({ html })
    }

    if (body.type === 'update') {
      const html = await handleUpdateWebsite(body)
      return ok({ html })
    }

    if (body.type === 'support') {
      const answer = await handleSupportQuestion(body)
      return ok({ answer })
    }

    if (body.type === 'suggest') {
      const suggestions = await handleSuggestIndustry(body)
      return ok({ suggestions })
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Unknown type' }) }
  } catch (err) {
    console.error('generate function error:', err)
    const isTimeout = err.code === 'ECONNRESET' || err.message?.includes('timeout') || err.status === 529
    return {
      statusCode: isTimeout ? 504 : 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: isTimeout
          ? 'Generation timed out. Please try again — it usually works on the second attempt.'
          : (err.message ?? 'Internal server error'),
      }),
    }
  }
}

function ok(data) {
  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }
}

// ── Unsplash photo fetch ──────────────────────────────────────────────────────

async function fetchUnsplashPhotos(query, count = 4) {
  const key = process.env.UNSPLASH_ACCESS_KEY
  if (!key) return []
  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&orientation=landscape&per_page=${count}`
    const res = await fetch(url, { headers: { Authorization: `Client-ID ${key}` } })
    if (!res.ok) return []
    const data = await res.json()
    return (data.results || []).map(p => `${p.urls.raw}&w=1600&h=900&fit=crop&auto=format&q=80`)
  } catch {
    return []
  }
}

// ── SVG logo generator ────────────────────────────────────────────────────────

function generateLogoSvg(businessName, primaryColor) {
  const letter = (businessName.trim()[0] || 'B').toUpperCase()
  return `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36" style="flex-shrink:0"><circle cx="18" cy="18" r="18" fill="${primaryColor}"/><text x="18" y="24" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" font-weight="700" fill="white">${letter}</text></svg>`
}

// ── Phase 1: Sonnet generates content JSON (fast, ~800 tokens out) ────────────

async function generateContentJson({ businessName, businessType, city, state, businessDescription }) {
  const prompt = `Generate website content for this business as JSON. Output valid JSON only — no explanation, no markdown, no code fences.

Business: ${businessName}, a ${businessType} in ${city}, ${state}${businessDescription ? `. ${businessDescription}` : ''}.

Return exactly this JSON structure:
{
  "tagline": "compelling 6-10 word hero headline",
  "about": "2-3 sentences about the business. Mention ${city} and what makes them great.",
  "service1Title": "First service name (2-4 words)",
  "service1Desc": "One sentence description of first service.",
  "service2Title": "Second service name (2-4 words)",
  "service2Desc": "One sentence description of second service.",
  "service3Title": "Third service name (2-4 words)",
  "service3Desc": "One sentence description of third service.",
  "review1": "Authentic-sounding 1-2 sentence customer review praising the business.",
  "review2": "Authentic-sounding 1-2 sentence customer review praising the business.",
  "review3": "Authentic-sounding 1-2 sentence customer review praising the business."
}`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].text.trim()
  console.log('[SF-SERVER] Phase 1 JSON:', raw.substring(0, 300))
  const match = raw.match(/\{[\s\S]*\}/)
  return JSON.parse(match ? match[0] : raw)
}

// ── Phase 2: Fill template with content and theme ─────────────────────────────

function buildPage(theme, data, params) {
  const {
    businessName, phone, email, businessHours, address,
    photoBase64, photoMimeType, telDigits,
    heroPhotoUrl, aboutPhotoUrl, servicePhoto1Url, servicePhoto2Url,
  } = params

  const {
    tagline,
    about,
    service1Title, service1Desc,
    service2Title, service2Desc,
    service3Title, service3Desc,
    review1, review2, review3,
  } = data

  const t = THEMES[theme] ?? THEMES.trustworthy

  const cssVars = [
    `--primary: ${t.primary}`,
    `--primary-dark: ${t.primaryDark}`,
    `--accent: ${t.accent}`,
    `--text: ${t.text}`,
    `--bg: ${t.bg}`,
    `--surface: ${t.surface}`,
    `--heading-font: ${t.headingFont}`,
    `--body-font: ${t.bodyFont}`,
  ].join(';\n  ') + ';'

  // Hero background: photo with dark overlay, or gradient fallback
  const heroBg = heroPhotoUrl
    ? `linear-gradient(rgba(0,0,0,0.52), rgba(0,0,0,0.62)), url('${heroPhotoUrl}') center/cover no-repeat`
    : `linear-gradient(160deg, ${t.primary} 0%, ${t.primaryDark} 100%)`

  // Optional blocks
  const navCall = phone
    ? `<a href="tel:${telDigits}" class="nav-call">📞 ${phone}</a>`
    : ''

  const callBar = phone
    ? `<a href="tel:${telDigits}" class="call-bar">📞 Call Now — ${phone}</a>`
    : ''

  const phoneFooter  = phone         ? `<a href="tel:${telDigits}" class="footer-link">📞 ${phone}</a>`              : ''
  const emailFooter  = email         ? `<a href="mailto:${email}" class="footer-link">✉️ ${email}</a>`               : ''
  const addressFooter = address      ? `<p class="footer-link">📍 ${address}</p>`                                     : ''
  const hoursFooter  = businessHours ? `<p class="footer-link">🕐 ${businessHours}</p>`                              : ''

  // Photo blocks
  const aboutPhotoHtml = aboutPhotoUrl
    ? `<div class="about-photo"><img src="${aboutPhotoUrl}" alt="${businessName}" loading="lazy"></div>`
    : (photoBase64 ? `<div class="about-photo"><img src="data:${photoMimeType||'image/jpeg'};base64,${photoBase64}" alt="${businessName}"></div>` : '')

  const servicePhoto1Html = servicePhoto1Url
    ? `<div class="service-photo"><img src="${servicePhoto1Url}" alt="${service1Title}" loading="lazy"></div>`
    : ''

  const servicePhoto2Html = servicePhoto2Url
    ? `<div class="service-photo"><img src="${servicePhoto2Url}" alt="${service2Title}" loading="lazy"></div>`
    : ''

  const replacements = {
    FONT_IMPORT:        FONT_IMPORTS[theme] ?? FONT_IMPORTS.trustworthy,
    CSS_VARS:           cssVars,
    LOGO_SVG:           generateLogoSvg(businessName, t.primary),
    HERO_BG:            heroBg,
    BUSINESS_NAME:      businessName,
    TAGLINE:            tagline,
    PHONE:              phone || '',
    TEL_DIGITS:         telDigits,
    EMAIL:              email || '',
    ADDRESS:            address || '',
    HOURS:              businessHours || '',
    ABOUT:              about,
    ABOUT_PHOTO_HTML:   aboutPhotoHtml,
    SERVICE_1_TITLE:    service1Title,
    SERVICE_1_DESC:     service1Desc,
    SERVICE_2_TITLE:    service2Title,
    SERVICE_2_DESC:     service2Desc,
    SERVICE_3_TITLE:    service3Title,
    SERVICE_3_DESC:     service3Desc,
    SERVICE_PHOTO_1_HTML: servicePhoto1Html,
    SERVICE_PHOTO_2_HTML: servicePhoto2Html,
    REVIEW_1:           review1,
    REVIEW_2:           review2,
    REVIEW_3:           review3,
    NAV_CALL:           navCall,
    PHONE_FOOTER:       phoneFooter,
    EMAIL_FOOTER:       emailFooter,
    ADDRESS_FOOTER:     addressFooter,
    HOURS_FOOTER:       hoursFooter,
    CALL_BAR:           callBar,
    YEAR:               String(new Date().getFullYear()),
  }

  let html = TEMPLATE
  for (const [key, val] of Object.entries(replacements)) {
    html = html.replaceAll(`{{${key}}}`, val)
  }
  return html
}

// ── Website generation ────────────────────────────────────────────────────────

async function handleGenerateWebsite({
  businessName, businessType, city, state, businessDescription,
  themeVibe, phone, email, businessHours, address, facebook, instagram,
  photoBase64, photoMimeType,
}) {
  const telDigits = phone ? phone.replace(/\D/g, '') : ''

  // Phase 1 + Unsplash run concurrently
  const searchQuery = [businessType, city].filter(Boolean).join(' ')
  const [data, photos] = await Promise.all([
    generateContentJson({ businessName, businessType, city, state, businessDescription }),
    fetchUnsplashPhotos(searchQuery, 4),
  ])

  console.log('[SF-SERVER] Unsplash photos fetched:', photos.length)

  return buildPage(themeVibe, data, {
    businessName, phone, email, businessHours, address,
    facebook, instagram, photoBase64, photoMimeType, telDigits,
    heroPhotoUrl:    photos[0] ?? null,
    aboutPhotoUrl:   photos[1] ?? null,
    servicePhoto1Url: photos[2] ?? null,
    servicePhoto2Url: photos[3] ?? null,
  })
}

// ── Content update ────────────────────────────────────────────────────────────

async function handleUpdateWebsite({ currentHtml, request }) {
  const prompt = `You are editing an existing business website. Apply the user's requested change and return the full updated HTML.

User's request: "${request}"

Current website HTML:
${currentHtml}

Requirements:
1. Apply the requested change. Keep everything else exactly the same.
2. Output ONLY the complete updated HTML — no markdown, no code fences, no explanation.
3. Start with <!DOCTYPE html> and end with </html>.`

  const message = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].text.trim()
    .replace(/^```[\w]*\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  const docMatch = raw.match(/<!doctype\s+html[\s\S]*<\/html>/i)
  return docMatch ? docMatch[0] : raw
}

// ── Industry suggestions ──────────────────────────────────────────────────────

async function handleSuggestIndustry({ businessName }) {
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 80,
    messages: [{
      role: 'user',
      content: `Based on the business name "${businessName}", suggest 3-4 short industry categories (1-3 words each). Return ONLY a JSON array, nothing else. Example: ["Landscaping","Floral Design","Garden Center"]. If the name is too generic or unclear, return ["Retail","Service Business","Restaurant","Contractor"].`,
    }],
  })

  const raw = message.content[0].text.trim()
  const match = raw.match(/\[[\s\S]*\]/)
  try {
    return JSON.parse(match ? match[0] : '[]')
  } catch {
    return ['Retail', 'Service Business', 'Restaurant', 'Contractor']
  }
}

// ── Support chat ──────────────────────────────────────────────────────────────

async function handleSupportQuestion({ question }) {
  const message = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 400,
    system: `You are a friendly, helpful support assistant for SiteForge — an AI-powered website builder for small businesses.
Key facts:
- SiteForge builds professional websites in 60 seconds using AI
- Plan: $19.99/month, all-inclusive, cancel anytime
- Features: AI website generation, lead forms, click-to-call, theme changes, content updates, hosting, SSL, mobile-ready
- Support email: support@siteforge.co
Keep answers short, warm, and plain — no jargon. Write as if helping someone who is not tech-savvy. If unsure, suggest emailing support@siteforge.co.`,
    messages: [{ role: 'user', content: question }],
  })

  return message.content[0].text
}
