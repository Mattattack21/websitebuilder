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
  "heroSub": "one sentence expanding on the tagline, mentioning ${city}",
  "aboutHeadline": "compelling 4-6 word about-section headline",
  "about": "2-3 sentences about the business. Mention ${city} and what makes them great.",
  "service1Title": "First service name (2-4 words)",
  "service1Desc": "One sentence description of first service.",
  "service1Icon": "single emoji representing first service",
  "service2Title": "Second service name (2-4 words)",
  "service2Desc": "One sentence description of second service.",
  "service2Icon": "single emoji representing second service",
  "service3Title": "Third service name (2-4 words)",
  "service3Desc": "One sentence description of third service.",
  "service3Icon": "single emoji representing third service",
  "trust1": "2-4 word trust badge appropriate for a ${businessType} (e.g. 'Licensed & Insured', 'Family Owned', 'Free Estimates')",
  "trust2": "2-4 word trust badge appropriate for a ${businessType}",
  "trust3": "2-4 word trust badge appropriate for a ${businessType}",
  "review1Text": "Authentic-sounding 1-2 sentence customer review praising the business.",
  "review1Author": "Realistic reviewer name, first name + last initial (e.g. Sarah M.)",
  "review2Text": "Authentic-sounding 1-2 sentence customer review praising the business.",
  "review2Author": "Realistic reviewer name, first name + last initial",
  "review3Text": "Authentic-sounding 1-2 sentence customer review praising the business.",
  "review3Author": "Realistic reviewer name, first name + last initial"
}`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
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
    city, businessType,
    facebook, instagram, telDigits,
    heroPhotoUrl,
  } = params

  const {
    tagline, heroSub, aboutHeadline,
    about,
    service1Title, service1Desc, service1Icon,
    service2Title, service2Desc, service2Icon,
    service3Title, service3Desc, service3Icon,
    trust1, trust2, trust3,
    review1Text, review1Author,
    review2Text, review2Author,
    review3Text, review3Author,
  } = data

  const t = THEMES[theme] ?? THEMES.trustworthy

  const heroPhotoHtml = heroPhotoUrl
    ? `<img class="hero-bg" src="${heroPhotoUrl}" alt="${businessName}">`
    : ''

  const emailLine   = email         ? `<span>✉️ <a href="mailto:${email}">${email}</a></span>`  : ''
  const addressLine = address       ? `<span>📍 ${address}</span>`                               : ''
  const hoursLine   = businessHours ? `<span>🕐 ${businessHours}</span>`                        : ''

  const socialLinks = []
  if (facebook) socialLinks.push(`<a href="${facebook}" target="_blank" rel="noopener">Facebook</a>`)
  if (instagram) socialLinks.push(`<a href="${instagram}" target="_blank" rel="noopener">Instagram</a>`)
  const socialHtml = socialLinks.length
    ? `<div class="footer-social">${socialLinks.join('')}</div>`
    : ''

  const replacements = {
    BUSINESS_NAME:     businessName,
    PRIMARY:           t.primary,
    PRIMARY_DARK:      t.primaryDark,
    ACCENT:            t.accent,
    PHONE_RAW:         telDigits,
    PHONE:             phone || '',
    CITY:              city || '',
    INDUSTRY:          businessType || '',
    TAGLINE:           tagline,
    HERO_SUB:          heroSub || '',
    TRUST_1:           trust1 || '',
    TRUST_2:           trust2 || '',
    TRUST_3:           trust3 || '',
    HERO_PHOTO_HTML:   heroPhotoHtml,
    ABOUT_HEADLINE:    aboutHeadline || '',
    ABOUT:             about,
    SERVICE_1_ICON:    service1Icon || '🔧',
    SERVICE_1_TITLE:   service1Title,
    SERVICE_1_DESC:    service1Desc,
    SERVICE_2_ICON:    service2Icon || '🔧',
    SERVICE_2_TITLE:   service2Title,
    SERVICE_2_DESC:    service2Desc,
    SERVICE_3_ICON:    service3Icon || '🔧',
    SERVICE_3_TITLE:   service3Title,
    SERVICE_3_DESC:    service3Desc,
    REVIEW_1_TEXT:     review1Text || '',
    REVIEW_1_AUTHOR:   review1Author || 'Happy Customer',
    REVIEW_2_TEXT:     review2Text || '',
    REVIEW_2_AUTHOR:   review2Author || 'Happy Customer',
    REVIEW_3_TEXT:     review3Text || '',
    REVIEW_3_AUTHOR:   review3Author || 'Happy Customer',
    EMAIL_LINE:        emailLine,
    ADDRESS_LINE:      addressLine,
    HOURS_LINE:        hoursLine,
    SOCIAL_HTML:       socialHtml,
    USER_ID:           '',
    SUPABASE_URL:      process.env.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
    YEAR:              String(new Date().getFullYear()),
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
    fetchUnsplashPhotos(searchQuery, 1),
  ])

  console.log('[SF-SERVER] Unsplash photos fetched:', photos.length)

  return buildPage(themeVibe, data, {
    businessName, phone, email, businessHours, address,
    city, businessType,
    facebook, instagram, telDigits,
    heroPhotoUrl: photos[0] ?? null,
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
