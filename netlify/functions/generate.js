import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY })

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const THEME_GUIDES = {
  trustworthy: {
    label: 'Trustworthy',
    css: `
Color palette: primary #1e3a5f (navy), accent #2563eb (blue), background #ffffff, text #1e293b, headings #0f172a.
Font: system-ui, -apple-system, sans-serif. Clean, readable, and professional.
Style: generous whitespace, subtle #e2e8f0 borders, soft box-shadows (0 2px 8px rgba(0,0,0,0.08)), rounded corners 8px.
Tone: professional and reassuring. Use words like "trusted", "reliable", "certified", "expert", "professional".`,
  },
  bold: {
    label: 'Bold',
    css: `
Color palette: background #0a0a0a, primary #ef4444 (red), accent #ffffff, text #f5f5f5, headings #ffffff.
Font: system-ui with heavy weights (800–900) for headings; clean sans-serif for body.
Style: high contrast, large impactful typography, red CTA buttons, minimal decoration, strong borders on cards.
Tone: confident and direct. Use words like "results", "powerful", "fast", "dominate", "get it done now".`,
  },
  warm: {
    label: 'Cute & Warm',
    css: `
Color palette: primary #ec4899 (pink), accent #f9a8d4 (light pink), background #fff0f6 (soft cream/pink), text #831843 (dark pink), headings #500724.
Font: system-ui; rounded corners (16–24px) everywhere — buttons, cards, inputs.
Style: soft pastel shadows, playful rounded shapes, heart or star emoji accents, friendly feel.
Tone: warm and personal. Use words like "friendly", "caring", "personal", "we love what we do", "here for you".`,
  },
  exciting: {
    label: 'Exciting',
    css: `
Color palette: primary #f97316 (orange), accent #facc15 (yellow), background #fff7ed, text #431407, headings #9a3412.
Hero background: use a bold linear-gradient(135deg, #f97316 0%, #facc15 100%).
Font: system-ui, bold weights 700–900. Dynamic, energetic layout.
Style: vibrant gradient sections, rounded cards, bold CTAs with gradient backgrounds, emoji accents.
Tone: enthusiastic and fun. Use words like "amazing", "exciting", "let's go", "we can't wait to help you".`,
  },
  elegant: {
    label: 'Elegant',
    css: `
Color palette: background #0c0c0c, primary #d4af37 (gold), accent #f5e6a3 (light gold), text #e5e0d8, headings #ffffff.
Font: Georgia, 'Times New Roman', serif for headings; system-ui for body.
Style: fine 1px gold borders, generous padding, luxury feel, uppercase letter-spacing (2–3px) on section labels.
Tone: refined and exclusive. Use words like "premium", "bespoke", "distinguished", "artisan", "curated".`,
  },
}

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

// ── Website generation ────────────────────────────────────────────────────────

async function handleGenerateWebsite({
  businessName, businessType, city, state, businessDescription,
  themeVibe, phone, email, businessHours, address, facebook, instagram,
  photoBase64, photoMimeType,
}) {
  const theme = THEME_GUIDES[themeVibe] ?? THEME_GUIDES.trustworthy
  const telDigits = phone ? phone.replace(/\D/g, '') : '5550000000'

  const contactBlock = [
    phone         ? `- Phone: ${phone}`                        : null,
    email         ? `- Email: ${email}`                        : null,
    businessHours ? `- Business Hours: ${businessHours}`       : null,
    address       ? `- Address / Service Area: ${address}`     : null,
    facebook      ? `- Facebook: ${facebook}`                  : null,
    instagram     ? `- Instagram: ${instagram}`                : null,
  ].filter(Boolean).join('\n')

  const prompt = `Build a complete single-page business website as raw HTML with all CSS in a <style> tag. No external files, CDNs, or frameworks.

BUSINESS:
- Name: ${businessName} | Type: ${businessType} | Location: ${city}, ${state}
${businessDescription ? `- About: ${businessDescription}` : ''}
${contactBlock}

THEME — "${theme.label}":
${theme.css}

SECTIONS (in order):
1. STICKY NAV — name left, click-to-call phone right.
2. HERO — headline with business name, tagline, CTA button, "📞 Call Us Today" button linking tel:${telDigits}.
3. ABOUT — 2 sentences of trust-building copy for this business.
4. SERVICES — 3 cards with emoji icon, title, 1-sentence description realistic for a ${businessType}.
5. CONTACT FORM — form id="contact-form", fields: name="name", name="phone", name="email", name="message", submit button.${businessHours ? ` Hours: ${businessHours}.` : ''}${address ? ` Address: ${address}.` : ''}
6. FOOTER — name, phone, email, address, socials, copyright.
7. FIXED MOBILE BAR — sticky "📞 Call Us Now" at bottom, tel:${telDigits}.${photoBase64 ? `\n8. PHOTO — place provided photo in hero/about, src="__BUSINESS_PHOTO__".` : ''}

OUTPUT FORMAT — CRITICAL:
- Your response MUST start with exactly: <!DOCTYPE html>
- Your response MUST end with exactly: </html>
- Do NOT write anything before <!DOCTYPE html> or after </html>
- Do NOT use markdown, code fences, backticks, or any explanation text
- ALL CSS must be inside a single <style> tag in <head> — no external stylesheets or CDN links
- Mobile-first responsive design, looks great at 375px wide`

  const messageContent = [{ type: 'text', text: prompt }]
  if (photoBase64) {
    messageContent.push({
      type: 'image',
      source: { type: 'base64', media_type: photoMimeType || 'image/jpeg', data: photoBase64 },
    })
  }

  const message = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 3000,
    messages: [{ role: 'user', content: messageContent }],
  })

  let raw = message.content[0].text.trim()
  // Strip code fences if Claude wrapped the output
  raw = raw.replace(/^```[\w]*\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  // Extract the HTML document — grab from <!DOCTYPE html> to </html>, discarding any preamble
  const docMatch = raw.match(/<!doctype\s+html[\s\S]*<\/html>/i)
  let html = docMatch ? docMatch[0] : raw

  if (photoBase64) {
    html = html.replace(
      'src="__BUSINESS_PHOTO__"',
      `src="data:${photoMimeType || 'image/jpeg'};base64,${photoBase64}"`
    )
  }

  return html
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

  const raw2 = message.content[0].text.trim()
    .replace(/^```[\w]*\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  const docMatch2 = raw2.match(/<!doctype\s+html[\s\S]*<\/html>/i)
  return docMatch2 ? docMatch2[0] : raw2
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
