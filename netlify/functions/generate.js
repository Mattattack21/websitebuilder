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
COLORS: background #ffffff, primary navy #1B3A6B, accent blue #2563eb, text #1e293b, headings #0f172a, section-bg #f8fafc.
FONTS: Georgia, 'Times New Roman', serif for headings (bold, authoritative); system-ui for body text.
STYLE: Clean professional layout. Large hero with business name in bold serif. Subtle box-shadows (0 4px 16px rgba(0,0,0,0.08)). Rounded corners 8px. Grid layout for service cards. Generous whitespace. Navy CTA buttons that turn slightly lighter on hover.
TRUST BADGES: Include a "Why Choose Us" row with 3 badges: "✓ Licensed & Insured", "⭐ 5-Star Rated", "💰 Free Estimates" — styled as pill badges in navy with white text.
HERO: Deep navy gradient background (linear-gradient(135deg, #1B3A6B 0%, #2563eb 100%)), white headline text, white subheadline, two white-outlined CTA buttons.
TONE: Professional and reassuring. Words like "trusted", "reliable", "certified", "expert", "professional".`,
  },
  bold: {
    label: 'Bold',
    css: `
COLORS: background #000000 (pure black), primary red #FF0000, accent white #ffffff, text #f5f5f5, headings #ffffff, card-bg #111111.
FONTS: system-ui with weight 900 for headings (massive, full-width). Clean sans-serif body.
STYLE: Full-width sections edge to edge. Giant typography — hero headline font-size min 64px. Pure black background throughout. Red CTA buttons with white text. Cards with 1px red border. Minimal decoration, maximum impact. Hover effects that turn red.
HERO: Black background, giant white headline taking up most of the hero, red accent line under it, bold red CTA button.
TONE: Aggressive and confident. Words like "dominate", "results", "powerful", "get it done", "no excuses".`,
  },
  warm: {
    label: 'Cute & Warm',
    css: `
COLORS: background #FFFDD0 (cream), primary pink #FFB6C1, accent #FF69B4 (hot pink), text #5c2d3a, headings #3d1a24, card-bg #fff0f3.
FONTS: system-ui with slightly rounded feel; body font-size 16px; warm friendly sizes.
STYLE: Rounded corners 20px on EVERYTHING — buttons, cards, inputs, sections. Soft pink box-shadows. Decorative heart (♥) and flower (✿) CSS elements in section headers. Pastel service cards with pink gradient backgrounds. Inputs with thick pink border on focus.
HERO: Soft pink-to-cream gradient (linear-gradient(135deg, #FFB6C1 0%, #FFFDD0 100%)), warm headline, decorative hearts.
TONE: Warm and personal. Words like "we love what we do", "caring", "friendly", "here for you", "our family serving yours".`,
  },
  exciting: {
    label: 'Exciting',
    css: `
COLORS: primary orange #FF6B35, accent yellow #FFE134, background #fff8f0, text #1a0a00, headings #cc3d00, card-bg #ffffff.
FONTS: system-ui weight 800-900 for headings. Bold and energetic throughout.
STYLE: Vibrant animated gradient hero using CSS @keyframes (animate the background-position of a orange-to-yellow gradient). Rounded cards with orange-to-yellow gradient border. Bold CTAs with gradient background. Section dividers as diagonal CSS shapes using clip-path. High energy layout.
HERO: Animated gradient (keyframes shifting orange→yellow→orange), large white headline, bright yellow CTA button with orange text.
TONE: Enthusiastic. Words like "amazing", "let's go", "we bring the energy", "get started today", "you deserve the best".`,
  },
  elegant: {
    label: 'Elegant',
    css: `
COLORS: background #1A1A1A (deep black), primary gold #C9A84C, accent #e8d5a3 (light gold), text #d4c9b8, headings #ffffff, section-bg #141414.
FONTS: Georgia, 'Times New Roman', serif for ALL headings. system-ui for body. Letter-spacing 2-3px on section labels (uppercase).
STYLE: Fine 1px gold borders on cards and sections. Generous padding (80px+ sections). Thin gold horizontal rules as dividers. Subtle gold box-shadow on cards. Uppercase section labels with wide letter-spacing. Hover effects that glow gold.
HERO: Near-black background with a very subtle gold radial gradient glow, large white serif headline, gold CTA button.
TONE: Refined and exclusive. Words like "premier", "bespoke", "distinguished", "artisan", "curated", "where excellence meets craft".`,
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

function injectBaseStyle(html) {
  return html.replace(/<head>/i, '<head><style>html,body{background:#fff}</style>')
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

  const prompt = `You are a professional web designer. Build a stunning single-page business website as a complete HTML document.

BUSINESS: ${businessName} | ${businessType} | ${city}, ${state}${businessDescription ? ` | ${businessDescription}` : ''}
${contactBlock || ''}
THEME — "${theme.label}": ${theme.css}

REQUIRED SECTIONS (all mandatory, in this order):
1. STICKY NAV: Name left, phone click-to-call (tel:${telDigits}) right. Fixed top. Theme background.
2. HERO (min-height 80vh): Theme gradient background. Bold headline with business name. Tagline. Two buttons: "Get a Free Quote" + "📞 Call Now" (tel:${telDigits}).
3. ABOUT: 2 sentences of specific copy for ${businessName} in ${city}. Decorative accent element.
4. SERVICES: 3 cards in a CSS grid (3-col desktop, 1-col mobile). Each: emoji icon, service name, 1-sentence description. Hover lift effect.
5. CONTACT FORM (MANDATORY — NEVER OMIT): Heading "Get a Free Quote". Form with id="contact-form". Fields: name="name" (text), name="phone" (tel), name="email" (email), name="message" (textarea). Styled submit button.${businessHours ? ` Hours: ${businessHours}.` : ''}${address ? ` Address: ${address}.` : ''}
6. FOOTER: Name, phone, email, address, socials, copyright "© ${new Date().getFullYear()} ${businessName}".
7. FIXED CALL BUTTON: position:fixed, bottom:24px, right:24px, z-index:9999. "📞 Call Now" → tel:${telDigits}.${photoBase64 ? `\n8. PHOTO: Show provided image in hero/about using src="__BUSINESS_PHOTO__".` : ''}

CSS: Gradients on hero + buttons. Box-shadows on cards. Hover transitions (0.2s). Hero fade-in @keyframes. Mobile-first, @media(min-width:768px) for desktop. Styled inputs with focus states.

OUTPUT RULES — CRITICAL:
- Start with <!DOCTYPE html>, end with </html>. Nothing before or after.
- No markdown, no code fences, no explanation text.
- All CSS in one <style> tag in <head>. No external resources.`

  const messageContent = [{ type: 'text', text: prompt }]
  if (photoBase64) {
    messageContent.push({
      type: 'image',
      source: { type: 'base64', media_type: photoMimeType || 'image/jpeg', data: photoBase64 },
    })
  }

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    messages: [{ role: 'user', content: messageContent }],
  })

  let raw = message.content[0].text.trim()
  // Strip code fences if Claude wrapped the output
  raw = raw.replace(/^```[\w]*\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  // Extract the HTML document — grab from <!DOCTYPE html> to </html>, discarding any preamble
  const docMatch = raw.match(/<!doctype\s+html[\s\S]*<\/html>/i)
  let html = docMatch ? docMatch[0] : raw

  // Truncation recovery: if max_tokens cut the response short, close any open document
  if (!html.trimEnd().toLowerCase().endsWith('</html>')) {
    console.warn('[SF] HTML appears truncated — patching close tags')
    html = html + '\n</body></html>'
  }

  if (photoBase64) {
    html = html.replace(
      'src="__BUSINESS_PHOTO__"',
      `src="data:${photoMimeType || 'image/jpeg'};base64,${photoBase64}"`
    )
  }

  return injectBaseStyle(html)
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
  return injectBaseStyle(docMatch2 ? docMatch2[0] : raw2)
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
