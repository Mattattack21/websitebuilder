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

  const prompt = `Build a complete, professional single-page business website using ONLY inline styles. Do NOT use a <style> block or CSS classes. Every style must be written directly on the element as a style attribute, e.g. <div style="background: #1B3A6B; color: white; padding: 80px 40px;">.

BUSINESS: ${businessName} | ${businessType} | ${city}, ${state}${businessDescription ? ` | ${businessDescription}` : ''}
${contactBlock || ''}
THEME — "${theme.label}":
${theme.css}

FONTS: Use style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" on body. Use style="font-family: Georgia, serif" on hero headline.

SECTIONS (all required — style every element with inline styles):
1. NAV: position:fixed; top:0; left:0; right:0; z-index:1000, name left, phone pill-button right (tel:${telDigits}), semi-transparent background, box-shadow.
2. HERO: min-height:85vh, theme gradient background, large bold headline (font-family:Georgia,serif; font-size:60px), subheadline, two buttons (solid + outline), centered with display:flex; align-items:center; justify-content:center; flex-direction:column; text-align:center.
3. ABOUT: display:flex; gap:40px on desktop wrapper, accent bar (width:4px; height:40px inline block) before heading, 2-sentence copy, 3 trust stats side by side.
4. SERVICES: display:flex; flex-wrap:wrap; gap:24px wrapper, 3 cards each with emoji icon (font-size:40px), bold title, 1-sentence description, border-radius:12px, box-shadow:0 4px 16px rgba(0,0,0,0.1), padding:32px.
5. CONTACT FORM (NEVER OMIT): id="contact-form", fields name="name" name="phone" name="email" name="message", every input styled inline (padding:12px 16px; border-radius:8px; border:2px solid #ccc; width:100%; display:block; margin-bottom:16px), full-width submit button with gradient background.${businessHours ? ` Hours: ${businessHours}.` : ''}${address ? ` Address: ${address}.` : ''}
6. FOOTER: background:#111; color:#fff; padding:40px; text-align:center, name + copyright "© ${new Date().getFullYear()} ${businessName}", phone, email.
7. FIXED BUTTON: position:fixed; bottom:24px; right:24px; "📞 Call Now" → tel:${telDigits}, theme color background, border-radius:999px, box-shadow, padding:14px 24px; color:#fff; font-weight:700; text-decoration:none; display:inline-block.${photoBase64 ? `\n8. PHOTO: src="__BUSINESS_PHOTO__" style="border-radius:12px; max-width:100%; height:auto" in hero or about.` : ''}

JS RULES: only addEventListener/querySelector, one <script> before </body>, no eval/new Function.

OUTPUT: Start with <!DOCTYPE html>, end with </html>. No markdown, no code fences, no extra text. No <style> blocks whatsoever.`

  const messageContent = [{ type: 'text', text: prompt }]
  if (photoBase64) {
    messageContent.push({
      type: 'image',
      source: { type: 'base64', media_type: photoMimeType || 'image/jpeg', data: photoBase64 },
    })
  }

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 6000,
    messages: [{ role: 'user', content: messageContent }],
  })

  let raw = message.content[0].text.trim()
  console.log('[SF-SERVER] raw first 500:', raw.substring(0, 500))

  // Strip code fences if Claude wrapped the output
  raw = raw.replace(/^```[\w]*\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  // Extract the HTML document — grab from <!DOCTYPE html> to </html>, discarding any preamble
  const docMatch = raw.match(/<!doctype\s+html[\s\S]*<\/html>/i)
  let html = docMatch ? docMatch[0] : raw

  // Truncation recovery: if max_tokens cut the response short, close any open document
  if (!html.trimEnd().toLowerCase().endsWith('</html>')) {
    console.warn('[SF-SERVER] HTML appears truncated — patching close tags')
    html = html + '\n</body></html>'
  }

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
